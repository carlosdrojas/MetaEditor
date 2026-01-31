# MetadataEditor

Batch-tag and convert a directory of music files into fully tagged M4A files with album art, track numbers, and disc info. Supports MP3, WAV, and M4A input.

Track numbers can be assigned automatically by providing a screenshot of a tracklist — OCR reads the track order and fuzzy-matches names to your files.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (for development only — end users just download the app)

### Install

```bash
git clone <repo-url>
cd MetadataEditor
npm install
```

### Run (dev mode)

```bash
npm start
```

## Usage

1. Click **Browse** next to "Music Directory" and select the folder containing your MP3, WAV, or M4A files.
2. Fill in **Artist** and **Album**.
3. Click **Browse** next to "Cover Image" and select a JPEG, PNG, or WebP file.
4. *(Optional)* Click **Browse** next to "Tracklist Image" and select a screenshot of the track listing. OCR will read it and assign track numbers by fuzzy-matching names to your files.
5. Choose an **AAC Bitrate** (default 256k).
6. Check or uncheck **Delete original MP3/WAV files** as needed.
7. Click **Run**. Progress streams in the output panel in real time.

## What it does

- **MP3/WAV files** — converts to M4A (AAC) via ffmpeg, then tags the output. Originals are optionally deleted.
- **Existing M4A files** — tags in-place (no conversion).
- **All files** get: artist, album, title (derived from filename), album cover, and disc number (1).
- **Track numbering** (optional) — provide a screenshot of a tracklist. The app OCRs it, then fuzzy-matches each track name to the closest filename to assign track numbers. Match results are printed so you can verify.

## Supported formats

| Input | Output |
|-------|--------|
| MP3   | M4A    |
| WAV   | M4A    |
| M4A   | M4A (tagged in-place) |

## Download

Grab the latest `.dmg` (macOS) from the [Releases](../../releases) page. Double-click to install — no prerequisites needed.

## Project Structure

```
MetadataEditor/
├── main.js                    Electron main process, IPC handlers
├── preload.js                 IPC bridge (context isolation)
├── package.json               deps, scripts, electron-builder config
├── src/
│   ├── ffmpegPath.js          resolves ffmpeg binary for dev vs packaged
│   └── processing.js          all backend logic: convert, tag, OCR
├── renderer/
│   ├── index.html             UI form
│   ├── style.css              dark theme
│   └── renderer.js            form logic, IPC calls, progress display
├── metaEditor.py              legacy Python CLI (kept as reference)
└── requirements.txt           legacy Python deps
```

## Notes

- The first OCR run downloads English language data (~4MB) from CDN and caches it for subsequent runs.
- Cover images in formats other than JPEG/PNG (e.g. WebP, BMP, TIFF) are automatically converted to JPEG before embedding.
