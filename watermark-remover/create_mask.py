#!/usr/bin/env python3
"""
Helper: create a mask PNG for a known watermark position.
Usage:
    python create_mask.py --size 1920x1080 --region 10 10 200 80 --output mask.png
    python create_mask.py --video input.mp4 --region 10 10 200 80 --output mask.png
"""

import argparse
import sys
import numpy as np
import cv2


def main():
    parser = argparse.ArgumentParser(description="Create a binary mask PNG for watermark removal.")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--size", help="Canvas size as WxH (e.g. 1920x1080)")
    src.add_argument("--video", help="Read dimensions from this video file")
    parser.add_argument("--region", nargs=4, type=int, metavar=("X", "Y", "W", "H"), required=True)
    parser.add_argument("--output", default="mask.png")
    args = parser.parse_args()

    if args.size:
        try:
            w, h = map(int, args.size.lower().split("x"))
        except ValueError:
            sys.exit("--size must be WxH, e.g. 1920x1080")
    else:
        cap = cv2.VideoCapture(args.video)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

    x, y, rw, rh = args.region
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y:y+rh, x:x+rw] = 255
    cv2.imwrite(args.output, mask)
    print(f"Mask saved: {args.output}  ({w}x{h}, region x={x} y={y} w={rw} h={rh})")


if __name__ == "__main__":
    main()
