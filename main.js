const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:openFile", async (_event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: filters || [],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("run:process", async (event, args) => {
  const pythonArgs = [
    path.join(__dirname, "metaEditor.py"),
    "--music-dir", args.musicDir,
    "--artist", args.artist,
    "--album", args.album,
    "--cover", args.cover,
    "--bitrate", args.bitrate,
  ];

  if (args.deleteOriginals) {
    pythonArgs.push("--delete-originals");
  }

  if (args.tracklist) {
    pythonArgs.push("--tracklist", args.tracklist);
  }

  const child = spawn("python3", pythonArgs);

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line) mainWindow.webContents.send("process:output", line);
    }
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line) mainWindow.webContents.send("process:output", `[stderr] ${line}`);
    }
  });

  return new Promise((resolve) => {
    child.on("close", (code) => {
      mainWindow.webContents.send("process:done", code);
      resolve(code);
    });
  });
});
