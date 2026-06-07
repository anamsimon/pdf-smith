import io
import json
import os
import subprocess
import sys
from pathlib import Path

import fitz
from flask import Flask, render_template, request, jsonify
from PIL import Image

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB upload cap

OUTPUT_DIR = Path(os.environ.get("PDF_TOOL_OUTPUT_DIR") or (Path.home() / "Downloads"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _unique_path(base_name: str) -> Path:
    """Resolve base_name inside OUTPUT_DIR, appending (1), (2), ... on collision."""
    p = OUTPUT_DIR / Path(base_name).name
    if not p.exists():
        return p
    stem, suffix = p.stem, p.suffix
    for i in range(1, 10000):
        candidate = OUTPUT_DIR / f"{stem} ({i}){suffix}"
        if not candidate.exists():
            return candidate
    raise RuntimeError("too many filename collisions in output directory")


def _save_to_output(data: bytes, base_name: str) -> Path:
    path = _unique_path(base_name)
    path.write_bytes(data)
    return path


def compress_pdf(src_bytes: bytes, target_bytes: int):
    """Compress a PDF to at-or-below target_bytes.

    Strategy: iterate over (dpi, jpeg_quality) presets from highest to lowest,
    re-rendering each page as a JPEG-backed image and rebuilding the PDF.
    Returns (compressed_bytes, preset_used, original_size, final_size).
    """
    original_size = len(src_bytes)

    # If already small enough, run a single lossless cleanup pass and return.
    if original_size <= target_bytes:
        doc = fitz.open(stream=src_bytes, filetype="pdf")
        out = doc.tobytes(deflate=True, garbage=4, clean=True)
        doc.close()
        if len(out) <= target_bytes:
            return out, "lossless", original_size, len(out)

    presets = [
        (200, 85),
        (180, 80),
        (150, 75),
        (130, 70),
        (110, 60),
        (96, 55),
        (85, 50),
        (75, 45),
        (65, 40),
        (55, 35),
        (45, 30),
        (36, 25),
    ]

    best = None
    for dpi, quality in presets:
        candidate = _render_to_pdf(src_bytes, dpi, quality)
        size = len(candidate)
        best = (candidate, f"dpi={dpi}, q={quality}", size)
        if size <= target_bytes:
            return candidate, f"dpi={dpi}, q={quality}", original_size, size

    # Couldn't reach target — return the smallest one we produced.
    return best[0], best[1] + " (target not reached)", original_size, best[2]


def _reorder_pdf(src_bytes: bytes, page_order: list) -> bytes:
    """Build a new PDF containing the specified pages in the given order.

    page_order is a list of 1-based page numbers referring to the source.
    """
    src = fitz.open(stream=src_bytes, filetype="pdf")
    try:
        n = src.page_count
        for pn in page_order:
            if pn < 1 or pn > n:
                raise ValueError(f"page {pn} out of range (1..{n})")
        out = fitz.open()
        try:
            for pn in page_order:
                out.insert_pdf(src, from_page=pn - 1, to_page=pn - 1)
            return out.tobytes(deflate=True, garbage=4, clean=True)
        finally:
            out.close()
    finally:
        src.close()


def _render_to_pdf(src_bytes: bytes, dpi: int, jpeg_quality: int) -> bytes:
    """Render every page of src to a JPEG image and assemble a new PDF."""
    src = fitz.open(stream=src_bytes, filetype="pdf")
    out = fitz.open()
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    try:
        for page in src:
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
            jpeg_bytes = buf.getvalue()

            # Page sized in points to preserve original page dimensions.
            page_rect = page.rect
            new_page = out.new_page(width=page_rect.width, height=page_rect.height)
            new_page.insert_image(new_page.rect, stream=jpeg_bytes)

        return out.tobytes(deflate=True, garbage=4, clean=True)
    finally:
        src.close()
        out.close()


@app.route("/")
def index():
    return render_template("index.html", output_dir=str(OUTPUT_DIR))


@app.route("/compress", methods=["POST"])
def compress():
    if "pdf" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    f = request.files["pdf"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400
    if not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "File must be a PDF"}), 400

    try:
        target_kb = float(request.form.get("target_kb", "0"))
    except ValueError:
        return jsonify({"error": "Invalid target size"}), 400
    if target_kb <= 0:
        return jsonify({"error": "Target size must be greater than zero"}), 400

    target_bytes = int(target_kb * 1024)
    src_bytes = f.read()
    original_size = len(src_bytes)

    page_order_raw = request.form.get("page_order")
    if page_order_raw:
        try:
            page_order = json.loads(page_order_raw)
            if not isinstance(page_order, list) or not page_order:
                raise ValueError("page_order must be a non-empty list")
            page_order = [int(n) for n in page_order]
        except (ValueError, json.JSONDecodeError) as e:
            return jsonify({"error": f"Invalid page_order: {e}"}), 400
        try:
            src_bytes = _reorder_pdf(src_bytes, page_order)
        except Exception as e:
            return jsonify({"error": f"Page reorder failed: {e}"}), 400

    try:
        compressed, preset, _, final_size = compress_pdf(src_bytes, target_bytes)
    except Exception as e:
        return jsonify({"error": f"Compression failed: {e}"}), 500

    base = Path(f.filename).stem
    saved = _save_to_output(compressed, f"{base}-compressed.pdf")

    return jsonify({
        "saved_path": str(saved),
        "saved_name": saved.name,
        "original_size": original_size,
        "final_size": final_size,
        "target_bytes": target_bytes,
        "preset": preset,
        "reached_target": final_size <= target_bytes,
    })


@app.route("/reorganize", methods=["POST"])
def reorganize():
    """Apply a page order to the uploaded PDF without compressing it."""
    if "pdf" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["pdf"]
    if not f.filename or not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "File must be a PDF"}), 400

    page_order_raw = request.form.get("page_order")
    if not page_order_raw:
        return jsonify({"error": "page_order is required"}), 400
    try:
        page_order = [int(n) for n in json.loads(page_order_raw)]
    except (ValueError, json.JSONDecodeError) as e:
        return jsonify({"error": f"Invalid page_order: {e}"}), 400

    src_bytes = f.read()
    original_size = len(src_bytes)
    try:
        out = _reorder_pdf(src_bytes, page_order)
    except Exception as e:
        return jsonify({"error": f"Page reorder failed: {e}"}), 400

    base = Path(f.filename).stem
    saved = _save_to_output(out, f"{base}-reorganized.pdf")
    return jsonify({
        "saved_path": str(saved),
        "saved_name": saved.name,
        "original_size": original_size,
        "final_size": len(out),
    })


@app.route("/save", methods=["POST"])
def save():
    """Persist a PDF built in the browser straight to OUTPUT_DIR.

    Used by "Save as-is" and the in-browser compression mode so the result never
    rides a browser download (which would attach a Mark-of-the-Web tag on Windows
    and trip the Explorer preview "could harm your computer" warning).
    """
    if "pdf" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["pdf"]
    if not f.filename or not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "File must be a PDF"}), 400
    data = f.read()
    saved = _save_to_output(data, Path(f.filename).name)
    return jsonify({"saved_path": str(saved), "saved_name": saved.name, "size": len(data)})


@app.route("/reveal", methods=["POST"])
def reveal():
    """Open the OS file manager and select the saved file."""
    payload = request.get_json(silent=True) or {}
    raw = payload.get("path")
    if not raw:
        return jsonify({"error": "path required"}), 400
    p = Path(raw).resolve()
    # Only reveal files that live under OUTPUT_DIR — don't let the browser
    # talk us into opening arbitrary paths.
    try:
        p.relative_to(OUTPUT_DIR.resolve())
    except ValueError:
        return jsonify({"error": "path is outside output directory"}), 400
    if not p.exists():
        return jsonify({"error": "file not found"}), 404
    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer", f"/select,{p}"])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p.parent)])
    except Exception as e:
        return jsonify({"error": f"failed to open file manager: {e}"}), 500
    return jsonify({"ok": True})


if __name__ == "__main__":
    print(f"PDF output directory: {OUTPUT_DIR}")
    app.run(host="127.0.0.1", port=5000, debug=True)
