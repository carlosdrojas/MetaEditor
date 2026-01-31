const path = require("path");
const fs = require("fs");

function getFfmpegPath() {
  // In a packaged app, electron-builder extracts extraResources next to the app
  if (process.resourcesPath) {
    const packed = path.join(process.resourcesPath, "ffmpeg");
    if (fs.existsSync(packed)) return packed;
    // Windows
    const packedExe = path.join(process.resourcesPath, "ffmpeg.exe");
    if (fs.existsSync(packedExe)) return packedExe;
  }

  // Dev mode: use ffmpeg-static's bundled binary
  return require("ffmpeg-static");
}

module.exports = getFfmpegPath;
