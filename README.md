# PDF Smith — Chrome Extension

A Chrome extension for previewing, reorganizing, annotating, and compressing PDFs to a target file size. Everything runs in your browser — no server, no upload.

The `extension/` directory holds the Chrome extension. The original Flask app (`app.py`, `templates/`) is kept for reference and still works on its own — see [Flask app (legacy)](#flask-app-legacy) below.

## Features

- **Open PDFs and images** — drop or browse for one or more **PDF, JPG, or PNG** files. Multiple files are merged into one document in the order they're loaded.
- **Preview** — page thumbnails on the left and a continuous-scroll preview in the center (PDF.js). The floating view bar zooms (**Fit width**, **Fit page**, or 25%–300%) and steps between pages. The active thumbnail and page counter follow your scroll position.
- **Organize pages** — drag thumbnails to reorder. Hover a thumbnail to rotate it 90° clockwise or delete it. The rail header shows the page count and a **Reset** link.
- **Insert pages** — hover between any two thumbnails and use **+ File** (another PDF, JPG, or PNG) or **+ Blank** (a white page the same size as the first page). The **Insert** toolbar menu adds either after the current page, and **Add PDF or image** at the bottom of the rail appends to the end. Images are wrapped in a single-page PDF sized to match the original document's first page (or US Letter if no original).
- **Add text** — choose **Add text** (or press `T`), click a page, and type right on it. A floating style bar sets Helvetica, Times Roman, or Courier, a size from 4 to 400, bold, italic, and color, and deletes the text. In **Select** mode (`V`), click text to select it, drag to move it, double-click (or press Enter) to edit it, and press Delete to remove it. Esc finishes editing, then leaves text mode.
- **Undo and redo** — use the toolbar buttons, Ctrl+Z, or Ctrl+Y / Ctrl+Shift+Z.
- **Export: Keep quality** — writes the current edited PDF without recompression via [pdf-lib](https://pdf-lib.js.org/). Existing text stays selectable.
- **Export: Compress to a size** — type a limit or pick 200 KB / 500 KB / 1 MB / 2 MB. The extension tries DPI/JPEG-quality presets (200 dpi / q=85 down to 36 dpi / q=25) until the output fits at-or-below the limit, showing each attempt as it goes; you can cancel at any time. Each page is re-rendered as JPEG and reassembled with pdf-lib. If your file is already under the limit, the panel suggests **Keep quality** instead.
- **When the limit can't be reached** — nothing is saved automatically. You can download the smallest result anyway, raise the limit (a suggested value is offered and compression re-runs), or go back and remove pages.
- **Saves to Downloads** — output files are written through `chrome.downloads`, so they land in your browser's downloads folder. Click **Show in folder** on the result card to reveal the file in your OS file manager. The header shows **Unsaved edits** until you export.

## Install (unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome (or another Chromium-based browser).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and pick the `extension/` directory inside this repo.
5. Pin the **PDF Smith** action in the toolbar (puzzle-piece menu → pin) and click it to open the tool in a new tab.

All scripts (PDF.js, pdf-lib) and fonts are bundled under `extension/vendor/`, so the extension works fully offline once loaded — no CDN calls.

## Using it

1. Click the extension's toolbar icon to open the tool in a new tab.
2. Drop one or more PDF, JPG, or PNG files on the start screen (or click **Choose files**).
3. The left rail shows page thumbnails; the center shows a scrolling preview of the document. Click any thumbnail to jump to that page, and use the bar at the bottom of the preview to zoom or page through.
4. Reorder by dragging a thumbnail above/below another. Hover a thumbnail to rotate or delete it. Hover between thumbnails to insert another PDF/JPG/PNG or a blank page, or use the **Insert** menu.
5. To add text, choose **Add text**, click the spot on the page, and type. Style it with the floating bar; click anywhere else or press Esc when done.
6. Use the undo / redo buttons to step through edits. **Reset** discards all edits and returns to the first file's original pages, dropping anything inserted or opened alongside it.
7. In the **Export** panel on the right:
   - Pick **Keep quality** to write your edits without quality loss, or **Compress to a size** and set a limit.
   - Click the button at the bottom of the panel. The file appears in your downloads folder; click **Show in folder** on the result card to reveal it, or **Keep editing** to go back.

## Architecture

- **`extension/manifest.json`** — Manifest V3. Declares the action button, a service-worker background script, and the `downloads` permission.
- **`extension/background.js`** — opens `tool.html` in a new tab when the toolbar icon is clicked (re-focuses an existing tab if one is already open).
- **`extension/tool.html` / `tool.css` / `tool.js`** — the single-page UI. Edit state (`pageOrder` with per-page rotation and text annotations, undo history, current page, loaded documents) lives in JS; original bytes for each loaded PDF are kept in memory and re-fed to pdf-lib when saving.
- **`extension/vendor/`** — bundled `pdf.min.js`, `pdf.worker.min.js`, `pdf-lib.min.js`. Loaded from `chrome.runtime.getURL()` so the page works under the default MV3 CSP, which forbids remote scripts.
- **`extension/fonts/`** — bundled Inter and Space Grotesk (variable WOFF2, SIL Open Font License; license files alongside) used by the UI, so no font requests leave the browser.

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

The tool stops at the first preset whose output is at-or-below the requested target. If even the last preset is too large, the result is flagged as not reaching the target.

## Limits and caveats

- **Compression is lossy by design.** Each page is re-rendered as a JPEG image and embedded into a fresh PDF, so text in the output is no longer selectable or searchable. Use **Save as-is** when preserving text matters.
- **Added text uses the standard PDF fonts.** With **Save as-is**, a line containing characters those fonts can't encode (non-Latin scripts, for example) is left out, along with any lines after it in the same text box.
- **Long PDFs at high DPI are memory-hungry** in the early presets. The browser may take a while to grind through them.
- **MOTW on Windows.** See above — saved files carry the Internet zone tag.

## Flask app (legacy)

The original Flask version is still in this repo (`app.py`, `templates/index.html`, `requirements.txt`). It covers the original preview, reorganize, insert, and compress workflow plus a **Server** compression mode (PyMuPDF), and writes files straight to disk so Windows doesn't attach the MOTW tag. It doesn't have the extension's newer tools: rotate, blank pages, add text, undo/redo, and zoom.

Run it with:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Then open <http://127.0.0.1:5000>. Override the output folder with `$env:PDF_TOOL_OUTPUT_DIR = "C:\path\to\folder"`.
