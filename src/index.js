require("dotenv").config();
const path = require("path");
const fs = require("fs-extra");

const loadOpenCV = require("./opencvLoader");
const { splitTableIntoCells } = require("./tableSplitter");
const { analyzeCells } = require("./geminiClient");

(async () => {
  try {
    const inputImage = path.join(__dirname, "..", "input", "table.jpg");
    const cellsDir = path.join(__dirname, "..", "output", "cells");
    const outJSON = path.join(__dirname, "..", "output", "result.json");

    await fs.ensureDir(path.dirname(outJSON));
    await fs.ensureDir(cellsDir);

    console.log("Loading OpenCV.js (WASM)...");
    const cv = await loadOpenCV();
    console.log("OpenCV.js ready.");

    console.log("Splitting table into cells...");
    const cells = await splitTableIntoCells(cv, inputImage, cellsDir, {
      threshBlockSize: 17,
      threshC: 7,
      horizScale: 28,
      vertScale: 28,
      minCellArea: 500,
      pad: 6,
    });
    console.log(`Crops generated: ${cells.length}`);

    console.log("Sending crops to Gemini (concurrency=4)...");
    const results = await analyzeCells(cells, { concurrency: 4 });

    // Build merged table JSON: [{row, col, symbol}]
    const merged = results
      .sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row))
      .map((r) => ({ row: r.row, col: r.col, symbol: r.symbol }));

    await fs.writeJson(outJSON, merged, { spaces: 2 });

    console.log("Done.");
    console.log("Saved:", outJSON);
  } catch (err) {
    console.error("FATAL:", err);
    process.exit(1);
  }
})();
