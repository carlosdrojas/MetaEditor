import os
import subprocess
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TPOS, TRCK
from mutagen.mp4 import MP4, MP4Cover
import pytesseract
from PIL import Image
from thefuzz import fuzz

# ===== CONFIG =====
MUSIC_DIR = "/Users/carlosrojas/Music/Uzi/Eternal Atake 2 [V1]/"
ARTIST = "Lil Uzi Vert"
ALBUM = "Eternal Atake 2 [V1]"
COVER_PATH = "/Users/carlosrojas/Documents/Dev/MetadataEditor/covers/ea2v1_c.jpeg"

TRACKLIST_IMAGE_PATH = "/Users/carlosrojas/Documents/Dev/MetadataEditor/tracklists/ea2v1.png"  # ← set to image path to assign track numbers via OCR

DELETE_ORIGINAL_MP3 = True   # ← set True when you're confident
DELETE_ORIGINAL_WAV = True
AAC_BITRATE = "256k"
# ==================

with open(COVER_PATH, "rb") as img:
    cover_data = img.read()

# --- Build track number mapping from tracklist image ---
track_map = {}  # filename -> track number
total_tracks = 0

if TRACKLIST_IMAGE_PATH:
    ocr_text = pytesseract.image_to_string(Image.open(TRACKLIST_IMAGE_PATH))
    track_names = [line.strip() for line in ocr_text.splitlines() if line.strip()]
    total_tracks = len(track_names)

    audio_files = [
        f for f in os.listdir(MUSIC_DIR)
        if os.path.splitext(f)[1].lower() in (".mp3", ".m4a", ".wav")
    ]

    used_files = set()
    for track_num, track_name in enumerate(track_names, start=1):
        best_score = 0
        best_file = None
        for af in audio_files:
            if af in used_files:
                continue
            name_no_ext = os.path.splitext(af)[0]
            score = fuzz.token_set_ratio(track_name.lower(), name_no_ext.lower())
            if score > best_score:
                best_score = score
                best_file = af
        if best_file:
            track_map[best_file] = track_num
            used_files.add(best_file)
            print(f"  Track {track_num}: {track_name}  →  {best_file} (score: {best_score})")
        else:
            print(f"  Track {track_num}: {track_name}  →  NO MATCH")

    print()

for filename in os.listdir(MUSIC_DIR):
    filepath = os.path.join(MUSIC_DIR, filename)
    name, ext = os.path.splitext(filename)
    title = name

    # ---------- MP3 → M4A ----------
    if ext.lower() == ".mp3":
        print(f"Processing MP3: {filename}")

        # 1) Tag MP3 (optional but keeps things clean)
        mp3 = MP3(filepath, ID3=ID3)
        if mp3.tags is None:
            mp3.add_tags()

        mp3.tags["TPE1"] = TPE1(encoding=3, text=ARTIST)
        mp3.tags["TALB"] = TALB(encoding=3, text=ALBUM)
        mp3.tags["TIT2"] = TIT2(encoding=3, text=title)
        mp3.tags["TPOS"] = TPOS(encoding=3, text="1")
        if filename in track_map:
            mp3.tags["TRCK"] = TRCK(encoding=3, text=str(track_map[filename]))

        mp3.tags.delall("APIC")
        mp3.tags.add(
            APIC(
                encoding=3,
                mime="image/jpeg",
                type=3,
                desc="Cover",
                data=cover_data,
            )
        )
        mp3.save()

        # 2) Convert to M4A
        m4a_path = os.path.join(MUSIC_DIR, f"{name}.m4a")

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i", filepath,
                "-vn",
                "-c:a", "aac",
                "-b:a", AAC_BITRATE,
                m4a_path
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        if result.returncode != 0:
            print(f"ffmpeg failed for {filename}:\n{result.stderr.decode()}")
            continue

        # 3) Tag M4A (this is what Spotify/Finder will read)
        m4a = MP4(m4a_path)
        m4a["\xa9ART"] = ARTIST
        m4a["\xa9alb"] = ALBUM
        m4a["\xa9nam"] = title
        m4a["disk"] = [(1, 1)]
        if filename in track_map:
            m4a["trkn"] = [(track_map[filename], total_tracks)]
        m4a["covr"] = [
            MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)
        ]
        m4a.save()

        print(f"Created M4A: {name}.m4a")

        # 4) Optional cleanup
        if DELETE_ORIGINAL_MP3:
            os.remove(filepath)
            print(f"Deleted MP3: {filename}")

    # ---------- WAV → M4A ----------
    elif ext.lower() == ".wav":
        print(f"Processing WAV: {filename}")

        m4a_path = os.path.join(MUSIC_DIR, f"{name}.m4a")

        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i", filepath,
                "-vn",
                "-c:a", "aac",
                "-b:a", AAC_BITRATE,
                m4a_path
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        if result.returncode != 0:
            print(f"ffmpeg failed for {filename}:\n{result.stderr.decode()}")
            continue

        m4a = MP4(m4a_path)
        m4a["\xa9ART"] = ARTIST
        m4a["\xa9alb"] = ALBUM
        m4a["\xa9nam"] = title
        m4a["disk"] = [(1, 1)]
        if filename in track_map:
            m4a["trkn"] = [(track_map[filename], total_tracks)]
        m4a["covr"] = [
            MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)
        ]
        m4a.save()

        print(f"Created M4A: {name}.m4a")

        if DELETE_ORIGINAL_WAV:
            os.remove(filepath)
            print(f"Deleted WAV: {filename}")

    # ---------- Existing M4A ----------
    elif ext.lower() == ".m4a":
        try:
            audio = MP4(filepath)
        except Exception as e:
            print(f"Skipping invalid M4A: {filename} ({e})")
            continue

        audio["\xa9ART"] = ARTIST
        audio["\xa9alb"] = ALBUM
        audio["\xa9nam"] = title
        audio["disk"] = [(1, 1)]
        if filename in track_map:
            audio["trkn"] = [(track_map[filename], total_tracks)]
        audio["covr"] = [
            MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)
        ]
        audio.save()

        print(f"Updated M4A: {filename}")
