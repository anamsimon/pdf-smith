# PDF Tool — Chrome Extension

A Chrome extension for previewing, reorganizing, inserting into, and compressing PDFs to a target file size. Everything runs in your browser — no server, no upload.

The `extension/` directory holds the Chrome extension. The original Flask app (`app.py`, `templates/`) is kept for reference and still works on its own — see [Flask app (legacy)](#flask-app-legacy) below.

## Features

- **Preview** — thumbnails on the left, large preview of the active page in the center (PDF.js).
- **Organize pages** — drag thumbnails to reorder, click `×` to delete. Header shows the page count and a **Reset** link.
- **Insert pages** — hover between any two thumbnails (or at the top/bottom) and click the insert bar to splice in another **PDF, JPG, or PNG**. Images are wrapped in a single-page PDF sized to match the original document's first page (or US Letter if no original).
- **Save as-is** — writes the current (possibly reorganized) PDF without recompression via [pdf-lib](https://pdf-lib.js.org/).
- **Compress to a target size** — pick a size in KB or MB. The extension tries DPI/JPEG-quality presets (200 dpi / q=85 down to 36 dpi / q=25) until the output fits at-or-below the target. Each page is re-rendered as JPEG and reassembled with pdf-lib.
- **Saves to Downloads** — output files are written through `chrome.downloads`, so they land in your browser's downloads folder. Click **Show in folder** in the result card to reveal the file in your OS file manager.

## Install (unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome (or another Chromium-based browser).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and pick the `extension/` directory inside this repo.
5. Pin the **PDF Tool** action in the toolbar (puzzle-piece menu → pin) and click it to open the tool in a new tab.

All scripts (PDF.js, pdf-lib) are bundled under `extension/vendor/`, so the extension works fully offline once loaded — no CDN calls.

## Using it

1. Click the extension's toolbar icon to open the tool in a new tab.
2. Drop a PDF on the upload card (or click **browse**).
3. The left rail shows page thumbnails; the center shows the active page. Click any thumbnail to preview that page.
4. Reorder by dragging a thumbnail above/below another. Delete a page with the `×` on a thumbnail. Click **Reset** to undo all edits. Use the inline insert bar between thumbnails to add another PDF/JPG/PNG.
5. In the right panel:
   - Click **Save as-is** to write the current page order without quality loss.
   - Or enter a target size and click **Compress**.
   - Either way the file appears in your downloads folder; click **Show in folder** in the result card to reveal it.

## Architecture

- **`extension/manifest.json`** — Manifest V3. Declares the action button, a service-worker background script, and the `downloads` permission.
- **`extension/background.js`** — opens `tool.html` in a new tab when the toolbar icon is clicked (re-focuses an existing tab if one is already open).
- **`extension/tool.html` / `tool.css` / `tool.js`** — the single-page UI. Edit state (`pageOrder`, current page, loaded documents) lives in JS; original bytes for each loaded PDF are kept in memory and re-fed to pdf-lib when saving.
- **`extension/vendor/`** — bundled `pdf.min.js`, `pdf.worker.min.js`, `pdf-lib.min.js`. Loaded from `chrome.runtime.getURL()` so the page works under the default MV3 CSP, which forbids remote scripts.

### Saving and the Mark-of-the-Web

Because Chrome extensions can't write directly to disk, output files are saved via `chrome.downloads.download()`. On Windows this attaches a `Zone.Identifier` Mark-of-the-Web (MOTW) tag to saved files, which makes Explorer's preview pane refuse to render them with *"The file you are attempting to preview could harm your computer."*

If avoiding MOTW matters, use the legacy Flask app instead — its Python process writes the bytes directly to disk and skips the tag.

## Compression preset ladder

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

The tool stops at the first preset whose output is at-or-below the requested target.

## Limits and caveats

- **Compression is lossy by design.** Each page is re-rendered as a JPEG image and embedded into a fresh PDF, so text in the output is no longer selectable or searchable. Use **Save as-is** when preserving text matters.
- **Long PDFs at high DPI are memory-hungry** in the early presets. The browser may take a while to grind through them.
- **MOTW on Windows.** See above — saved files carry the Internet zone tag.

## Flask app (legacy)

The original Flask version is still in this repo (`app.py`, `templates/index.html`, `requirements.txt`). It supports the same workflow plus a **Server** compression mode (PyMuPDF) and writes files straight to disk so Windows doesn't attach the MOTW tag.

Run it with:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Then open <http://127.0.0.1:5000>. Override the output folder with `$env:PDF_TOOL_OUTPUT_DIR = "C:\path\to\folder"`.
