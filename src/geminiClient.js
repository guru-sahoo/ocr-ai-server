const fs = require("fs");
const pLimit = require("p-limit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Strict JSON prompt — no prose, no markdown.
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

async function analyzeOneCell(filePath, modelName = "gemini-1.5-pro") {
  const model = genAI.getGenerativeModel({ model: modelName });
  const imgB64 = fs.readFileSync(filePath).toString("base64");

  const result = await model.generateContent([
    { text: CELL_PROMPT },
    { inlineData: { mimeType: "image/png", data: imgB64 } },
  ]);

  const text = result?.response?.text?.() || "";
  // Attempt to parse strict JSON
  try {
    const parsed = JSON.parse(text);
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, "symbol")) {
      const norm =
        parsed.symbol === null ? null : String(parsed.symbol).toLowerCase();
      if (["triangle", "plus", "star"].includes(norm) || norm === null) {
        return { ok: true, symbol: norm };
      }
    }
  } catch (_) {}
  // Fallback: try to sanitize simple patterns
  const lower = text.toLowerCase();
  if (lower.includes("triangle"))
    return { ok: true, symbol: "triangle", raw: text };
  if (lower.includes("plus")) return { ok: true, symbol: "plus", raw: text };
  if (lower.includes("star")) return { ok: true, symbol: "star", raw: text };
  if (lower.includes("null") || lower.includes("empty"))
    return { ok: true, symbol: null, raw: text };
  return { ok: false, symbol: null, raw: text };
}

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
