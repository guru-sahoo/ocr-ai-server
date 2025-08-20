// Detects table grid & saves cell crops in row/col order
const fs = require("fs-extra");
const path = require("path");
const { imreadToMat, imwriteFromMat } = require("./imageIO");
const { clusterRowsByY } = require("./util");

async function splitTableIntoCells(cv, inputPath, outDir, opts = {}) {
  const {
    threshBlockSize = 15, // adaptive threshold
    threshC = 9,
    horizScale = 30, // bigger => longer horizontal kernels
    vertScale = 30,
    minCellArea = 600, // drop tiny boxes
    pad = 4,
  } = opts;

  await fs.ensureDir(outDir);
  await fs.emptyDir(outDir);

  const src = await imreadToMat(cv, inputPath); // BGR
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_BGR2GRAY);

  // Adaptive threshold → binary inverted (lines bright)
  const bin = new cv.Mat();
  cv.adaptiveThreshold(
    gray,
    bin,
    255,
    cv.ADAPTIVE_THRESH_MEAN_C,
    cv.THRESH_BINARY_INV,
    threshBlockSize % 2 === 1 ? threshBlockSize : threshBlockSize + 1,
    threshC
  );

  // Horizontal lines
  const horizKernelSize = Math.max(1, Math.floor(src.cols / horizScale));
  const horizKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(horizKernelSize, 1)
  );
  const horizontal = new cv.Mat();
  cv.erode(bin, horizontal, horizKernel);
  cv.dilate(horizontal, horizontal, horizKernel);

  // Vertical lines
  const vertKernelSize = Math.max(1, Math.floor(src.rows / vertScale));
  const vertKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(1, vertKernelSize)
  );
  const vertical = new cv.Mat();
  cv.erode(bin, vertical, vertKernel);
  cv.dilate(vertical, vertical, vertKernel);

  // Combine line masks to grid mask
  const grid = new cv.Mat();
  cv.add(horizontal, vertical, grid);

  // Find external contours on grid to get cell-ish rectangles
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(
    grid,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  const rects = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const rect = cv.boundingRect(cnt);
    if (rect.width * rect.height >= minCellArea) {
      rects.push({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
    }
    cnt.delete();
  }

  // If no rects found (weak lines), fallback to using the bin mask contours:
  if (rects.length === 0) {
    const c2 = new cv.MatVector();
    const h2 = new cv.Mat();
    cv.findContours(bin, c2, h2, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < c2.size(); i++) {
      const rect = cv.boundingRect(c2.get(i));
      if (rect.width * rect.height >= minCellArea) {
        rects.push({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      }
    }
    c2.delete();
    h2.delete();
  }

  // Cluster by rows, then sort by columns
  const rows = clusterRowsByY(rects, 12);

  // Save crops in row/col order
  const cells = [];
  rows.forEach((row, rIdx) => {
    row.items.forEach((rc, cIdx) => {
      const x1 = Math.max(0, rc.x - pad);
      const y1 = Math.max(0, rc.y - pad);
      const x2 = Math.min(src.cols, rc.x + rc.w + pad);
      const y2 = Math.min(src.rows, rc.y + rc.h + pad);
      const w = Math.max(1, x2 - x1);
      const h = Math.max(1, y2 - y1);
      const roi = src.roi(new cv.Rect(x1, y1, w, h));
      const outPath = path.join(outDir, `cell_r${rIdx + 1}_c${cIdx + 1}.png`);
      imwriteFromMat(cv, outPath, roi);
      roi.delete();
      cells.push({
        row: rIdx + 1,
        col: cIdx + 1,
        path: outPath,
        bbox: { x: x1, y: y1, w, h },
      });
    });
  });

  // Cleanup
  src.delete();
  gray.delete();
  bin.delete();
  horizontal.delete();
  vertical.delete();
  grid.delete();
  contours.delete();
  hierarchy.delete();

  return cells;
}

module.exports = { splitTableIntoCells };
