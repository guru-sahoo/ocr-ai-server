// src/analyzeCells.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const pLimit = require("p-limit");
const { GoogleAuth } = require("google-auth-library");

// -------------------------------
// CONFIG
// -------------------------------
const PROJECT_ID = "tz-osepa-3"; // 🔹 replace with your GCP project
const LOCATION = "us-central1"; // 🔹 choose your region
const MODEL_ID = "gemini-2.5-pro"; // or gemini-1.5-flash

// -------------------------------
// PROMPT
// -------------------------------
const CELL_PROMPT = `
You are given a cropped image of a single table cell that may contain a handwritten symbol.

Allowed symbols and canonical labels:
- ▲  → "triangle"
- ✚  → "plus"
- ★  → "star"

Rules:
- If the cell clearly shows one of the allowed symbols, output {"symbol":"triangle"} or {"symbol":"plus"} or {"symbol":"star"}.
- If the cell is empty, smudged, or undecidable, output {"symbol":null}.
- Output MUST be valid, standalone JSON. No markdown, no extra fields, no commentary.
`;

// -------------------------------
// AUTH TOKEN HELPER
// -------------------------------
async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFile: path.join(__dirname, "service-account.json"), // 🔹 path to your service account JSON
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// -------------------------------
// CORE: Analyze one cell
// -------------------------------
async function analyzeOneCell(filePath) {
  const imgB64 = fs.readFileSync(filePath).toString("base64");
  const accessToken = await getAccessToken();

  try {
    const response = await axios.post(
      `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`,
      {
        contents: [
          { role: "user", parts: [{ text: CELL_PROMPT }] },
          {
            role: "user",
            parts: [{ inlineData: { mimeType: "image/png", data: imgB64 } }],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 60000, // ⏱️ 60s timeout for large requests
      }
    );

    const result = response.data;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // -------------------------------
    // JSON STRICT PARSING
    // -------------------------------
    try {
      const parsed = JSON.parse(text);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, "symbol")) {
        const norm =
          parsed.symbol === null ? null : String(parsed.symbol).toLowerCase();
        if (["triangle", "plus", "star"].includes(norm) || norm === null) {
          return { ok: true, symbol: norm };
        }
      }
    } catch (_) {
      // ignore and try fallback
    }

    // -------------------------------
    // FALLBACK SANITIZER
    // -------------------------------
    const lower = text.toLowerCase();
    if (lower.includes("triangle"))
      return { ok: true, symbol: "triangle", raw: text };
    if (lower.includes("plus")) return { ok: true, symbol: "plus", raw: text };
    if (lower.includes("star")) return { ok: true, symbol: "star", raw: text };
    if (lower.includes("null") || lower.includes("empty"))
      return { ok: true, symbol: null, raw: text };

    return { ok: false, symbol: null, raw: text };
  } catch (err) {
    if (err.response) {
      throw new Error(
        `Gemini API Error: ${err.response.status} ${JSON.stringify(
          err.response.data
        )}`
      );
    } else {
      throw new Error(`Request Failed: ${err.message}`);
    }
  }
}

// -------------------------------
// BATCH: Analyze multiple cells
// -------------------------------
async function analyzeCells(cells, { concurrency = 4 } = {}) {
  const limit = pLimit(concurrency);
  const tasks = cells.map((cell) =>
    limit(async () => {
      const res = await analyzeOneCell(cell.path);
      return { ...cell, ...res };
    })
  );
  return Promise.all(tasks);
}

module.exports = { analyzeCells };
