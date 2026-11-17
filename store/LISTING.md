# Chrome Web Store listing — PDF Smith 1.1.0

Copy each field into the developer dashboard (https://chrome.google.com/webstore/devconsole).

## Package

Upload `dist/pdf-smith-1.1.0.zip`.

## Store listing tab

**Name** (from the manifest): PDF Smith

**Short description** (from the manifest, 118 of 132 characters):

> Secure, offline PDF editor. Reorder, rotate, add text, merge and compress PDFs to a target size — nothing is uploaded.

**Category:** Productivity › Tools

**Language:** English

**Detailed description:**

```
PDF Smith is a secure, offline PDF editor: your files never leave your computer. Open a PDF (or a JPG or PNG), make your changes, and save — everything happens inside your browser.

ORGANIZE PAGES
• Drag thumbnails to reorder pages
• Rotate or delete any page
• Insert blank pages, or splice in another PDF or image anywhere
• Open several files at once to merge them in order

ADD TEXT
• Click anywhere on a page and type
• Choose Helvetica, Times or Courier, any size, bold, italic and color
• Drag text to move it; double-click to edit

COMPRESS TO A SIZE
• Set a limit like 500 KB or 2 MB, or pick a preset
• PDF Smith steps down the quality until the file fits, and shows each attempt
• If the limit can't be reached, download the smallest version, raise the limit, or remove pages and retry

KEEP QUALITY
• Save your edits without recompressing, so text stays selectable

PRIVATE BY DESIGN
• Files never leave your computer — no uploads, no accounts, no tracking
• Works offline: the PDF engine and fonts are bundled with the extension
• Saved files go to your browser's Downloads folder

Also included: undo and redo, zoom (fit width, fit page, 25–300%), and keyboard shortcuts (T for text, V to select, Ctrl+Z / Ctrl+Y).

Good to know
• Compressing turns pages into images, so text in a compressed file can't be selected. Use Keep quality when that matters.
• Added text uses the standard PDF fonts; characters they don't support (for example non-Latin scripts) are kept exactly when you compress.
• On Windows, files saved by any browser are marked as downloaded from the internet, so File Explorer's preview pane may not show them. Opening the file works normally.

Click the PDF Smith icon in your toolbar to start.
```

**Graphic assets:**

| Field | File |
| --- | --- |
| Store icon (128×128) | `extension/icons/icon-128.png` |
| Screenshots (1280×800) | `store/screenshots/1-start.png` … `5-result.png` (upload in that order; framed versions — plain captures are in `store/screenshots/raw/`) |
| Small promo tile (440×280) | `store/promo/small-tile-440x280.png` |
| Marquee promo tile (1400×560, optional) | `store/promo/marquee-1400x560.png` |

**Homepage URL:** https://github.com/anamsimon/pdf-smith

**Support URL:** https://github.com/anamsimon/pdf-smith/issues

## Privacy tab

**Single purpose description:**

> PDF Smith edits and compresses PDF files locally in the browser: reorder, rotate, insert, delete and annotate pages, then save the result or compress it to a target file size.

**Permission justification — `downloads`:**

> Used to save the PDF the user exports to their Downloads folder, and to reveal that file in their file manager when they click "Show in folder". No other downloads are read or changed.

**Remote code:** No, I am not using remote code. (All JavaScript, including PDF.js and pdf-lib, is bundled in the package.)

**Data usage:** tick none of the data types — PDF Smith collects no user data.

Certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/anamsimon/pdf-smith/blob/main/PRIVACY.md
(available once `PRIVACY.md` is pushed to GitHub)

## Distribution tab

**Visibility:** Public · **Regions:** All regions · **Pricing:** Free

## Notes for the reviewer (optional field)

> PDF Smith works entirely offline. The minified files in vendor/ are unmodified official releases of PDF.js 3.11.174 and pdf-lib 1.17.1; vendor/README.md lists their SHA-256 hashes and sources. Click the toolbar icon to open the tool, then drop any PDF onto the page.

## Regenerating the graphics

The promo tiles and framed screenshots are built from `extension/icons/logo-icon.svg` and the plain captures in `store/screenshots/raw/`:

```
pip install playwright
playwright install chromium
python store/design/render.py
```

To change a headline, edit `SHOTS` in `store/design/render.py`.
