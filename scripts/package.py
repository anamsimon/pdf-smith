"""Build the Chrome Web Store upload: dist/pdf-smith-<version>.zip

Run from anywhere:  python scripts/package.py

Zips the contents of extension/ (manifest.json at the root of the archive),
using forward-slash paths, and skips local-only files such as the draft logos.
"""
import fnmatch
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
DIST = ROOT / "dist"

# Files that live in extension/ but must not ship.
EXCLUDE = [
    "icons/logo-*",   # draft logo artwork, not referenced by the extension
    ".*", "*/.*",     # dotfiles (.DS_Store etc.)
    "Thumbs.db", "desktop.ini",
]


def main() -> int:
    manifest = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]

    # Every file the manifest points at must exist, or the store rejects the upload.
    icons = set(manifest.get("icons", {}).values()) | set(manifest.get("action", {}).get("default_icon", {}).values())
    required = icons | {manifest["background"]["service_worker"]}
    missing = [p for p in sorted(required) if not (EXT / p).is_file()]
    if missing:
        print("Missing files referenced by manifest.json:", ", ".join(missing))
        return 1

    files = []
    for path in sorted(EXT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(EXT).as_posix()
        if any(fnmatch.fnmatch(rel, pat) for pat in EXCLUDE):
            continue
        files.append((path, rel))

    DIST.mkdir(exist_ok=True)
    out = DIST / f"pdf-smith-{version}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path, rel in files:
            z.write(path, rel)

    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    print(f"Created {out.relative_to(ROOT)}  ({len(files)} files, {out.stat().st_size:,} bytes)")
    print(f"SHA-256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
