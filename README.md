# MetadataEditor

A desktop app for batch-applying metadata to music files. Select a folder of audio files, fill in album info, optionally provide a tracklist, and hit Run — the app converts everything to M4A and tags it in one shot.

No system dependencies required. ffmpeg, OCR, and all processing are bundled inside the app.

## Features

- **Audio conversion** — MP3, WAV, and FLAC files are converted to M4A (AAC) via a bundled ffmpeg binary
- **In-place M4A tagging** — existing M4A files are tagged without re-encoding
- **Batch metadata** — sets artist, album, title, disc number, and cover art across all files in a directory
- **Cover art embedding** — JPEG and PNG are embedded directly; WebP and other formats are auto-converted to JPEG
- **Parallel processing** — file conversions run concurrently (up to 8 parallel ffmpeg processes, based on CPU count)
- **Optional original file deletion** — remove source MP3/WAV/FLAC files after successful conversion
- **Configurable AAC bitrate** — 128k, 192k, 256k (default), or 320k

### Track numbering

Track numbers can be assigned automatically via four input modes:

| Mode | How it works |
|---|---|
| **None** | No track numbers assigned |
| **Image(s)** | OCR one or more tracklist screenshots (tesseract.js), then fuzzy-match track names to filenames |
| **Text File** | Read a `.txt` file — auto-detects quoted-block or line-per-track format |
| **Paste** | Paste a tracklist directly into a textarea — same auto-detect parsing as Text File |

Track names are matched to audio filenames using fuzzy string matching. The best unique match wins for each track, and match results are printed so you can verify.

#### Tracklist formats

**Line-per-track** — one track name per line:

```
Track One
Track Two
Track Three
```

**Quoted blocks** — each track name wrapped in double quotes, with optional metadata lines below:

```
"Track One
(prod. Someone)
[Unfinished]"
Section Header
"Track Two"
```

Only the first line of each quoted block is used as the track name. Unquoted lines between blocks (section headers, notes) are ignored. Escaped double quotes (`""`) inside blocks are handled correctly.

## Supported formats

| Input | Output |
|---|---|
| MP3 | M4A |
| WAV | M4A |
| FLAC | M4A |
| M4A | M4A (tagged in-place) |

## Download

Grab the latest release for your platform from the [Releases](../../releases) page. No prerequisites needed — the app bundles everything.

| Platform | Format |
|---|---|
| macOS | `.dmg` |
| Windows | `.exe` (NSIS installer) |
| Linux | `.AppImage` |

## Getting started

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

1. **Music Directory** — select a folder containing your audio files (.mp3, .wav, .flac, .m4a)
2. **Artist** — enter the artist name (applied to all files)
3. **Album** — enter the album name (applied to all files)
4. **Cover Image** — select a cover art image (JPEG, PNG, or WebP). A preview is shown after selection
5. **Tracklist** — choose a mode and provide input if applicable:
   - **None** — no track numbering
   - **Image(s)** — add one or more tracklist screenshots to OCR
   - **Text File** — browse for a `.txt` file
   - **Paste** — paste track names directly
6. **AAC Bitrate** — select the encoding bitrate for converted files (default: 256k)
7. **Delete originals** — check to remove source MP3/WAV/FLAC files after conversion (on by default)
8. Click **Run**

Processing progress streams to the log area in real time. The form is disabled while processing runs.

## How it works

1. Cover art is loaded and converted to JPEG if needed
2. If a tracklist is provided, track names are parsed and fuzzy-matched to audio filenames
3. Each audio file is processed as an independent task, running in parallel:
   - MP3/WAV/FLAC — converted to M4A via ffmpeg, then tagged
   - M4A — tagged in-place (no re-encoding)
4. Metadata written per file: artist, album, title (from filename), disc number (1), track number (from tracklist match), and cover art
5. If "Delete originals" is enabled, source files are removed after successful conversion

## Project structure

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

- The first OCR run downloads English language data (~4 MB) from CDN and caches it for subsequent runs
- Cover images in formats other than JPEG/PNG (e.g. WebP, BMP, TIFF) are automatically converted to JPEG before embedding
- Track title for each file is derived from its filename (without extension)
- Disc number is set to 1 for all tracks
- If one file fails to convert, the rest still process normally
