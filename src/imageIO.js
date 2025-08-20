// Image I/O helpers for OpenCV.js using node-canvas
const fs = require("fs");
const { createCanvas, loadImage, ImageData } = require("canvas");

function imreadToMat(cv, filePath) {
  return loadImage(filePath).then((img) => {
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      img.width,
      img.height
    );

    // data is RGBA; build Mat(CV_8UC4) then convert to CV_8UC3 BGR
    let mat = new cv.Mat(height, width, cv.CV_8UC4);
    mat.data.set(data);
    let bgr = new cv.Mat();
    cv.cvtColor(mat, bgr, cv.COLOR_RGBA2BGR);
    mat.delete();
    return bgr; // CV_8UC3
  });
}

function imwriteFromMat(cv, filePath, mat) {
  // Ensure 3-channel BGR; convert to RGBA for canvas
  let rgba = new cv.Mat();
  if (mat.type() === cv.CV_8UC1) {
    cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  } else if (mat.type() === cv.CV_8UC3) {
    cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
  } else if (mat.type() === cv.CV_8UC4) {
    rgba = mat.clone();
  } else {
    throw new Error("Unsupported Mat type for imwrite");
  }

  const canvas = createCanvas(rgba.cols, rgba.rows);
  const ctx = canvas.getContext("2d");
  const clamped = new Uint8ClampedArray(rgba.data);
  const imageData = new ImageData(clamped, rgba.cols, rgba.rows);
  ctx.putImageData(imageData, 0, 0);
  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync(filePath, buf);
  rgba.delete();
}

module.exports = { imreadToMat, imwriteFromMat };
