"""Render PDF Smith store graphics (promo tiles + framed screenshots) with headless Chrome.

Usage: python store/design/render.py
Needs:  pip install playwright && playwright install chromium
Inputs:  extension/icons/logo-icon.svg, extension/fonts/*.woff2,
         store/screenshots/raw/*.png (plain 1280x800 captures of the app)
Outputs: store/promo/marquee-1400x560.png, store/promo/small-tile-440x280.png,
         store/screenshots/*.png (framed, captioned versions of the raw captures)
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ICON = (ROOT / "extension/icons/logo-icon.svg").as_uri()
FONTS = (ROOT / "extension/fonts").as_uri()
RAW = (ROOT / "store/screenshots/raw").as_uri()
PROMO = ROOT / "store/promo"
SHOTS_OUT = ROOT / "store/screenshots"

ICONS = {
    "shield": '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    "wifioff": '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.3-1.7"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>',
    "eyeoff": '<path d="M2 2l20 20"/><path d="M6.7 6.7C3.9 8.3 2 12 2 12s3.6 7 10 7c1.9 0 3.6-.6 5-1.5"/><path d="M10.6 5.1C11 5 11.5 5 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    "lock": '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    "check": '<path d="M5 12l5 5 9-10"/>',
}

def ic(name, size=20, stroke=2.2):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>')

BASE_CSS = """
@font-face { font-family: "Space Grotesk"; src: url(FONTS/space-grotesk-latin-wght-normal.woff2) format("woff2"); font-weight: 300 700; }
@font-face { font-family: "Inter"; src: url(FONTS/inter-latin-wght-normal.woff2) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; }
body { font-family: "Inter", sans-serif; color: #fff; overflow: hidden; -webkit-font-smoothing: antialiased; }
.stage {
  position: relative; width: 100%; height: 100%; overflow: hidden;
  background:
    radial-gradient(900px 600px at 88% -10%, rgba(249,115,22,.55), transparent 60%),
    radial-gradient(700px 500px at -10% 120%, rgba(194,65,12,.45), transparent 60%),
    linear-gradient(160deg, #1B1C22 0%, #111216 60%, #0B0C0F 100%);
}
.stage::before {   /* faint grid */
  content: ""; position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse at 30% 40%, #000 30%, transparent 75%);
}
.display { font-family: "Space Grotesk", sans-serif; font-weight: 700; letter-spacing: -0.02em; }
.hot { background: linear-gradient(90deg, #FDBA74, #FB923C 40%, #F97316); -webkit-background-clip: text; color: transparent; }
.chip {
  display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
  padding: 9px 16px 9px 12px; border-radius: 999px; font-weight: 600;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); color: #F4F4F5;
}
.chip svg { color: #FB923C; flex: none; }
.chip.ok { background: rgba(34,197,94,.14); border-color: rgba(74,222,128,.35); color: #BBF7D0; }
.chip.ok svg { color: #4ADE80; }
.window {
  position: absolute; border-radius: 14px; overflow: hidden; background: #fff;
  box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 30px 80px rgba(0,0,0,.55), 0 0 120px rgba(249,115,22,.18);
}
.window .bar { height: 30px; background: #E9E7E2; display: flex; align-items: center; gap: 7px; padding: 0 12px; }
.window .bar i { width: 11px; height: 11px; border-radius: 50%; background: #D4D0C7; display: block; }
.window .bar i:nth-child(1) { background: #F87171; } .window .bar i:nth-child(2) { background: #FBBF24; } .window .bar i:nth-child(3) { background: #4ADE80; }
.window .bar .url { margin-left: 14px; flex: 1; max-width: 340px; height: 18px; border-radius: 9px; background: #fff;
  font-size: 11px; color: #5B5F68; display: flex; align-items: center; gap: 5px; padding: 0 10px; }
.window img.shot { display: block; width: 100%; }
.badge-card {
  position: absolute; display: flex; align-items: center; gap: 14px;
  padding: 16px 22px 16px 16px; border-radius: 16px; background: #fff; color: #17181C;
  box-shadow: 0 20px 50px rgba(0,0,0,.45);
}
.badge-card .dot { width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; background: #DCFCE7; color: #16A34A; }
.badge-card b { display: block; font-size: 17px; }
.badge-card span { font-size: 14px; color: #5B5F68; }
"""

def page(w, h, body, extra_css=""):
    css = BASE_CSS.replace("FONTS/", FONTS + "/")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}{extra_css}
html, body {{ width: {w}px; height: {h}px; }}</style></head><body><div class="stage">{body}</div></body></html>"""

def window(src, url="PDF Smith"):
    return (f'<div class="bar"><i></i><i></i><i></i><div class="url">{ic("lock", 10, 2.6)}{url}</div></div>'
            f'<img class="shot" src="{src}">')

CHIPS = (f'<span class="chip ok">{ic("shield")}Nothing is uploaded</span>'
         f'<span class="chip">{ic("wifioff")}Works offline</span>'
         f'<span class="chip">{ic("eyeoff")}No tracking</span>')

# ---------- marquee 1400x560 ----------
marquee = page(1400, 560, f"""
<div style="position:absolute; left:84px; top:70px; width:640px;">
  <div style="display:flex; align-items:center; gap:16px; margin-bottom:34px;">
    <img src="{ICON}" width="64" height="64">
    <span class="display" style="font-size:30px;">PDF Smith</span>
  </div>
  <h1 class="display" style="font-size:66px; line-height:1.02;">Secure PDF editing.<br><span class="hot">100% offline.</span></h1>
  <p style="margin-top:22px; font-size:21px; line-height:1.45; color:#C9CBD1; max-width:560px;">
    Edit, merge and compress PDFs to an exact size. Your files never leave your device.</p>
  <div style="display:flex; gap:10px; margin-top:30px; font-size:15px;">{CHIPS}</div>
</div>
<div class="window" style="left:790px; top:78px; width:860px; transform: perspective(1800px) rotateY(-9deg) rotateX(2deg); transform-origin:left center;">
  {window(f"{RAW}/2-add-text.png")}
</div>
<div class="badge-card" style="left:720px; top:404px;">
  <div class="dot">{ic("lock", 24, 2.4)}</div>
  <div><b>Processed on this device</b><span>0 bytes uploaded · no account needed</span></div>
</div>
""")

# ---------- small tile 440x280 ----------
small = page(440, 280, f"""
<div style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 34px;">
  <div style="display:flex; align-items:center; gap:14px;">
    <img src="{ICON}" width="62" height="62">
    <div>
      <div class="display" style="font-size:32px; line-height:1;">PDF Smith</div>
      <div style="font-size:15px; color:#C9CBD1; margin-top:6px;">Edit &amp; compress PDFs</div>
    </div>
  </div>
  <div class="display" style="font-size:27px; line-height:1.15; margin-top:22px;">Secure &amp; <span class="hot">100% offline</span></div>
  <div style="display:flex; gap:8px; margin-top:16px; font-size:13px;">
    <span class="chip ok" style="padding:7px 12px 7px 9px;">{ic("shield", 16)}No uploads</span>
    <span class="chip" style="padding:7px 12px 7px 9px;">{ic("wifioff", 16)}Works offline</span>
  </div>
</div>
""", ".stage{background: radial-gradient(420px 300px at 100% 0%, rgba(249,115,22,.6), transparent 65%), radial-gradient(300px 220px at 0% 110%, rgba(194,65,12,.45), transparent 60%), linear-gradient(160deg,#1B1C22,#0B0C0F);}")

# ---------- screenshots 1280x800 ----------
SHOTS = [
    ("1-start", "Your PDFs stay on <span class='hot'>your device</span>",
     "No uploads, no account, no tracking — works fully offline."),
    ("2-add-text", "Add text <span class='hot'>anywhere</span> on a page",
     "Pick a font, size and color, then drag it into place."),
    ("3-organize", "Reorder, rotate &amp; <span class='hot'>merge</span> pages",
     "Drag thumbnails, insert blank pages or splice in other PDFs and images."),
    ("4-compressing", "Compress to an <span class='hot'>exact size</span>",
     "Set a limit like 500 KB — PDF Smith finds the best quality that fits."),
    ("5-result", "1.8 MB → 208 KB. <span class='hot'>Never uploaded.</span>",
     "Saved straight to your Downloads folder, processed entirely in your browser."),
]

def shot_page(name, title, sub):
    return page(1280, 800, f"""
<div style="position:absolute; left:0; right:0; top:44px; text-align:center;">
  <h1 class="display" style="font-size:46px; line-height:1.1;">{title}</h1>
  <p style="margin-top:12px; font-size:19px; color:#C9CBD1;">{sub}</p>
</div>
<div style="position:absolute; right:28px; top:22px; font-size:13px;">
  <span class="chip ok" style="padding:6px 12px 6px 9px;">{ic("lock", 14, 2.4)}100% offline</span>
</div>
<div class="window" style="left:160px; top:196px; width:960px;">{window(f"{RAW}/{name}.png")}</div>
""")

jobs = [(PROMO / "marquee-1400x560.png", marquee, 1400, 560), (PROMO / "small-tile-440x280.png", small, 440, 280)]
jobs += [(SHOTS_OUT / f"{n}.png", shot_page(n, t, s), 1280, 800) for n, t, s in SHOTS]

with sync_playwright() as p:
    b = p.chromium.launch()
    for fname, html, w, h in jobs:
        tmp = HERE / f"_{fname.stem}.html"
        tmp.write_text(html, encoding="utf-8")
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(tmp.as_uri()); pg.wait_for_timeout(300)
        pg.screenshot(path=str(fname))
        pg.close(); tmp.unlink()
    b.close()
print("done")
