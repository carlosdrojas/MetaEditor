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

async function buildTrackMap(musicDir, tracklistPath, onLog) {
  const trackMap = {};
  let totalTracks = 0;

  if (!tracklistPath) return { trackMap, totalTracks };

  onLog(`Reading tracklist from: ${tracklistPath}`);

  const Tesseract = require("tesseract.js");
  const worker = await Tesseract.createWorker("eng");
  const { data: { text: ocrText } } = await worker.recognize(tracklistPath);
  await worker.terminate();

  const trackNames = ocrText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  totalTracks = trackNames.length;

  const audioFiles = fs
    .readdirSync(musicDir)
    .filter((f) => [".mp3", ".m4a", ".wav"].includes(path.extname(f).toLowerCase()));

  const usedFiles = new Set();

  for (let i = 0; i < trackNames.length; i++) {
    const trackNum = i + 1;
    const trackName = trackNames[i];
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
  if (tracklist && !fs.existsSync(tracklist)) {
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
