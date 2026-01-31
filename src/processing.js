const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const fuzzball = require("fuzzball");
const { File, ByteVector, PictureType } = require("node-taglib-sharp");
const getFfmpegPath = require("./ffmpegPath");

ffmpeg.setFfmpegPath(getFfmpegPath());

// ---------------------------------------------------------------------------
// Cover art
// ---------------------------------------------------------------------------

async function loadCover(coverPath, onLog) {
  const metadata = await sharp(coverPath).metadata();
  const fmt = metadata.format; // "jpeg", "png", "webp", etc.

  if (fmt === "png") {
    return { data: fs.readFileSync(coverPath), mime: "image/png" };
  }

  if (fmt === "jpeg") {
    return { data: fs.readFileSync(coverPath), mime: "image/jpeg" };
  }

  // Convert everything else (webp, tiff, bmp, etc.) to JPEG
  onLog(`Converting ${fmt} cover image to JPEG for embedding`);
  const buf = await sharp(coverPath).jpeg({ quality: 95 }).toBuffer();
  return { data: buf, mime: "image/jpeg" };
}

// ---------------------------------------------------------------------------
// OCR tracklist -> track number map
// ---------------------------------------------------------------------------

// Date patterns to filter out of OCR output (full line match)
const DATE_RE = new RegExp(
  [
    // Month DD, YYYY  or  Month DD YYYY (with optional leading junk like ©)
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{1,2},?\s*\d{4}/i.source,
    // Mon DD, YYYY (abbreviated, with optional leading junk)
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{1,2},?\s*\d{4}/i.source,
    // MM/DD/YYYY  or  DD/MM/YYYY  or  YYYY-MM-DD
    /\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.source,
  ].join("|"),
  "i"
);

// Common OCR noise: symbols that appear as misread digits, menu icons, etc.
// Strip these from the start and end of track name lines.
const JUNK_RE = /^[\s|,;:©=\-."'!]+|[\s|,;:©=\-."'!I]+$/g;

/**
 * Parse OCR lines into (trackNumber, trackName) pairs.
 *
 * Real-world OCR from tracklist screenshots is noisy:
 *  - Track numbers on the left are often misread as |, comma, or merged into
 *    the name (e.g. "| Kickback =", ", NoTellHer =", "5 NBATrack3 [V1] I")
 *  - Dates appear on their own line, sometimes with leading © or similar junk
 *  - "..." menu icons get read as = or I
 *
 * Strategy:
 *  1. Drop lines that contain a date pattern
 *  2. Strip leading/trailing OCR junk from remaining lines
 *  3. If a line starts with a number followed by a space, split off the number
 *     (it's a misread track number merged into the name)
 *  4. Drop any lines that are empty or purely numeric after cleaning
 *  5. Number the surviving lines sequentially — the visual top-to-bottom order
 *     in the screenshot is the track order
 */
function parseTrackLines(lines) {
  const tracks = [];
  let seq = 1;

  for (let raw of lines) {
    raw = raw.trim();
    if (!raw) continue;

    // Skip date lines (may have leading junk like ©)
    if (DATE_RE.test(raw)) continue;

    // Strip OCR junk from edges
    let name = raw.replace(JUNK_RE, "").trim();
    if (!name) continue;

    // If line starts with digits + space, the track number got merged in — strip it
    name = name.replace(/^\d+\s+/, "").trim();
    if (!name) continue;

    // Skip lines that are purely numeric (stray numbers)
    if (/^\d+$/.test(name)) continue;

    tracks.push({ trackNum: seq++, trackName: name });
  }

  return tracks;
}

/**
 * Parse a tracklist that uses quoted blocks to delimit track names.
 *
 * Format example:
 *   "Track One
 *   (feat. Someone)
 *   [Unfinished]"
 *   Features
 *   "Track Two"
 *
 * Rules:
 *  - Split on `"` boundaries — odd-indexed segments are track blocks
 *  - First non-empty line of each block = track name
 *  - Strip leading emoji/symbols with /^[^\w\[]+/u
 *  - Skip lines starting with ( (producer/alt names)
 *  - Lines starting with [ are kept only if they look like tags (e.g. [Unfinished])
 *  - Unquoted lines between blocks (section headers) are ignored
 *  - Tracks are numbered sequentially
 */
function parseQuotedTrackBlocks(text) {
  const segments = text.split('"');
  const tracks = [];
  let seq = 1;

  for (let i = 1; i < segments.length; i += 2) {
    const block = segments[i];
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // First non-empty line is the track name
    let name = lines[0].replace(/^[^\w\[]+/u, "").trim();
    if (!name) continue;

    tracks.push({ trackNum: seq++, trackName: name });
  }

  return tracks;
}

/**
 * Parse clean text lines into (trackNum, trackName) pairs.
 * Unlike parseTrackLines (designed for noisy OCR output), this does no
 * stripping of leading numbers, dates, or junk — the input is assumed
 * to be human-written or copy-pasted clean text.
 */
function parseCleanLines(lines) {
  const tracks = [];
  let seq = 1;

  for (const raw of lines) {
    const name = raw.trim();
    if (!name) continue;
    tracks.push({ trackNum: seq++, trackName: name });
  }

  return tracks;
}

/**
 * Auto-detect tracklist format and parse into (trackNum, trackName) pairs.
 *
 * If text contains `"` and quoted parsing yields tracks, use that.
 * Otherwise fall back to clean line-per-track parsing.
 */
function parseTextTracklist(text) {
  if (text.includes('"')) {
    const quoted = parseQuotedTrackBlocks(text);
    if (quoted.length > 0) return quoted;
  }
  return parseCleanLines(text.split("\n"));
}

/**
 * OCR multiple tracklist images and return combined (trackNum, trackName) pairs.
 * Reuses a single tesseract.js worker across all images.
 */
async function ocrImages(imagePaths, onLog) {
  const Tesseract = require("tesseract.js");
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && m.progress != null) {
        const pct = Math.round(m.progress * 100);
        if (pct % 10 === 0) onLog(`  OCR progress: ${pct}%`);
      }
    },
  });

  const allTracks = [];
  let seq = 1;

  for (let i = 0; i < imagePaths.length; i++) {
    onLog(`OCR image ${i + 1}/${imagePaths.length}: ${path.basename(imagePaths[i])}`);
    const { data: { text: ocrText } } = await worker.recognize(imagePaths[i]);
    const parsed = parseTrackLines(ocrText.split("\n"));

    for (const t of parsed) {
      allTracks.push({ trackNum: seq++, trackName: t.trackName });
    }
  }

  await worker.terminate();
  return allTracks;
}

/**
 * Build a filename → trackNumber map by parsing the tracklist source
 * and fuzzy-matching track names to audio filenames.
 *
 * @param {string} musicDir - directory containing audio files
 * @param {object} tracklist - { mode, images?, textFile?, text? }
 * @param {function} onLog - logging callback
 */
async function buildTrackMap(musicDir, tracklist, onLog) {
  const trackMap = {};
  let totalTracks = 0;

  // Backward-compat shim for old string/null format
  if (typeof tracklist === "string") tracklist = { mode: "images", images: [tracklist] };
  if (tracklist == null) tracklist = { mode: "none" };

  if (tracklist.mode === "none") return { trackMap, totalTracks };

  let tracks;

  if (tracklist.mode === "images") {
    onLog(`Reading tracklist from ${tracklist.images.length} image(s)`);
    tracks = await ocrImages(tracklist.images, onLog);
  } else if (tracklist.mode === "textFile") {
    onLog(`Reading tracklist from file: ${tracklist.textFile}`);
    const text = fs.readFileSync(tracklist.textFile, "utf-8");
    tracks = parseTextTracklist(text);
  } else if (tracklist.mode === "paste") {
    onLog("Reading pasted tracklist");
    tracks = parseTextTracklist(tracklist.text);
  } else {
    return { trackMap, totalTracks };
  }

  totalTracks = tracks.length;
  onLog(`Parsed ${totalTracks} tracks`);

  const audioFiles = fs
    .readdirSync(musicDir)
    .filter((f) => [".mp3", ".m4a", ".wav", ".flac"].includes(path.extname(f).toLowerCase()));

  const usedFiles = new Set();

  for (const { trackNum, trackName } of tracks) {
    let bestScore = 0;
    let bestFile = null;

    for (const af of audioFiles) {
      if (usedFiles.has(af)) continue;
      const nameNoExt = path.parse(af).name;
      const score = fuzzball.token_set_ratio(trackName.toLowerCase(), nameNoExt.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        bestFile = af;
      }
    }

    if (bestFile) {
      trackMap[bestFile] = trackNum;
      usedFiles.add(bestFile);
      onLog(`  Track ${trackNum}: ${trackName}  ->  ${bestFile} (score: ${bestScore})`);
    } else {
      onLog(`  Track ${trackNum}: ${trackName}  ->  NO MATCH`);
    }
  }

  onLog("");
  return { trackMap, totalTracks };
}

// ---------------------------------------------------------------------------
// ffmpeg conversion helper (promise-based)
// ---------------------------------------------------------------------------

function convertToM4a(inputPath, outputPath, bitrate) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions("-vn")
      .audioCodec("aac")
      .audioBitrate(bitrate)
      .output(outputPath)
      .outputOptions("-y")
      .on("error", reject)
      .on("end", () => resolve())
      .run();
  });
}

// ---------------------------------------------------------------------------
// Tag an M4A file
// ---------------------------------------------------------------------------

function tagM4a(filePath, { artist, album, title, discNumber, trackNum, totalTracks, coverData, coverMime }) {
  const file = File.createFromPath(filePath);
  file.tag.performers = [artist];
  file.tag.albumArtists = [artist];
  file.tag.album = album;
  file.tag.title = title;
  file.tag.disc = discNumber;
  file.tag.discCount = 1;

  if (trackNum != null) {
    file.tag.track = trackNum;
    file.tag.trackCount = totalTracks;
  }

  file.tag.pictures = [
    {
      data: ByteVector.fromByteArray(coverData),
      mimeType: coverMime,
      type: PictureType.FrontCover,
      filename: "Cover",
      description: "Cover",
    },
  ];

  file.save();
  file.dispose();
}

// ---------------------------------------------------------------------------
// Main processing loop
// ---------------------------------------------------------------------------

async function processFiles(musicDir, artist, album, coverPath, trackMap, totalTracks, deleteOriginals, bitrate, onLog) {
  const cover = await loadCover(coverPath, onLog);

  const entries = fs.readdirSync(musicDir);

  for (const filename of entries) {
    const filepath = path.join(musicDir, filename);
    const ext = path.extname(filename).toLowerCase();
    const name = path.parse(filename).name;
    const title = name;

    // ---------- MP3 -> M4A ----------
    if (ext === ".mp3") {
      onLog(`Processing MP3: ${filename}`);

      const m4aPath = path.join(musicDir, `${name}.m4a`);

      try {
        await convertToM4a(filepath, m4aPath, bitrate);
      } catch (err) {
        onLog(`ffmpeg failed for ${filename}:\n${err.message}`);
        continue;
      }

      tagM4a(m4aPath, {
        artist,
        album,
        title,
        discNumber: 1,
        trackNum: trackMap[filename] ?? null,
        totalTracks,
        coverData: cover.data,
        coverMime: cover.mime,
      });

      onLog(`Created M4A: ${name}.m4a`);

      if (deleteOriginals) {
        fs.unlinkSync(filepath);
        onLog(`Deleted MP3: ${filename}`);
      }

    // ---------- WAV -> M4A ----------
    } else if (ext === ".wav") {
      onLog(`Processing WAV: ${filename}`);

      const m4aPath = path.join(musicDir, `${name}.m4a`);

      try {
        await convertToM4a(filepath, m4aPath, bitrate);
      } catch (err) {
        onLog(`ffmpeg failed for ${filename}:\n${err.message}`);
        continue;
      }

      tagM4a(m4aPath, {
        artist,
        album,
        title,
        discNumber: 1,
        trackNum: trackMap[filename] ?? null,
        totalTracks,
        coverData: cover.data,
        coverMime: cover.mime,
      });

      onLog(`Created M4A: ${name}.m4a`);

      if (deleteOriginals) {
        fs.unlinkSync(filepath);
        onLog(`Deleted WAV: ${filename}`);
      }

    // ---------- FLAC -> M4A ----------
    } else if (ext === ".flac") {
      onLog(`Processing FLAC: ${filename}`);

      const m4aPath = path.join(musicDir, `${name}.m4a`);

      try {
        await convertToM4a(filepath, m4aPath, bitrate);
      } catch (err) {
        onLog(`ffmpeg failed for ${filename}:\n${err.message}`);
        continue;
      }

      tagM4a(m4aPath, {
        artist,
        album,
        title,
        discNumber: 1,
        trackNum: trackMap[filename] ?? null,
        totalTracks,
        coverData: cover.data,
        coverMime: cover.mime,
      });

      onLog(`Created M4A: ${name}.m4a`);

      if (deleteOriginals) {
        fs.unlinkSync(filepath);
        onLog(`Deleted FLAC: ${filename}`);
      }

    // ---------- Existing M4A ----------
    } else if (ext === ".m4a") {
      try {
        tagM4a(filepath, {
          artist,
          album,
          title,
          discNumber: 1,
          trackNum: trackMap[filename] ?? null,
          totalTracks,
          coverData: cover.data,
          coverMime: cover.mime,
        });
      } catch (err) {
        onLog(`Skipping invalid M4A: ${filename} (${err.message})`);
        continue;
      }

      onLog(`Updated M4A: ${filename}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point — mirrors metaEditor.py main()
// ---------------------------------------------------------------------------

async function runProcessing(args, onLog) {
  const { musicDir, artist, album, cover, tracklist, deleteOriginals, bitrate } = args;

  if (!fs.existsSync(musicDir) || !fs.statSync(musicDir).isDirectory()) {
    onLog(`Error: Music directory not found: ${musicDir}`);
    return 1;
  }
  if (!fs.existsSync(cover)) {
    onLog(`Error: Cover image not found: ${cover}`);
    return 1;
  }

  // Validate tracklist files exist
  if (tracklist && typeof tracklist === "object") {
    if (tracklist.mode === "images") {
      for (const img of tracklist.images || []) {
        if (!fs.existsSync(img)) {
          onLog(`Error: Tracklist image not found: ${img}`);
          return 1;
        }
      }
    } else if (tracklist.mode === "textFile") {
      if (!fs.existsSync(tracklist.textFile)) {
        onLog(`Error: Tracklist text file not found: ${tracklist.textFile}`);
        return 1;
      }
    }
  } else if (tracklist && typeof tracklist === "string" && !fs.existsSync(tracklist)) {
    onLog(`Error: Tracklist image not found: ${tracklist}`);
    return 1;
  }

  onLog(`Music directory: ${musicDir}`);
  onLog(`Artist: ${artist}`);
  onLog(`Album: ${album}`);
  onLog(`Cover: ${cover}`);
  onLog(`Bitrate: ${bitrate}`);
  onLog(`Delete originals: ${deleteOriginals}`);
  onLog("");

  const { trackMap, totalTracks } = await buildTrackMap(musicDir, tracklist, onLog);
  await processFiles(musicDir, artist, album, cover, trackMap, totalTracks, deleteOriginals, bitrate, onLog);

  onLog("\nDone.");
  return 0;
}

module.exports = { runProcessing };
