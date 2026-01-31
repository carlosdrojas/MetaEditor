const form = document.getElementById("form");
const log = document.getElementById("log");
const btnRun = document.getElementById("btnRun");
const btnClearLog = document.getElementById("btnClearLog");

const musicDirInput = document.getElementById("musicDir");
const artistInput = document.getElementById("artist");
const albumInput = document.getElementById("album");
const coverInput = document.getElementById("cover");
const tracklistInput = document.getElementById("tracklist");
const bitrateSelect = document.getElementById("bitrate");
const deleteOriginalsCheck = document.getElementById("deleteOriginals");

const coverPreview = document.getElementById("coverPreview");
const tracklistPreview = document.getElementById("tracklistPreview");

// Browse buttons
document.getElementById("btnMusicDir").addEventListener("click", async () => {
  const dir = await window.api.selectDirectory();
  if (dir) musicDirInput.value = dir;
});

document.getElementById("btnCover").addEventListener("click", async () => {
  const file = await window.api.selectFile([
    { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
  ]);
  if (file) {
    coverInput.value = file;
    coverPreview.src = `file://${file}`;
    coverPreview.style.display = "block";
  }
});

document.getElementById("btnTracklist").addEventListener("click", async () => {
  const file = await window.api.selectFile([
    { name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "tiff"] },
  ]);
  if (file) {
    tracklistInput.value = file;
    tracklistPreview.src = `file://${file}`;
    tracklistPreview.style.display = "block";
  }
});

// Clear log
btnClearLog.addEventListener("click", () => {
  log.textContent = "";
});

// Process output streaming
window.api.onProcessOutput((line) => {
  log.textContent += line + "\n";
  log.scrollTop = log.scrollHeight;
});

window.api.onProcessDone((code) => {
  if (code === 0) {
    log.textContent += "\n--- Process completed successfully ---\n";
  } else {
    log.textContent += `\n--- Process exited with code ${code} ---\n`;
  }
  log.scrollTop = log.scrollHeight;
  setFormEnabled(true);
});

// Form submission
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const musicDir = musicDirInput.value.trim();
  const artist = artistInput.value.trim();
  const album = albumInput.value.trim();
  const cover = coverInput.value.trim();
  const tracklist = tracklistInput.value.trim();
  const bitrate = bitrateSelect.value;
  const deleteOriginals = deleteOriginalsCheck.checked;

  if (!musicDir || !artist || !album || !cover) {
    log.textContent += "Error: Music Directory, Artist, Album, and Cover Image are required.\n";
    log.scrollTop = log.scrollHeight;
    return;
  }

  log.textContent = "";
  setFormEnabled(false);

  window.api.runProcess({
    musicDir,
    artist,
    album,
    cover,
    tracklist: tracklist || null,
    bitrate,
    deleteOriginals,
  });
});

function setFormEnabled(enabled) {
  btnRun.disabled = !enabled;
  btnRun.textContent = enabled ? "Run" : "Processing...";
  for (const el of form.querySelectorAll("input, select, button")) {
    if (el === btnClearLog) continue;
    el.disabled = !enabled;
  }
}
