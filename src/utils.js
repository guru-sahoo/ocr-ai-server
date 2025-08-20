// Helpers: numeric sort unique with tolerance, row clustering
function sortUnique(values, tol = 6) {
  const s = values.slice().sort((a, b) => a - b);
  const out = [];
  for (let v of s) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > tol)
      out.push(v);
  }
  return out;
}

function clusterRowsByY(rects, tol = 12) {
  // rects: [{x,y,w,h}]
  const rows = [];
  rects.sort((a, b) => a.y - b.y);
  for (const r of rects) {
    const cy = r.y + r.h / 2;
    let placed = false;
    for (const row of rows) {
      if (Math.abs(cy - row.cy) <= tol) {
        row.items.push(r);
        row.cy = (row.cy * row.count + cy) / (row.count + 1);
        row.count += 1;
        placed = true;
        break;
      }
    }
    if (!placed) rows.push({ cy, count: 1, items: [r] });
  }
  // sort items in each row by x
  rows.forEach((row) => row.items.sort((a, b) => a.x - b.x));
  return rows;
}

module.exports = { sortUnique, clusterRowsByY };
