#!/usr/bin/env python3
"""Extract plain text from a .docx file using python-docx.

Usage:
  python3 extract-docx.py /path/to/file.docx
  python3 extract-docx.py /path/to/file.docx --output /path/to/output.txt

Output goes to stdout by default (or --output file).
Paragraphs are separated by double newlines to preserve story flow.
"""

import sys
import argparse
from pathlib import Path

try:
    from docx import Document
except ImportError:
    print("ERROR: python-docx not installed. Run: pip3 install python-docx", file=sys.stderr)
    sys.exit(1)


def extract_text(docx_path: str) -> str:
    doc = Document(docx_path)
    paragraphs = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)
    return "\n\n".join(paragraphs)


def main():
    parser = argparse.ArgumentParser(description="Extract text from .docx file")
    parser.add_argument("docx_path", help="Path to .docx file")
    parser.add_argument("--output", "-o", help="Output file path (default: stdout)")
    args = parser.parse_args()

    path = Path(args.docx_path)
    if not path.exists():
        print(f"ERROR: File not found: {path}", file=sys.stderr)
        sys.exit(1)
    if path.suffix.lower() != ".docx":
        print(f"WARNING: Expected .docx, got {path.suffix}", file=sys.stderr)

    text = extract_text(str(path))

    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
        print(f"Wrote {len(text)} chars to {args.output}")
    else:
        print(text)


if __name__ == "__main__":
    main()
