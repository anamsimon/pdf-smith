# Third-party libraries

These files are unmodified copies of the official npm releases. Each SHA-256 below matches the file in the published package byte for byte.

| File | Library | Version | Source in npm package | License |
| --- | --- | --- | --- | --- |
| `pdf.min.js` | PDF.js (`pdfjs-dist`) | 3.11.174 | `build/pdf.min.js` | Apache-2.0 (`LICENSE-pdfjs.txt`) |
| `pdf.worker.min.js` | PDF.js (`pdfjs-dist`) | 3.11.174 | `build/pdf.worker.min.js` | Apache-2.0 (`LICENSE-pdfjs.txt`) |
| `pdf-lib.min.js` | pdf-lib | 1.17.1 | `dist/pdf-lib.min.js` | MIT (`LICENSE-pdf-lib.md`) |

```
5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946  pdf.min.js
feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b  pdf.worker.min.js
0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f  pdf-lib.min.js
```

## Sources

- PDF.js: https://github.com/mozilla/pdf.js (release v3.11.174) · npm: https://www.npmjs.com/package/pdfjs-dist/v/3.11.174
- pdf-lib: https://github.com/Hopding/pdf-lib (v1.17.1) · npm: https://www.npmjs.com/package/pdf-lib/v/1.17.1

To verify, download the packages and compare hashes:

```
npm pack pdfjs-dist@3.11.174 pdf-lib@1.17.1
```

## Fonts

`../fonts/` holds Inter and Space Grotesk (variable WOFF2, Latin subsets) from the `@fontsource-variable/inter` and `@fontsource-variable/space-grotesk` npm packages (v5.3.0), under the SIL Open Font License 1.1. The license files are included alongside.
