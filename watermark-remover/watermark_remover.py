#!/usr/bin/env python3
"""
Video Watermark Remover using AI Inpainting (LaMa model via simple-lama-inpainting)
Usage:
    python watermark_remover.py --input video.mp4 --output clean.mp4 --mask mask.png
    python watermark_remover.py --input video.mp4 --output clean.mp4 --region 10 10 200 80
    python watermark_remover.py --input video.mp4 --output clean.mp4 --select  (interactive)
"""

import argparse
import os
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np


def check_dependencies():
    missing = []
    try:
        import cv2  # noqa: F401
    except ImportError:
        missing.append("opencv-python")
    try:
        from simple_lama_inpainting import SimpleLama  # noqa: F401
    except ImportError:
        missing.append("simple-lama-inpainting")
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        missing.append("Pillow")
    if not shutil.which("ffmpeg"):
        missing.append("ffmpeg (system package)")
    if missing:
        print("Missing dependencies:")
        for dep in missing:
            print(f"  - {dep}")
        pip_deps = [d for d in missing if d != "ffmpeg (system package)"]
        if pip_deps:
            print(f"\nInstall with: pip install {' '.join(pip_deps)}")
        if "ffmpeg (system package)" in missing:
            print("Install ffmpeg: sudo apt install ffmpeg  (or brew install ffmpeg on macOS)")
        sys.exit(1)


def region_to_mask(frame_shape, x, y, w, h):
    """Create a binary mask (white = inpaint region) from a rectangle."""
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    mask[y:y+h, x:x+w] = 255
    return mask


def load_mask_image(mask_path, frame_shape):
    """Load a mask PNG and resize to match frame dimensions."""
    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        sys.exit(f"Cannot read mask file: {mask_path}")
    if mask.shape[:2] != frame_shape[:2]:
        mask = cv2.resize(mask, (frame_shape[1], frame_shape[0]), interpolation=cv2.INTER_NEAREST)
    _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
    return mask


def select_region_interactive(video_path):
    """Let the user draw a rectangle on the first frame and return (x, y, w, h)."""
    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        sys.exit("Cannot read first frame for interactive selection.")

    print("Draw a rectangle over the watermark region, then press ENTER or SPACE to confirm.")
    print("Press 'r' to reset, 'c' to cancel.")

    roi = cv2.selectROI("Select Watermark Region", frame, fromCenter=False, showCrosshair=True)
    cv2.destroyAllWindows()

    x, y, w, h = [int(v) for v in roi]
    if w == 0 or h == 0:
        sys.exit("No region selected. Exiting.")
    print(f"Selected region: x={x}, y={y}, w={w}, h={h}")
    return x, y, w, h


def extract_audio(video_path, audio_path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=codec_type", "-of", "csv=p=0", video_path],
        capture_output=True, text=True
    )
    has_audio = "audio" in result.stdout
    if not has_audio:
        return False
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "copy", audio_path],
        check=True, capture_output=True
    )
    return True


def merge_audio(video_no_audio, audio_path, output_path):
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_no_audio, "-i", audio_path,
         "-c:v", "copy", "-c:a", "aac", "-shortest", output_path],
        check=True, capture_output=True
    )


def get_video_info(video_path):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return fps, width, height, total


def process_video(input_path, output_path, mask_arr, batch_size=1):
    from simple_lama_inpainting import SimpleLama
    from PIL import Image

    print("Loading LaMa inpainting model...")
    lama = SimpleLama()

    fps, width, height, total_frames = get_video_info(input_path)
    print(f"Video: {width}x{height} @ {fps:.2f}fps, {total_frames} frames")

    mask_pil = Image.fromarray(mask_arr)

    tmpdir = tempfile.mkdtemp(prefix="wmr_")
    tmp_output = os.path.join(tmpdir, "output_noaudio.mp4")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_output, fourcc, fps, (width, height))

    cap = cv2.VideoCapture(input_path)
    frame_idx = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_pil = Image.fromarray(frame_rgb)
            result_pil = lama(frame_pil, mask_pil)
            result_bgr = cv2.cvtColor(np.array(result_pil), cv2.COLOR_RGB2BGR)
            writer.write(result_bgr)

            frame_idx += 1
            if frame_idx % 10 == 0 or frame_idx == total_frames:
                pct = frame_idx / max(total_frames, 1) * 100
                print(f"\r  Processing frame {frame_idx}/{total_frames} ({pct:.1f}%)...", end="", flush=True)

    finally:
        cap.release()
        writer.release()

    print()

    # Reattach audio
    audio_tmp = os.path.join(tmpdir, "audio.aac")
    has_audio = extract_audio(input_path, audio_tmp)

    if has_audio:
        print("Merging audio...")
        merge_audio(tmp_output, audio_tmp, output_path)
    else:
        # Re-encode with ffmpeg for better compatibility
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_output, "-c:v", "libx264", "-crf", "18", output_path],
            check=True, capture_output=True
        )

    shutil.rmtree(tmpdir, ignore_errors=True)
    print(f"Done! Output saved to: {output_path}")


def save_mask_preview(mask_arr, frame, output_path):
    """Save a preview PNG blending the mask over the first frame."""
    preview = frame.copy()
    overlay = preview.copy()
    overlay[mask_arr > 127] = (0, 0, 255)
    blended = cv2.addWeighted(preview, 0.6, overlay, 0.4, 0)
    cv2.imwrite(output_path, blended)
    print(f"Mask preview saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Remove watermarks from videos using AI inpainting (LaMa).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use a pre-made mask image:
  python watermark_remover.py -i input.mp4 -o clean.mp4 --mask mask.png

  # Specify region manually (x y width height in pixels):
  python watermark_remover.py -i input.mp4 -o clean.mp4 --region 10 10 200 80

  # Draw the region interactively on the first frame:
  python watermark_remover.py -i input.mp4 -o clean.mp4 --select

  # Save a preview of the masked region before processing:
  python watermark_remover.py -i input.mp4 -o clean.mp4 --region 10 10 200 80 --preview mask_preview.png
        """
    )
    parser.add_argument("-i", "--input", required=True, help="Input video file")
    parser.add_argument("-o", "--output", required=True, help="Output video file")

    mask_group = parser.add_mutually_exclusive_group(required=True)
    mask_group.add_argument("--mask", help="Path to a binary mask PNG (white = watermark area)")
    mask_group.add_argument(
        "--region", nargs=4, type=int, metavar=("X", "Y", "W", "H"),
        help="Watermark region as X Y Width Height (pixels)"
    )
    mask_group.add_argument(
        "--select", action="store_true",
        help="Interactively draw the watermark region on the first frame"
    )

    parser.add_argument("--preview", metavar="PATH", help="Save a mask preview image and exit (no processing)")
    args = parser.parse_args()

    check_dependencies()

    if not os.path.isfile(args.input):
        sys.exit(f"Input file not found: {args.input}")

    fps, width, height, total_frames = get_video_info(args.input)
    frame_shape = (height, width)

    # Build mask
    if args.mask:
        mask_arr = load_mask_image(args.mask, frame_shape)
    elif args.region:
        x, y, w, h = args.region
        mask_arr = region_to_mask(frame_shape, x, y, w, h)
    else:  # --select
        x, y, w, h = select_region_interactive(args.input)
        mask_arr = region_to_mask(frame_shape, x, y, w, h)

    # Optional preview
    if args.preview:
        cap = cv2.VideoCapture(args.input)
        ret, frame = cap.read()
        cap.release()
        if ret:
            save_mask_preview(mask_arr, frame, args.preview)
        sys.exit(0)

    process_video(args.input, args.output, mask_arr)


if __name__ == "__main__":
    main()
