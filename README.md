# MetadataEditor

Batch-tag and convert a directory of music files into fully tagged M4A files with album art, track numbers, and disc info. Supports MP3, WAV, and M4A input.

Track numbers can be assigned automatically by providing a screenshot of a tracklist — the script uses OCR to read the track order and fuzzy-matches names to your files.

## Requirements

- Python 3.10+
- [ffmpeg](https://ffmpeg.org/) — for audio conversion
- [Tesseract](https://github.com/tesseract-ocr/tesseract) — for tracklist OCR (only needed if using track numbering)

### Install system dependencies (macOS)

```bash
brew install ffmpeg tesseract
```

### Install Python dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Usage

1. Open `metaEditor.py` and edit the config section at the top:

```python
MUSIC_DIR = "/path/to/album/folder"
ARTIST = "Artist Name"
ALBUM = "Album Name"
COVER_PATH = "/path/to/cover.jpeg"
TRACKLIST_IMAGE_PATH = "/path/to/tracklist_screenshot.png"  # or None to skip
DELETE_ORIGINAL_MP3 = True
DELETE_ORIGINAL_WAV = True
AAC_BITRATE = "256k"
```

2. Run the script:

```bash
python metaEditor.py
```

## What it does

- **MP3/WAV files** — converts to M4A (AAC) via ffmpeg, then tags the output. Originals are deleted if the `DELETE_ORIGINAL_*` flags are set.
- **Existing M4A files** — tags in-place.
- **All files** get: artist, album, title (from filename), album cover, and disc number (1).
- **Track numbering** (optional) — provide a screenshot of a tracklist. The script OCRs it with Tesseract, then fuzzy-matches each track name to the closest filename to assign track numbers. Match results are printed so you can verify.

## Supported formats

| Input | Output |
|-------|--------|
| MP3   | M4A    |
| WAV   | M4A    |
| M4A   | M4A (tagged in-place) |
