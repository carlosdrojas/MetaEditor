import os
import sys
import argparse
import subprocess
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TPOS, TRCK
from mutagen.mp4 import MP4, MP4Cover
import pytesseract
from PIL import Image
from thefuzz import fuzz


def parse_args():
    parser = argparse.ArgumentParser(
        description="Batch-apply metadata to music files (MP3/WAV → M4A conversion + tagging)"
    )
    parser.add_argument("--music-dir", required=True, help="Directory containing music files")
    parser.add_argument("--artist", required=True, help="Artist name")
    parser.add_argument("--album", required=True, help="Album name")
    parser.add_argument("--cover", required=True, help="Path to cover image (JPEG)")
    parser.add_argument("--tracklist", default=None, help="Path to tracklist screenshot for OCR-based track numbering")
    parser.add_argument("--delete-originals", action="store_true", default=False, help="Delete original MP3/WAV files after conversion")
    parser.add_argument("--bitrate", default="256k", choices=["128k", "192k", "256k", "320k"], help="AAC bitrate (default: 256k)")
    return parser.parse_args()


def build_track_map(music_dir, tracklist_path):
    track_map = {}
    total_tracks = 0

    if not tracklist_path:
        return track_map, total_tracks

    print(f"Reading tracklist from: {tracklist_path}", flush=True)
    ocr_text = pytesseract.image_to_string(Image.open(tracklist_path))
    track_names = [line.strip() for line in ocr_text.splitlines() if line.strip()]
    total_tracks = len(track_names)

    audio_files = [
        f for f in os.listdir(music_dir)
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
            print(f"  Track {track_num}: {track_name}  ->  {best_file} (score: {best_score})", flush=True)
        else:
            print(f"  Track {track_num}: {track_name}  ->  NO MATCH", flush=True)

    print(flush=True)
    return track_map, total_tracks


def process_files(music_dir, artist, album, cover_path, track_map, total_tracks, delete_originals, bitrate):
    with open(cover_path, "rb") as img:
        cover_data = img.read()

    for filename in os.listdir(music_dir):
        filepath = os.path.join(music_dir, filename)
        name, ext = os.path.splitext(filename)
        title = name

        # ---------- MP3 -> M4A ----------
        if ext.lower() == ".mp3":
            print(f"Processing MP3: {filename}", flush=True)

            mp3 = MP3(filepath, ID3=ID3)
            if mp3.tags is None:
                mp3.add_tags()

            mp3.tags["TPE1"] = TPE1(encoding=3, text=artist)
            mp3.tags["TALB"] = TALB(encoding=3, text=album)
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

            m4a_path = os.path.join(music_dir, f"{name}.m4a")

            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i", filepath,
                    "-vn",
                    "-c:a", "aac",
                    "-b:a", bitrate,
                    m4a_path
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )

            if result.returncode != 0:
                print(f"ffmpeg failed for {filename}:\n{result.stderr.decode()}", flush=True)
                continue

            m4a = MP4(m4a_path)
            m4a["\xa9ART"] = artist
            m4a["\xa9alb"] = album
            m4a["\xa9nam"] = title
            m4a["disk"] = [(1, 1)]
            if filename in track_map:
                m4a["trkn"] = [(track_map[filename], total_tracks)]
            m4a["covr"] = [
                MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)
            ]
            m4a.save()

            print(f"Created M4A: {name}.m4a", flush=True)

            if delete_originals:
                os.remove(filepath)
                print(f"Deleted MP3: {filename}", flush=True)

        # ---------- WAV -> M4A ----------
        elif ext.lower() == ".wav":
            print(f"Processing WAV: {filename}", flush=True)

            m4a_path = os.path.join(music_dir, f"{name}.m4a")

            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i", filepath,
                    "-vn",
                    "-c:a", "aac",
                    "-b:a", bitrate,
                    m4a_path
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )

            if result.returncode != 0:
                print(f"ffmpeg failed for {filename}:\n{result.stderr.decode()}", flush=True)
                continue

            m4a = MP4(m4a_path)
            m4a["\xa9ART"] = artist
            m4a["\xa9alb"] = album
            m4a["\xa9nam"] = title
            m4a["disk"] = [(1, 1)]
            if filename in track_map:
                m4a["trkn"] = [(track_map[filename], total_tracks)]
            m4a["covr"] = [
                MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)
            ]
            m4a.save()

            print(f"Created M4A: {name}.m4a", flush=True)

            if delete_originals:
                os.remove(filepath)
                print(f"Deleted WAV: {filename}", flush=True)

        # ---------- Existing M4A ----------
        elif ext.lower() == ".m4a":
            try:
                audio = MP4(filepath)
            except Exception as e:
                print(f"Skipping invalid M4A: {filename} ({e})", flush=True)
                continue

            audio["\xa9ART"] = artist
            audio["\xa9alb"] = album
            audio["\xa9nam"] = title
            audio["disk"] = [(1, 1)]
            if filename in track_map:
                audio["trkn"] = [(track_map[filename], total_tracks)]
            audio["covr"] = [
                MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)
            ]
            audio.save()

            print(f"Updated M4A: {filename}", flush=True)


def main():
    args = parse_args()

    music_dir = args.music_dir
    artist = args.artist
    album = args.album
    cover_path = args.cover
    tracklist_path = args.tracklist
    delete_originals = args.delete_originals
    bitrate = args.bitrate

    if not os.path.isdir(music_dir):
        print(f"Error: Music directory not found: {music_dir}", flush=True)
        sys.exit(1)
    if not os.path.isfile(cover_path):
        print(f"Error: Cover image not found: {cover_path}", flush=True)
        sys.exit(1)
    if tracklist_path and not os.path.isfile(tracklist_path):
        print(f"Error: Tracklist image not found: {tracklist_path}", flush=True)
        sys.exit(1)

    print(f"Music directory: {music_dir}", flush=True)
    print(f"Artist: {artist}", flush=True)
    print(f"Album: {album}", flush=True)
    print(f"Cover: {cover_path}", flush=True)
    print(f"Bitrate: {bitrate}", flush=True)
    print(f"Delete originals: {delete_originals}", flush=True)
    print(flush=True)

    track_map, total_tracks = build_track_map(music_dir, tracklist_path)
    process_files(music_dir, artist, album, cover_path, track_map, total_tracks, delete_originals, bitrate)

    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
