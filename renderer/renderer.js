const form = document.getElementById("form");
const log = document.getElementById("log");
const btnRun = document.getElementById("btnRun");
const btnClearLog = document.getElementById("btnClearLog");

const musicDirInput = document.getElementById("musicDir");
const artistInput = document.getElementById("artist");
const albumInput = document.getElementById("album");
const coverInput = document.getElementById("cover");
const bitrateSelect = document.getElementById("bitrate");
const deleteOriginalsCheck = document.getElementById("deleteOriginals");

const coverPreview = document.getElementById("coverPreview");

// Tracklist mode elements
const tracklistRadios = document.querySelectorAll('input[name="tracklistMode"]');
const panelImages = document.getElementById("panelImages");
const panelTextFile = document.getElementById("panelTextFile");
const panelPaste = document.getElementById("panelPaste");
const imageListEl = document.getElementById("imageList");
const textFilePathInput = document.getElementById("textFilePath");
const pasteTextArea = document.getElementById("pasteText");

// Tracklist images state
let tracklistImages = [];

// --- Radio switching ---
const panels = { images: panelImages, textFile: panelTextFile, paste: panelPaste };

function getTracklistMode() {
  return document.querySelector('input[name="tracklistMode"]:checked').value;
}

tracklistRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    const mode = getTracklistMode();
    for (const [key, panel] of Object.entries(panels)) {
      panel.style.display = key === mode ? "block" : "none";
    }
  });
});

// --- Image list management ---
function renderImageList() {
  imageListEl.innerHTML = "";
  tracklistImages.forEach((imgPath, idx) => {
    const item = document.createElement("div");
    item.className = "image-list-item";

    const img = document.createElement("img");
    img.src = `file://${imgPath}`;
    img.alt = imgPath.split("/").pop();
    item.appendChild(img);

    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.textContent = "\u00d7";
    btn.title = "Remove";
    btn.addEventListener("click", () => {
      tracklistImages.splice(idx, 1);
      renderImageList();
    });
    item.appendChild(btn);

    imageListEl.appendChild(item);
  });
}

document.getElementById("btnAddImages").addEventListener("click", async () => {
  const files = await window.api.selectFiles([
    { name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "tiff"] },
  ]);
  if (files && files.length > 0) {
    tracklistImages.push(...files);
    renderImageList();
  }
});

// --- Text file browse ---
document.getElementById("btnTextFile").addEventListener("click", async () => {
  const file = await window.api.selectFile([
    { name: "Text files", extensions: ["txt"] },
  ]);
  if (file) textFilePathInput.value = file;
});

// --- Browse buttons ---
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

// --- Build structured tracklist argument ---
function getTracklistArg() {
  const mode = getTracklistMode();

  if (mode === "none") return { mode: "none" };

  if (mode === "images") {
    return { mode: "images", images: [...tracklistImages] };
  }

  if (mode === "textFile") {
    const p = textFilePathInput.value.trim();
    return { mode: "textFile", textFile: p };
  }

  if (mode === "paste") {
    return { mode: "paste", text: pasteTextArea.value };
  }

  return { mode: "none" };
}

// Form submission
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const musicDir = musicDirInput.value.trim();
  const artist = artistInput.value.trim();
  const album = albumInput.value.trim();
  const cover = coverInput.value.trim();
  const bitrate = bitrateSelect.value;
  const deleteOriginals = deleteOriginalsCheck.checked;
  const tracklist = getTracklistArg();

  if (!musicDir || !artist || !album || !cover) {
    log.textContent += "Error: Music Directory, Artist, Album, and Cover Image are required.\n";
    log.scrollTop = log.scrollHeight;
    return;
  }

  // Validate tracklist fields
  if (tracklist.mode === "images" && tracklistImages.length === 0) {
    log.textContent += "Error: Add at least one tracklist image, or select None.\n";
    log.scrollTop = log.scrollHeight;
    return;
  }
  if (tracklist.mode === "textFile" && !tracklist.textFile) {
    log.textContent += "Error: Select a tracklist text file, or select None.\n";
    log.scrollTop = log.scrollHeight;
    return;
  }
  if (tracklist.mode === "paste" && !tracklist.text.trim()) {
    log.textContent += "Error: Paste a tracklist, or select None.\n";
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
    tracklist,
    bitrate,
    deleteOriginals,
  });
});

function setFormEnabled(enabled) {
  btnRun.disabled = !enabled;
  btnRun.textContent = enabled ? "Run" : "Processing...";
  for (const el of form.querySelectorAll("input, select, button, textarea")) {
    if (el === btnClearLog) continue;
    el.disabled = !enabled;
  }
}
