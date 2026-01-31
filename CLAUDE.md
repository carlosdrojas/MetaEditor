# MetadataEditor

## What it does
A Python script (`metaEditor.py`) that takes an input directory of music files and batch-applies metadata: album name, artist, album cover art, disc number, and track numbers. Converts MP3 and WAV files to M4A (AAC) via ffmpeg, then tags the output using mutagen.

## Current capabilities
- MP3 → M4A conversion + tagging
- WAV → M4A conversion + tagging
- Existing M4A tagging (in-place)
- Album cover art embedding (JPEG)
- Disc number set to 1 for all tracks
- OCR-based track numbering: provide a screenshot of a tracklist, pytesseract reads it, thefuzz matches track names to filenames, and track numbers are assigned automatically
- Optional deletion of original MP3/WAV files after conversion

## Dependencies
- Python: mutagen, pytesseract, Pillow, thefuzz
- System: ffmpeg, tesseract

## Config
All config is at the top of `metaEditor.py`: `MUSIC_DIR`, `ARTIST`, `ALBUM`, `COVER_PATH`, `TRACKLIST_IMAGE_PATH`, `DELETE_ORIGINAL_MP3`, `DELETE_ORIGINAL_WAV`, `AAC_BITRATE`.

## Future idea: web/desktop app
Turn this into a UI-based tool. Key considerations:

- **Best fit: desktop app (Tauri)** — native filesystem access, no upload bottleneck, lightweight, distributable as .dmg/.exe
- **Local web server (Flask/FastAPI)** — easiest migration, but limited to localhost
- **Hosted web app** — requires file uploads, server compute for ffmpeg, and storage costs
- **Parallelization** — `concurrent.futures.ProcessPoolExecutor` for parallel ffmpeg conversions; near-linear speedup, straightforward to add
- **Unique angle** — the OCR tracklist → auto track numbering workflow is underserved. Existing tools (MP3Tag, MusicBrainz Picard, Kid3) don't do this. Focus on the "dump and tag" use case: folder of untagged music + tracklist screenshot + album info → fully tagged album in one shot
