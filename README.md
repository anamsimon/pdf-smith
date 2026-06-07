# PDF Tool

A small Flask + JavaScript web app for previewing, organizing, and compressing PDFs to a target file size.

## Features

- **Preview** — uploaded PDF renders thumbnails on the left and a large preview of the active page in the center (PDF.js, fully client-side).
- **Organize pages** — drag thumbnails to reorder, hover-and-click `×` to delete. A header strip shows the page count and a **Reset** link.
- **Save as-is** — writes the current (possibly reorganized) PDF without recompression. If untouched, the original bytes are written; if edited, [pdf-lib](https://pdf-lib.js.org/) rebuilds it losslessly in the browser first.
- **Compress to a target size** — pick a size in KB or MB. The app tries a series of DPI/JPEG-quality presets (200 dpi / q=85 down to 36 dpi / q=25) until the output fits at or below the target.
- **Two compression modes**
  - **Server** — uploads the file to Flask and uses PyMuPDF to re-render pages.
  - **In-browser** — renders pages via PDF.js, encodes each as JPEG, then assembles a new PDF with pdf-lib. The file never leaves your machine. A progress bar reports the current preset and page.
- **Honest result panel** — shows original / target / final sizes, the preset that won, whether the target was reached, and the mode used.

## Requirements

- Python 3.10+ (tested on 3.11)
- Pip, plus an internet connection on first run for PDF.js + pdf-lib CDN scripts (used by the front end)

Python dependencies (in `requirements.txt`):

- Flask
- PyMuPDF (`fitz`)
- Pillow

## How to run

From the project directory:

```powershell
# 1. (Recommended) create a virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# 2. Install dependencies
python -m pip install -r requirements.txt

# 3. Start the app
python app.py
```

Then open <http://127.0.0.1:5000> in a browser.

On Linux/macOS the venv activation line is `source .venv/bin/activate`; everything else is the same.

## Using it

1. Drop a PDF on the upload card (or click **browse**). Max upload size is 200 MB.
2. The left rail shows page thumbnails; the center shows the active page. Click any thumbnail to preview that page.
3. Reorder pages by dragging a thumbnail above/below another. Delete a page by clicking the `×` on a thumbnail. Click **Reset** to undo all edits.
4. In the right panel:
   - Click **Save as-is** to write the current page order without any quality loss.
   - Or enter a target size, pick **Server** or **In-browser** mode, and click **Compress**.
   - In both cases the file is written directly to the configured output folder (default: your `Downloads`); click **Show in folder** in the result card to reveal it.

### Output folder and Windows Mark-of-the-Web

Files are written directly to disk by the Python process rather than streamed through a browser download, so Windows does **not** attach a `Zone.Identifier` alternate data stream to them. This matters because a browser-saved PDF gets the `[ZoneTransfer] ZoneId=3` (Internet) tag — even when the source is `127.0.0.1` — which makes the Explorer preview pane refuse to render it with *"The file you are attempting to preview could harm your computer."*

The output folder defaults to `~/Downloads`. Override it by setting `PDF_TOOL_OUTPUT_DIR` before launching:

```powershell
$env:PDF_TOOL_OUTPUT_DIR = "C:\Users\you\Documents\PDFs"
python app.py
```

## Architecture

- **`app.py`** — Flask server. Routes:
  - `GET /` — renders the viewer.
  - `POST /compress` — accepts `pdf`, `target_kb`, and an optional `page_order` (JSON array of 1-based page numbers). Applies the reorder, then iterates the DPI/quality preset list until the file fits at-or-below `target_kb` (or returns the smallest produced if the target is unreachable). If the original is already under target, it just runs a lossless cleanup pass (`deflate`, `garbage=4`, `clean=True`). Writes the result to the output folder and returns `saved_path`.
  - `POST /reorganize` — accepts `pdf` and `page_order` and writes a reordered PDF (no recompression) to the output folder.
  - `POST /save` — accepts a `pdf` form field and writes the bytes straight to the output folder. Used by the in-browser "Save as-is" and "In-browser compress" paths so their output also avoids the Mark-of-the-Web tag.
  - `POST /reveal` — given a `{path}` JSON body, opens the OS file manager and selects the file. Restricted to paths under the configured output folder.
- **`templates/index.html`** — single-page UI. PDF.js renders thumbnails and the central preview. pdf-lib is used for the in-browser "Save as-is" path and the in-browser compression path. All edit state (`pageOrder`, current page) lives in JS; the original PDF bytes are kept in memory and re-fed to pdf-lib when needed. Whenever a PDF is produced (server- or client-side), the bytes are POSTed to `/save` so the Python process is what writes them to disk.

## Compression preset ladder

The same ladder is used in both server and in-browser modes:

| DPI | JPEG quality |
| --- | ------------ |
| 200 | 85 |
| 180 | 80 |
| 150 | 75 |
| 130 | 70 |
| 110 | 60 |
|  96 | 55 |
|  85 | 50 |
|  75 | 45 |
|  65 | 40 |
|  55 | 35 |
|  45 | 30 |
|  36 | 25 |

The app stops at the first preset whose output is at or below the requested target.

## Limits and caveats

- **Compression is lossy by design.** Each page is re-rendered as a JPEG image and embedded into a fresh PDF, so text in the output is no longer selectable / searchable. If preserving text matters, use **Download as-is**.
- **In-browser mode is slower and more memory-hungry** than server mode, especially on long PDFs at the high-DPI early presets. It's the right choice when the file shouldn't leave your machine.
- **Maximum upload size** is 200 MB (configured by `MAX_CONTENT_LENGTH` in `app.py`).
- **`debug=True`** in `app.py` is convenient for development but should be turned off before exposing the app on a network.
