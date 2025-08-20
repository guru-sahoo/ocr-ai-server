// Loads OpenCV.js (WASM) and resolves when ready with `cv`
module.exports = function loadOpenCV() {
  return new Promise((resolve) => {
    const cv = require("opencv-js"); // WASM module
    if (cv && cv["onRuntimeInitialized"]) {
      cv["onRuntimeInitialized"] = () => resolve(cv);
    } else {
      // Some builds are already initialized
      resolve(cv);
    }
  });
};
