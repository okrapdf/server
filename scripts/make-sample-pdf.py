#!/usr/bin/env python3
# Generate a portable single-page PDF (standard Helvetica, WinAnsi text) that
# extracts reliably across all poppler versions — used by the smoke test.
#   python3 scripts/make-sample-pdf.py samples/hello.pdf
import sys

lines = [
    "okraPDF self-host smoke test.",
    "The quick brown fox jumps over the lazy dog.",
    "Page one of the sample document.",
]

content = "BT\n/F1 18 Tf\n72 720 Td\n22 TL\n"
for i, line in enumerate(lines):
    esc = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content += (f"({esc}) Tj\n" if i == 0 else f"T* ({esc}) Tj\n")
content += "ET\n"
cb = content.encode("latin-1")

objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
    b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    b"<< /Length " + str(len(cb)).encode() + b" >>\nstream\n" + cb + b"\nendstream",
]

pdf = b"%PDF-1.4\n"
offsets = []
for i, obj in enumerate(objs, start=1):
    offsets.append(len(pdf))
    pdf += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
xref = len(pdf)
pdf += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n0000000000 65535 f \n"
for off in offsets:
    pdf += f"{off:010d} 00000 n \n".encode()
pdf += b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\n"
pdf += b"startxref\n" + str(xref).encode() + b"\n%%EOF\n"

out = sys.argv[1] if len(sys.argv) > 1 else "samples/hello.pdf"
with open(out, "wb") as f:
    f.write(pdf)
print(f"wrote {out} ({len(pdf)} bytes)")
