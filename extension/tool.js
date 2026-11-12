pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js');

const $ = (id) => document.getElementById(id);

// ---- Elements ----------------------------------------------------------------
const fileInput        = $('file');
const drop             = $('drop');
const uploader         = $('uploader');
const viewer           = $('viewer');
const thumbsEl         = $('thumbs');
const previewEl        = $('preview');
const headerTitle      = $('headerTitle');
const headerSubtitle   = $('headerSubtitle');
const changeFileBtn    = $('changeFileBtn');
const insertFileInput  = $('insertFile');
const resetBtn         = $('resetBtn');
const pageCountEl      = $('pageCount');
const appendFileBtn    = $('appendFileBtn');

const selectModeBtn    = $('selectModeBtn');
const textModeBtn      = $('textModeBtn');
const insertMenuBtn    = $('insertMenuBtn');
const insertMenu       = $('insertMenu');
const insertMenuLabel  = $('insertMenuLabel');
const undoBtn          = $('undoBtn');
const redoBtn          = $('redoBtn');
const shapesMenuBtn    = $('shapesMenuBtn');
const shapesMenu       = $('shapesMenu');
const shapeBar         = $('shapeBar');
const spStroke         = $('spStroke');
const spStrokeSwatch   = $('spStrokeSwatch');
const spWidth          = $('spWidth');
const spFillGroup      = $('spFillGroup');
const spFill           = $('spFill');
const spFillSwatch     = $('spFillSwatch');
const spNoFill         = $('spNoFill');
const spDelete         = $('spDelete');
const modeBanner       = $('modeBanner');

const zoomOutBtn       = $('zoomOutBtn');
const zoomInBtn        = $('zoomInBtn');
const zoomSelect       = $('zoomSelect');
const prevPageBtn      = $('prevPageBtn');
const nextPageBtn      = $('nextPageBtn');
const pagerLabel       = $('pagerLabel');

const exportForm       = $('exportForm');
const exportWorking    = $('exportWorking');
const result           = $('result');
const exportSub        = $('exportSub');
const modeKeep         = $('modeKeep');
const modeCompress     = $('modeCompress');
const keepEstimate     = $('keepEstimate');
const sizeBlock        = $('sizeBlock');
const sizeInput        = $('size');
const sizeChips        = $('sizeChips');
const underLimitNote   = $('underLimitNote');
const underLimitText   = $('underLimitText');
const formError        = $('formError');
const submit           = $('submit');
const submitLabel      = $('submitLabel');
const progress         = $('progress');
const progressFill     = $('progressFill');
const workPreset       = $('workPreset');
const workPage         = $('workPage');
const ladderEl         = $('ladder');
const cancelBtn        = $('cancelBtn');

const styleBar  = $('styleBar');
const tpFont    = $('tpFont');
const tpSize    = $('tpSize');
const tpBold    = $('tpBold');
const tpItalic  = $('tpItalic');
const tpColor   = $('tpColor');
const tpSwatch  = $('tpSwatch');
const tpDelete  = $('tpDelete');
const toastEl   = $('toast');

// ---- State -------------------------------------------------------------------
const docs = [];
let pageOrder = [];
let originalPageCount = 0;
let currentRef = null;
const thumbCache = new Map();
const refKey = (r) => `${r.doc}:${r.page}`;
let pendingInsertIndex = null;

const thumbPlaceholder = document.createElement('div');
thumbPlaceholder.className = 'thumb-placeholder';
let draggingKey = null;
let dropBeforeKey = null;

let currentFile = null;
let savedStateJSON = '[]';
let previewRenderObserver = null;
let previewGeneration = 0;
// Bumped whenever a file is opened or closed; async loads stop once it changes
// so an abandoned load can't write into the next session.
let loadGeneration = 0;
const isStale = (gen) => gen !== loadGeneration;
let scrollSyncTimer = null;
let scrollSyncPausedUntil = 0;

// zoomMode: 'width' | 'page' | number (1 = 100% = actual size)
let zoomMode = 'width';
let lastEffectiveZoom = 1;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const PT_TO_PX = 96 / 72;

const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 100;

let textMode = false;
let activeAnn = null;     // { idx, annId, editing, isNew, dirty, preSnapshot }
let dragState = null;     // active annotation drag
let nextAnnId = 1;
const lastStyle = { fontFamily: 'Helvetica', fontSize: 16, bold: false, italic: false, color: '#000000' };

// Shapes: stored in ref.annotations as { type: 'shape', shape, xFrac, yFrac,
// x2Frac, y2Frac, stroke, strokeWidth (pt), fill|null }. The two points are
// the drag start/end, so lines and boxes share one representation.
const SHAPE_KINDS = { rect: 'rectangle', ellipse: 'ellipse', line: 'line', arrow: 'arrow' };
const SVG_NS = 'http://www.w3.org/2000/svg';
let shapeTool = null;     // 'rect' | 'ellipse' | 'line' | 'arrow' | null
let activeShape = null;   // { idx, annId, dirty }
let shapeDrag = null;     // active draw / move / resize
const lastShapeStyle = { stroke: '#DC2626', strokeWidth: 2, fill: null };

let unit = 'KB';
let busy = false;
let cancelRequested = false;
let lastResult = null;    // bytes kept when the target wasn't reached

// ---- Helpers -----------------------------------------------------------------
const trimNum = (n, d) => String(+n.toFixed(d));
const fmt = (b) => {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) { const kb = b / 1024; return trimNum(kb, kb < 100 ? 1 : 0) + ' KB'; }
  const mb = b / 1024 / 1024;
  return trimNum(mb, mb < 10 ? 2 : 1) + ' MB';
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

const icon = (id, size = 16, extra = '') =>
  `<svg class="ic" width="${size}" height="${size}" ${extra}><use href="#${id}"/></svg>`;

let toastTimer = null;
function toast(msg, ms = 3800) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function currentIndex() {
  if (!currentRef) return 0;
  const i = pageOrder.findIndex(r => refKey(r) === refKey(currentRef));
  return i < 0 ? 0 : i;
}

// PDF.js's getViewport({ rotation }) replaces the page's own /Rotate instead
// of adding to it, so always combine the two.
const viewRotation = (page, ref) => ((page.rotate || 0) + ((ref && ref.rotation) || 0)) % 360;

// Chrome refuses canvases beyond ~16k px a side or ~268M px in area; stay well
// under that so oversized pages render at reduced resolution instead of failing.
const MAX_CANVAS_SIDE = 8192;
const MAX_CANVAS_AREA = 40e6;
function capRenderScale(baseViewport, scale) {
  const { width: w, height: h } = baseViewport;
  return Math.min(scale, MAX_CANVAS_SIDE / w, MAX_CANVAS_SIDE / h, Math.sqrt(MAX_CANVAS_AREA / (w * h)));
}

// ---- Undo / Redo history ----------------------------------------------------
// History is a stack of pageOrder snapshots. pageOrder holds page order,
// per-page rotation and text annotations, so a snapshot fully captures the
// editable state. docs[] is append-only, so undone inserts leave a harmless
// unreferenced doc entry that a redo can point back to.
function clonePageOrder() {
  return structuredClone(pageOrder);
}

function updateUndoRedoUI() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

// Push a pre-action snapshot. Pass an explicit snapshot for async actions
// (e.g. inserting files) so the captured state predates the mutation.
function commitHistory(snapshot) {
  undoStack.push(snapshot || clonePageOrder());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedoUI();
}

function recordHistory() {
  commitHistory(clonePageOrder());
}

function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoRedoUI();
}

// Rebuild the UI after pageOrder is swapped to a restored snapshot.
function applyRestoredState() {
  dragState = null;
  shapeDrag = null;
  if (currentRef) {
    const key = refKey(currentRef);
    currentRef = pageOrder.find(r => refKey(r) === key) || pageOrder[0] || null;
  } else {
    currentRef = pageOrder[0] || null;
  }
  rebuildThumbList();
  // Thumbnails are shared per source page; re-render so rotation matches.
  const seen = new Set();
  for (const ref of pageOrder) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const wrap = thumbCache.get(key);
    if (wrap) rerenderThumbElement(wrap, ref.doc, ref.page, ref.rotation || 0);
  }
  buildContinuousPreview(currentRef);
  updateEditStatus();
  updateUndoRedoUI();
}

function undo() {
  finalizeActive();
  if (!undoStack.length) return;
  redoStack.push(clonePageOrder());
  pageOrder = undoStack.pop();
  applyRestoredState();
}

function redo() {
  finalizeActive();
  if (!redoStack.length) return;
  undoStack.push(clonePageOrder());
  pageOrder = redoStack.pop();
  applyRestoredState();
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// ---- Keyboard ----------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (viewer.classList.contains('hidden')) return;
  const t = e.target;
  const tag = (t && t.tagName) || '';
  const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);

  if (e.key === 'Escape') {
    if (!insertMenu.classList.contains('hidden')) { closeInsertMenu(); insertMenuBtn.focus(); return; }
    if (!shapesMenu.classList.contains('hidden')) { closeShapesMenu(); shapesMenuBtn.focus(); return; }
    if (shapeDrag) return;
    if (activeShape) { deselectShape(); return; }
    if (shapeTool) { setShapeTool(null); return; }
    if (activeAnn) { e.preventDefault(); finalizeActive(); return; }
    if (textMode) { setTextMode(false); return; }
    return;
  }
  if (inField) return; // let native text editing and undo work

  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    return;
  }
  if (e.altKey) return;

  if (e.key === '[') { e.preventDefault(); togglePanel('pages'); return; }
  if (e.key === ']') { e.preventDefault(); togglePanel('export'); return; }

  // Only act on selected text when focus isn't on another control (a focused
  // button should still respond to Enter, for example).
  const focusOnPage = t === document.body || t === document.documentElement || previewEl.contains(t);
  if (activeShape && focusOnPage && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault(); deleteActiveShape(); return;
  }
  if (activeAnn && !activeAnn.editing && focusOnPage) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteActiveAnnotation(); return; }
    if (e.key === 'Enter') { e.preventDefault(); startEditing(); return; }
  }
  const k = e.key.toLowerCase();
  const shapeKeys = { r: 'rect', o: 'ellipse', l: 'line', a: 'arrow' };
  if (k === 't') { e.preventDefault(); setTextMode(!textMode); }
  else if (k === 'v') { e.preventDefault(); setShapeTool(null); setTextMode(false); }
  else if (shapeKeys[k]) { e.preventDefault(); setShapeTool(shapeTool === shapeKeys[k] ? null : shapeKeys[k]); }
});

// ---- Start screen ------------------------------------------------------------
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFiles(Array.from(fileInput.files));
});
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('drag');
}));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('drag');
}));
drop.addEventListener('drop', e => {
  if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
});
// Allow dropping anywhere on the start screen, not only on the card.
uploader.addEventListener('dragover', e => e.preventDefault());
uploader.addEventListener('drop', e => {
  e.preventDefault();
  if (e.target.closest('#drop')) return;
  if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
});

// ---- Modes & toolbar ---------------------------------------------------------
function setTextMode(on) {
  textMode = !!on;
  if (!textMode) finalizeActive();
  if (textMode) { shapeTool = null; deselectShape(); }
  updateModeUI();
}

function setShapeTool(kind) {
  if (textMode) { textMode = false; finalizeActive(); }
  shapeTool = SHAPE_KINDS[kind] ? kind : null;
  if (shapeTool) deselectShape();
  updateModeUI();
}

function updateModeUI() {
  textModeBtn.setAttribute('aria-pressed', String(textMode));
  shapesMenuBtn.setAttribute('aria-pressed', String(!!shapeTool));
  selectModeBtn.setAttribute('aria-pressed', String(!textMode && !shapeTool));
  viewer.classList.toggle('text-mode', textMode);
  viewer.classList.toggle('shape-mode', !!shapeTool);
  modeBanner.classList.toggle('hidden', !textMode && !shapeTool);
  const icon = $('modeBannerIcon'), text = $('modeBannerText');
  if (shapeTool) {
    icon.innerHTML = `<svg class="ic" width="14" height="14"><use href="#i-${shapeTool}"/></svg>`;
    const how = shapeTool === 'line' || shapeTool === 'arrow' ? 'Shift snaps to 45°' : 'Shift keeps it square';
    text.textContent = `Drag on a page to draw ${shapeTool === 'ellipse' || shapeTool === 'arrow' ? 'an' : 'a'} ${SHAPE_KINDS[shapeTool]}. ${how}. Esc to exit.`;
  } else {
    icon.textContent = 'T';
    text.textContent = 'Text mode — click anywhere on a page to add text. Press Esc to exit.';
  }
}
selectModeBtn.addEventListener('click', () => { setShapeTool(null); setTextMode(false); });
textModeBtn.addEventListener('click', () => setTextMode(!textMode));

function openInsertMenu() {
  insertMenuLabel.textContent = pageOrder.length ? `After page ${currentIndex() + 1}` : 'At the end';
  insertMenu.classList.remove('hidden');
  insertMenuBtn.setAttribute('aria-expanded', 'true');
  const first = insertMenu.querySelector('.menu-item');
  if (first) first.focus();
}
function closeInsertMenu() {
  insertMenu.classList.add('hidden');
  insertMenuBtn.setAttribute('aria-expanded', 'false');
}
insertMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeShapesMenu();
  if (insertMenu.classList.contains('hidden')) openInsertMenu(); else closeInsertMenu();
});

function openShapesMenu() {
  shapesMenu.classList.remove('hidden');
  shapesMenuBtn.setAttribute('aria-expanded', 'true');
  const current = shapesMenu.querySelector(`[data-shape="${shapeTool}"]`) || shapesMenu.querySelector('.menu-item');
  if (current) current.focus();
}
function closeShapesMenu() {
  shapesMenu.classList.add('hidden');
  shapesMenuBtn.setAttribute('aria-expanded', 'false');
}
shapesMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeInsertMenu();
  if (shapesMenu.classList.contains('hidden')) openShapesMenu(); else closeShapesMenu();
});
shapesMenu.querySelectorAll('[data-shape]').forEach(item => item.addEventListener('click', () => {
  closeShapesMenu();
  setShapeTool(item.dataset.shape);
}));
$('insertFileMenuItem').addEventListener('click', () => {
  closeInsertMenu();
  triggerInsert(pageOrder.length ? currentIndex() + 1 : 0);
});
$('insertBlankMenuItem').addEventListener('click', () => {
  closeInsertMenu();
  insertBlankPage(pageOrder.length ? currentIndex() + 1 : 0);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) { closeInsertMenu(); closeShapesMenu(); }
});
appendFileBtn.addEventListener('click', () => triggerInsert(pageOrder.length));

// ---- Zoom & pager ------------------------------------------------------------
function buildZoomOptions() {
  const opts = [['width', 'Fit width'], ['page', 'Fit page'], ...ZOOM_STEPS.map(z => [String(z), Math.round(z * 100) + '%'])];
  zoomSelect.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}
buildZoomOptions();

// Zoom of the page you're looking at (fit modes differ per page size).
function effectiveZoom() {
  if (typeof zoomMode === 'number') return zoomMode;
  const slot = previewEl.querySelectorAll('.preview-page')[currentIndex()];
  return slot && slot._scale ? slot._scale / PT_TO_PX : lastEffectiveZoom;
}

function updateZoomUI() {
  zoomSelect.value = typeof zoomMode === 'number' ? String(zoomMode) : zoomMode;
  const z = effectiveZoom();
  zoomOutBtn.disabled = z <= ZOOM_STEPS[0] + 0.001;
  zoomInBtn.disabled = z >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.001;
}
function setZoom(mode) {
  zoomMode = mode;
  updateZoomUI();
  buildContinuousPreview(currentRef);
}
zoomSelect.addEventListener('change', () => {
  const v = zoomSelect.value;
  setZoom(v === 'width' || v === 'page' ? v : parseFloat(v));
});
zoomInBtn.addEventListener('click', () => {
  const z = effectiveZoom();
  const next = ZOOM_STEPS.find(s => s > z + 0.01);
  if (next) setZoom(next);
});
zoomOutBtn.addEventListener('click', () => {
  const z = effectiveZoom();
  const prev = [...ZOOM_STEPS].reverse().find(s => s < z - 0.01);
  if (prev) setZoom(prev);
});

function updatePager() {
  const total = pageOrder.length;
  const idx = currentIndex();
  pagerLabel.textContent = total ? `Page ${idx + 1} of ${total}` : 'No pages';
  prevPageBtn.disabled = idx <= 0;
  nextPageBtn.disabled = idx >= total - 1;
}
prevPageBtn.addEventListener('click', () => {
  const i = currentIndex();
  if (i > 0) selectPage(pageOrder[i - 1]);
});
nextPageBtn.addEventListener('click', () => {
  const i = currentIndex();
  if (i < pageOrder.length - 1) selectPage(pageOrder[i + 1]);
});

// ---- Close / reset -----------------------------------------------------------
changeFileBtn.addEventListener('click', () => {
  if (busy) { toast('Wait for the export to finish, or cancel it first.'); return; }
  if (isDirty() && !confirm('Close this file? Your unsaved edits will be lost.')) return;
  finalizeActive();
  loadGeneration++;
  if (previewRenderObserver) { previewRenderObserver.disconnect(); previewRenderObserver = null; }
  zoomMode = 'width'; updateZoomUI();
  setTextMode(false);
  currentFile = null;
  docs.length = 0;
  pageOrder = [];
  originalPageCount = 0;
  currentRef = null;
  lastResult = null;
  clearHistory();
  thumbCache.clear();
  thumbsEl.innerHTML = '';
  previewEl.innerHTML = '<div class="placeholder">Loading preview…</div>';
  showExportView('form');
  viewer.classList.add('hidden');
  uploader.classList.remove('hidden');
  fileInput.value = '';
  document.title = 'PDF Smith';
});

resetBtn.addEventListener('click', () => {
  if (!docs[0]) return;
  if (busy) { toast('Wait for the export to finish, or cancel it first.'); return; }
  finalizeActive();
  const hadRotations = pageOrder.some(r => (r.rotation || 0) !== 0);
  docs.length = 1;
  for (const k of Array.from(thumbCache.keys())) {
    if (!k.startsWith('0:')) thumbCache.delete(k);
  }
  pageOrder = Array.from({ length: originalPageCount }, (_, i) => ({ doc: 0, page: i + 1, rotation: 0, annotations: [] }));
  if (!currentRef || currentRef.doc !== 0 || currentRef.page > originalPageCount) {
    currentRef = pageOrder[0];
  }
  if (hadRotations) {
    for (let p = 1; p <= originalPageCount; p++) {
      const wrap = thumbCache.get(`0:${p}`);
      if (wrap) rerenderThumbElement(wrap, 0, p, 0);
    }
  }
  clearHistory();
  rebuildThumbList();
  buildContinuousPreview(currentRef);
  updateEditStatus();
});

// ---- Edit status -------------------------------------------------------------
function hasInsertedDocs() { return pageOrder.some(r => r.doc !== 0); }

function isOrderChanged() {
  if (pageOrder.length !== originalPageCount) return true;
  for (let i = 0; i < pageOrder.length; i++) {
    const r = pageOrder[i];
    if (r.doc !== 0 || r.page !== i + 1 || (r.rotation || 0) !== 0) return true;
  }
  return false;
}

function hasAnnotations() {
  return pageOrder.some(r => r.annotations && r.annotations.some(a => a.text || a.type === 'shape'));
}

function isEdited() {
  return hasInsertedDocs() || isOrderChanged() || hasAnnotations();
}

function isDirty() {
  return !!pageOrder.length && JSON.stringify(pageOrder) !== savedStateJSON;
}

// `exportedJSON` is the state the saved file was built from; edits made while
// an export ran aren't in the file, so they stay "unsaved".
function markSaved(exportedJSON) {
  savedStateJSON = exportedJSON;
  updateEditStatus();
}

// Original file size of every source file that still contributes a page
// (shown in the header; follows deletes, inserts and undo).
function fileSizeInUse() {
  const used = new Set(pageOrder.map(r => r.doc));
  let sum = 0;
  used.forEach(d => { if (docs[d]) sum += docs[d].size; });
  return sum;
}

// Bytes of every source document that contributes at least one page.
function sourceBytesInUse() {
  const used = new Set(pageOrder.map(r => r.doc));
  let sum = 0;
  used.forEach(d => { if (docs[d]) sum += docs[d].bytes.byteLength; });
  return sum;
}

function updateEditStatus() {
  const total = pageOrder.length;
  pageCountEl.textContent = `PAGES · ${total}`;
  $('pagesRailLabel').textContent = `PAGES · ${total}`;
  resetBtn.disabled = !(isEdited() || docs.length > 1);
  const parts = [`${total} page${total === 1 ? '' : 's'}`, fmt(fileSizeInUse())];
  headerSubtitle.innerHTML = escapeHtml(parts.join(' · ')) +
    (isDirty() ? ' · <span class="unsaved">Unsaved edits</span>' : '');
  exportSub.textContent = `Choose how to save your ${total} page${total === 1 ? '' : 's'}.`;
  keepEstimate.textContent = isEdited() ? '' : ` ~${fmt(docs[0] ? docs[0].bytes.byteLength : 0)}`;
  updatePager();
  updateExportForm();
}

// ---- Loading files -----------------------------------------------------------
function classifyFile(file) {
  const lower = file.name.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || file.type === 'application/pdf';
  const isImg = /\.(jpe?g|png)$/.test(lower) || file.type === 'image/jpeg' || file.type === 'image/png';
  return isPdf ? 'pdf' : isImg ? 'img' : null;
}

async function handleFiles(files) {
  const valid = [];
  const skipped = [];
  for (const file of files) {
    const kind = classifyFile(file);
    if (!kind) { skipped.push(file.name); continue; }
    valid.push({ file, isPdf: kind === 'pdf' });
  }
  if (skipped.length) toast(`Skipped ${skipped.join(', ')} — only PDF, JPG and PNG files are supported.`);
  if (!valid.length) return;
  const gen = ++loadGeneration;

  currentFile = valid[0].file;
  headerTitle.textContent = valid.length === 1 ? valid[0].file.name : `${valid[0].file.name} + ${valid.length - 1} more`;
  headerTitle.title = valid.map(v => v.file.name).join('\n');
  document.title = `${valid[0].file.name} — PDF Smith`;

  zoomMode = 'width'; updateZoomUI();
  lastResult = null;
  showExportView('form');
  uploader.classList.add('hidden');
  viewer.classList.remove('hidden');
  previewEl.innerHTML = '<div class="placeholder">Loading preview…</div>';

  // Load the first file that opens as the base document.
  let firstEntry = null;
  while (valid.length && !firstEntry) {
    const { file, isPdf } = valid[0];
    try {
      firstEntry = isPdf ? await loadDoc(file)
        : await loadDocFromBytes(await imageFileToPdfBytes(file), file.name, file.size);
      if (isStale(gen)) return;
    } catch (err) {
      if (isStale(gen)) return;
      valid.shift();
      if (valid.length) toast(`Couldn't open "${file.name}": ${err.message}`);
      else {
        previewEl.innerHTML = `<div class="placeholder err">Couldn't open "${escapeHtml(file.name)}": ${escapeHtml(err.message)}</div>`;
        return;
      }
    }
  }
  currentFile = valid[0].file;
  headerTitle.textContent = valid.length === 1 ? currentFile.name : `${currentFile.name} + ${valid.length - 1} more`;
  document.title = `${currentFile.name} — PDF Smith`;
  docs.length = 0;
  thumbCache.clear();
  docs.push(firstEntry);

  originalPageCount = docs[0].pdf.numPages;
  pageOrder = Array.from({ length: originalPageCount }, (_, i) => ({ doc: 0, page: i + 1, rotation: 0, annotations: [] }));
  clearHistory();
  await renderDocThumbnails(0, gen);
  if (isStale(gen)) return;
  rebuildThumbList();
  currentRef = pageOrder[0];
  updateThumbActive();
  buildContinuousPreview(currentRef);

  // Append remaining files
  for (let i = 1; i < valid.length; i++) {
    const { file, isPdf } = valid[i];
    try {
      let entry;
      if (isPdf) {
        entry = await loadDoc(file);
      } else {
        const pdfBytes = await imageFileToPdfBytes(file);
        entry = await loadDocFromBytes(pdfBytes, file.name, file.size);
      }
      if (isStale(gen)) return;
      const docIdx = docs.length;
      docs.push(entry);
      await renderDocThumbnails(docIdx, gen);
      if (isStale(gen)) return;
      const newRefs = Array.from({ length: entry.pdf.numPages }, (_, j) => ({ doc: docIdx, page: j + 1, rotation: 0, annotations: [] }));
      pageOrder.push(...newRefs);
    } catch (err) {
      if (isStale(gen)) return;
      toast(`Couldn't open "${file.name}": ${err.message}`);
    }
  }

  if (valid.length > 1) {
    rebuildThumbList();
    buildContinuousPreview(currentRef);
  }
  // Opening several files at once is the starting point, not an unsaved edit.
  savedStateJSON = JSON.stringify(pageOrder);
  updateEditStatus();
}

async function loadDoc(file) {
  const buf = await file.arrayBuffer();
  return loadDocFromBytes(new Uint8Array(buf), file.name, file.size);
}

async function loadDocFromBytes(bytes, name, size = bytes.byteLength) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  return { pdf, bytes, name, size };
}

// EXIF orientation (1–8) of a JPEG, or 1 when absent. Phone cameras store
// pixels unrotated and rely on this tag, which pdf-lib ignores.
function jpegOrientation(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return 1;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xFFE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) { // "Exif"
      const tiff = off + 10;
      const le = v.getUint16(tiff) === 0x4949;
      const ifd = tiff + v.getUint32(tiff + 4, le);
      if (ifd + 2 > v.byteLength) return 1;
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > v.byteLength) return 1;
        if (v.getUint16(e, le) === 0x0112) {
          const o = v.getUint16(e + 8, le);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) return 1; // start of scan / not a marker
    off += 2 + len;
  }
  return 1;
}

// Decode with the browser (which applies EXIF orientation) and re-encode.
async function redrawImage(file, asPng) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!asPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise(r => canvas.toBlob(r, asPng ? 'image/png' : 'image/jpeg', 0.92));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('Couldn\'t read this image');
  return new Uint8Array(await blob.arrayBuffer());
}

async function imageFileToPdfBytes(file) {
  if (typeof PDFLib === 'undefined') throw new Error('pdf-lib failed to load');
  let bytes = new Uint8Array(await file.arrayBuffer());
  const lower = file.name.toLowerCase();
  const isPng = lower.endsWith('.png') || file.type === 'image/png';
  const isJpg = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || file.type === 'image/jpeg';
  if (!isPng && !isJpg) throw new Error('Unsupported image type');

  const newDoc = await PDFLib.PDFDocument.create();
  if (isJpg && jpegOrientation(bytes) !== 1) bytes = await redrawImage(file, false);
  let img;
  try {
    img = isPng ? await newDoc.embedPng(bytes) : await newDoc.embedJpg(bytes);
  } catch {
    // Some valid images (e.g. unusual PNG/JPEG encodings) aren't supported by
    // pdf-lib; let the browser decode them instead.
    img = isPng ? await newDoc.embedPng(await redrawImage(file, true))
                : await newDoc.embedJpg(await redrawImage(file, false));
  }

  let pageW, pageH;
  if (docs[0] && docs[0].pdf.numPages > 0) {
    const p = await docs[0].pdf.getPage(1);
    const vp = p.getViewport({ scale: 1 });
    pageW = vp.width;
    pageH = vp.height;
  } else {
    const landscape = img.width > img.height;
    pageW = landscape ? 792 : 612;
    pageH = landscape ? 612 : 792;
  }

  const scale = Math.min(pageW / img.width, pageH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const page = newDoc.addPage([pageW, pageH]);
  page.drawImage(img, {
    x: (pageW - drawW) / 2,
    y: (pageH - drawH) / 2,
    width: drawW,
    height: drawH,
  });
  return await newDoc.save({ useObjectStreams: true });
}

// ---- Thumbnails --------------------------------------------------------------
const THUMB_RENDER_WIDTH = 360; // ~2x the on-screen width for sharp thumbnails

async function renderDocThumbnails(docIdx, gen = loadGeneration) {
  const entry = docs[docIdx];
  const total = entry.pdf.numPages;
  for (let p = 1; p <= total; p++) {
    if (isStale(gen)) return;
    const ref = { doc: docIdx, page: p };
    const wrap = buildThumbElement(ref);
    thumbCache.set(refKey(ref), wrap);
    await rerenderThumbElement(wrap, docIdx, p, 0);
  }
}

async function rerenderThumbElement(wrap, docIdx, pageNum, rotation) {
  if (!docs[docIdx]) return;
  wrap._rot = rotation || 0; // the user rotation this thumbnail shows
  try {
    const page = await docs[docIdx].pdf.getPage(pageNum);
    rotation = viewRotation(page, { rotation });
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const scale = THUMB_RENDER_WIDTH / baseViewport.width;
    const viewport = page.getViewport({ scale, rotation });
    const canvas = wrap.querySelector('canvas');
    if (wrap._task) { try { wrap._task.cancel(); } catch {} }
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    wrap._task = task;
    await task.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error('thumbnail render failed', err);
  }
}

const GRIP_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

function buildThumbElement(ref) {
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  wrap.dataset.ref = refKey(ref);
  wrap.draggable = true;
  wrap.tabIndex = 0;

  const num = document.createElement('span');
  num.className = 'thumb-num';
  wrap.appendChild(num);

  const frame = document.createElement('div');
  frame.className = 'thumb-frame';
  frame.appendChild(document.createElement('canvas'));
  if (ref.doc !== 0 && docs[ref.doc]) {
    const badge = document.createElement('span');
    badge.className = 'badge-doc';
    const name = docs[ref.doc].name;
    badge.textContent = name === 'blank.pdf' ? 'Blank' : 'Added';
    badge.title = name === 'blank.pdf' ? 'Blank page' : `Inserted from ${name}`;
    frame.appendChild(badge);
  }
  wrap.appendChild(frame);

  const actions = document.createElement('div');
  actions.className = 'thumb-actions';
  actions.innerHTML = `
    <button type="button" class="thumb-act rot" aria-label="Rotate page 90°" title="Rotate 90°">${icon('i-rotate', 15)}</button>
    <button type="button" class="thumb-act del" aria-label="Delete page" title="Delete page">${icon('i-trash', 15)}</button>
    <span class="thumb-grip" aria-hidden="true" title="Drag to reorder">${GRIP_SVG}</span>`;
  actions.querySelector('.rot').addEventListener('click', (e) => {
    e.stopPropagation();
    rotatePageByKey(wrap.dataset.ref);
  });
  actions.querySelector('.del').addEventListener('click', (e) => {
    e.stopPropagation();
    deletePageAt(wrap.dataset.ref);
  });
  wrap.appendChild(actions);

  wrap.addEventListener('click', () => selectPage(ref));
  wrap.addEventListener('keydown', (e) => {
    if (e.target !== wrap) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPage(ref); }
    else if (e.key === 'Delete') { e.preventDefault(); deletePageAt(wrap.dataset.ref); }
  });

  wrap.addEventListener('dragstart', (e) => {
    draggingKey = wrap.dataset.ref;
    wrap.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', wrap.dataset.ref);
  });
  wrap.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    draggingKey = null;
    dropBeforeKey = null;
    clearDropIndicators();
  });

  return wrap;
}

// Reordering is handled at the container level: per-thumbnail dragover handlers
// would shift the hovered thumbnail out from under the cursor (because the
// placeholder pushes it down), so the drop would never land on a thumbnail.
function setupThumbDnD() {
  thumbsEl.addEventListener('dragover', (e) => {
    if (!draggingKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (thumbPlaceholder.parentNode) thumbPlaceholder.parentNode.removeChild(thumbPlaceholder);
    const thumbs = Array.from(thumbsEl.querySelectorAll('.thumb'))
      .filter(t => !t.classList.contains('dragging'));
    let beforeEl = null;
    for (const t of thumbs) {
      const rect = t.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) { beforeEl = t; break; }
    }
    dropBeforeKey = beforeEl ? beforeEl.dataset.ref : null;
    if (beforeEl) thumbsEl.insertBefore(thumbPlaceholder, beforeEl);
    else thumbsEl.appendChild(thumbPlaceholder);
  });

  thumbsEl.addEventListener('drop', (e) => {
    if (!draggingKey) return;
    e.preventDefault();
    const dragged = draggingKey;
    const before = dropBeforeKey;
    draggingKey = null;
    dropBeforeKey = null;
    clearDropIndicators();
    reorderPage(dragged, before);
  });
}
setupThumbDnD();

function clearDropIndicators() {
  if (thumbPlaceholder.parentNode) thumbPlaceholder.parentNode.removeChild(thumbPlaceholder);
}

function makeInsertBar(insertIndex) {
  const bar = document.createElement('div');
  bar.className = 'insert-bar';
  bar.innerHTML = `
    <span class="insert-line"></span>
    <button type="button" class="insert-chip" data-act="file" title="Insert PDF or image here">+ File</button>
    <button type="button" class="insert-chip" data-act="blank" title="Insert a blank page here">+ Blank</button>
    <span class="insert-line"></span>`;
  bar.querySelector('[data-act=file]').addEventListener('click', (e) => { e.stopPropagation(); triggerInsert(insertIndex); });
  bar.querySelector('[data-act=blank]').addEventListener('click', (e) => { e.stopPropagation(); insertBlankPage(insertIndex); });
  return bar;
}

function rebuildThumbList() {
  thumbsEl.innerHTML = '';
  thumbsEl.appendChild(makeInsertBar(0));
  pageOrder.forEach((ref, idx) => {
    const el = thumbCache.get(refKey(ref));
    if (!el) return;
    // Thumbnails are cached per source page; redraw if it shows another rotation
    // (e.g. the page was rotated, deleted, then restored by Reset or Undo).
    if ((el._rot || 0) !== (ref.rotation || 0)) rerenderThumbElement(el, ref.doc, ref.page, ref.rotation || 0);
    el.querySelector('.thumb-num').textContent = String(idx + 1);
    el.setAttribute('aria-label', `Page ${idx + 1}`);
    el.classList.toggle('active', !!currentRef && refKey(ref) === refKey(currentRef));
    thumbsEl.appendChild(el);
    thumbsEl.appendChild(makeInsertBar(idx + 1));
  });
}

// ---- Page operations ---------------------------------------------------------
function rotatePageByKey(key) {
  finalizeActive();
  const entries = pageOrder.filter(r => refKey(r) === key);
  if (!entries.length) return;
  recordHistory();
  const newRot = ((entries[0].rotation || 0) + 90) % 360;
  entries.forEach(r => {
    r.rotation = newRot;
    // A 90° clockwise turn maps the anchor (x, y) to (1 - y, x).
    (r.annotations || []).forEach(a => {
      const x = a.xFrac, y = a.yFrac;
      a.xFrac = Math.max(0, Math.min(1, 1 - y));
      a.yFrac = Math.max(0, Math.min(1, x));
      if (a.type === 'shape') {
        const x2 = a.x2Frac, y2 = a.y2Frac;
        a.x2Frac = Math.max(0, Math.min(1, 1 - y2));
        a.y2Frac = Math.max(0, Math.min(1, x2));
      }
    });
  });
  previewEl.querySelectorAll('.preview-page').forEach(slot => {
    const idx = parseInt(slot.dataset.idx);
    if (pageOrder[idx] && refKey(pageOrder[idx]) === key) refreshSlotAnnotations(idx);
  });
  const wrap = thumbCache.get(key);
  if (wrap) {
    const [docIdx, pageNum] = key.split(':').map(Number);
    rerenderThumbElement(wrap, docIdx, pageNum, newRot);
  }
  previewEl.querySelectorAll('.preview-page').forEach(slot => {
    const idx = parseInt(slot.dataset.idx);
    if (pageOrder[idx] && refKey(pageOrder[idx]) === key) {
      slot.dataset.rendered = '1';
      renderPageIntoSlot(slot, idx);
    }
  });
  updateEditStatus();
}

async function insertBlankPage(insertIndex) {
  if (typeof PDFLib === 'undefined') { toast('pdf-lib failed to load.'); return; }
  finalizeActive();
  const gen = loadGeneration;
  let pageW = 612, pageH = 792;
  if (docs[0] && docs[0].pdf.numPages > 0) {
    const p = await docs[0].pdf.getPage(1);
    const vp = p.getViewport({ scale: 1 });
    pageW = vp.width; pageH = vp.height;
  }
  const blankDoc = await PDFLib.PDFDocument.create();
  blankDoc.addPage([pageW, pageH]);
  const pdfBytes = await blankDoc.save({ useObjectStreams: true });
  const entry = await loadDocFromBytes(pdfBytes, 'blank.pdf', 0); // not a file: adds nothing to the size shown
  if (isStale(gen)) return;
  const docIdx = docs.length;
  docs.push(entry);
  await renderDocThumbnails(docIdx, gen);
  if (isStale(gen)) return;
  const newRef = { doc: docIdx, page: 1, rotation: 0, annotations: [] };
  finalizeActive();
  recordHistory();
  pageOrder.splice(Math.max(0, Math.min(insertIndex, pageOrder.length)), 0, newRef);
  currentRef = newRef;
  rebuildThumbList();
  buildContinuousPreview(newRef);
  updateEditStatus();
  updateThumbActive();
}

function deletePageAt(key) {
  finalizeActive();
  if (pageOrder.length <= 1) {
    toast("You can't delete the last page.");
    return;
  }
  const idx = pageOrder.findIndex(r => refKey(r) === key);
  if (idx === -1) return;
  recordHistory();
  const removed = pageOrder.splice(idx, 1)[0];
  if (currentRef && refKey(removed) === refKey(currentRef)) {
    currentRef = pageOrder[Math.min(idx, pageOrder.length - 1)];
  }
  rebuildThumbList();
  buildContinuousPreview(currentRef);
  updateEditStatus();
}

// Move dragged page so it lands immediately before `beforeKey`, or at the end
// when beforeKey is null. beforeKey is never the dragged page itself.
function reorderPage(draggedKey, beforeKey) {
  finalizeActive();
  const from = pageOrder.findIndex(r => refKey(r) === draggedKey);
  if (from === -1) return;
  if (beforeKey === draggedKey) return;
  const [ref] = pageOrder.slice(from, from + 1);
  const without = pageOrder.filter((_, i) => i !== from);
  let to = beforeKey == null ? without.length : without.findIndex(r => refKey(r) === beforeKey);
  if (to === -1) to = without.length;
  if (to === from) return; // dropped back where it was
  recordHistory();
  without.splice(to, 0, ref);
  pageOrder = without;
  rebuildThumbList();
  buildContinuousPreview(currentRef);
  updateEditStatus();
}

function selectPage(ref) {
  currentRef = ref;
  updateThumbActive();
  updatePager();
  const idx = pageOrder.findIndex(r => r === ref || refKey(r) === refKey(ref));
  if (idx >= 0) {
    const slot = previewEl.querySelectorAll('.preview-page')[idx];
    if (slot) {
      scrollSyncPausedUntil = Date.now() + 800;
      slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function triggerInsert(insertIndex) {
  pendingInsertIndex = insertIndex;
  insertFileInput.value = '';
  insertFileInput.click();
}

insertFileInput.addEventListener('change', () => {
  const files = Array.from(insertFileInput.files);
  if (!files.length || pendingInsertIndex == null) return;
  const at = pendingInsertIndex;
  pendingInsertIndex = null;
  insertFiles(files, at);
});

const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (viewer.classList.contains('hidden') || !docs.length || !e.dataTransfer.files.length) return;
  if (busy) { toast('Wait for the export to finish before adding files.'); return; }
  // Dropped on the page rail: insert where the cursor is; elsewhere: after the current page.
  let at = currentIndex() + 1;
  if (e.target.closest && e.target.closest('.pages')) {
    const thumbs = Array.from(thumbsEl.querySelectorAll('.thumb'));
    at = thumbs.length;
    for (let i = 0; i < thumbs.length; i++) {
      const r = thumbs[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { at = i; break; }
    }
  }
  insertFiles(Array.from(e.dataTransfer.files), at);
});

async function insertFiles(files, insertAt) {
  finalizeActive();
  const gen = loadGeneration;

  // Load everything first; the document can keep changing while this runs.
  const loaded = [];
  for (const file of files) {
    const kind = classifyFile(file);
    if (!kind) {
      toast(`Skipped "${file.name}" — only PDF, JPG and PNG files are supported.`);
      continue;
    }
    try {
      const entry = kind === 'pdf' ? await loadDoc(file)
        : await loadDocFromBytes(await imageFileToPdfBytes(file), file.name, file.size);
      if (isStale(gen)) return;
      loaded.push(entry);
    } catch (err) {
      if (isStale(gen)) return;
      toast(`Couldn't open "${file.name}": ${err.message}`);
    }
  }
  if (!loaded.length || isStale(gen)) return;

  const startIdx = docs.length;
  docs.push(...loaded);
  for (let i = 0; i < loaded.length; i++) {
    await renderDocThumbnails(startIdx + i, gen);
    if (isStale(gen)) return;
  }

  // Snapshot and splice in one synchronous step so Undo removes exactly the insert.
  finalizeActive();
  recordHistory();
  let at = Math.max(0, Math.min(insertAt, pageOrder.length));
  let firstNewRef = null;
  loaded.forEach((entry, i) => {
    const docIdx = startIdx + i;
    const newRefs = Array.from({ length: entry.pdf.numPages }, (_, p) => ({ doc: docIdx, page: p + 1, rotation: 0, annotations: [] }));
    pageOrder.splice(at, 0, ...newRefs);
    at += newRefs.length;
    if (!firstNewRef) firstNewRef = newRefs[0];
  });
  currentRef = firstNewRef;
  rebuildThumbList();
  buildContinuousPreview(currentRef);
  updateEditStatus();
  updateThumbActive();
}

// ---- Preview -----------------------------------------------------------------
function previewInnerSize() {
  const cs = getComputedStyle(previewEl);
  const w = previewEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = previewEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 20;
  return { w: Math.max(w, 100), h: Math.max(h, 100) };
}

function cssScaleFor(baseViewport) {
  const { w, h } = previewInnerSize();
  if (zoomMode === 'width') return Math.min(w / baseViewport.width, 3 * PT_TO_PX);
  if (zoomMode === 'page')  return Math.min(w / baseViewport.width, h / baseViewport.height);
  return zoomMode * PT_TO_PX;
}

function buildContinuousPreview(scrollToRef) {
  finalizeActive();
  activeShape = null;
  hideShapeBar();
  if (previewRenderObserver) { previewRenderObserver.disconnect(); previewRenderObserver = null; }
  previewEl.querySelectorAll('.preview-page').forEach(s => { if (s._task) { try { s._task.cancel(); } catch {} } });
  previewEl.innerHTML = '';
  if (!pageOrder.length) return;

  // Size every slot from page 1 up front so scroll positions are stable while
  // pages render lazily.
  for (let i = 0; i < pageOrder.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'preview-page';
    slot.dataset.idx = String(i);
    const wrap = document.createElement('div');
    wrap.className = 'page-canvas-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    const shapeLayer = document.createElement('div');
    shapeLayer.className = 'shape-layer';
    wrap.appendChild(shapeLayer);
    const layer = document.createElement('div');
    layer.className = 'annot-layer';
    wrap.appendChild(layer);
    slot.appendChild(wrap);
    const label = document.createElement('span');
    label.className = 'page-label';
    label.textContent = `${i + 1} / ${pageOrder.length}`;
    slot.appendChild(label);
    previewEl.appendChild(slot);
  }
  const gen = ++previewGeneration;
  sizeSlots(gen).then(() => {
    if (gen !== previewGeneration) return;
    previewRenderObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !entry.target.dataset.rendered) {
          entry.target.dataset.rendered = '1';
          renderPageIntoSlot(entry.target, parseInt(entry.target.dataset.idx));
        }
      }
    }, { root: previewEl, rootMargin: '600px 0px 600px 0px' });
    previewEl.querySelectorAll('.preview-page').forEach(slot => previewRenderObserver.observe(slot));

    if (scrollToRef) {
      const idx = pageOrder.findIndex(r => r === scrollToRef || refKey(r) === refKey(scrollToRef));
      const slots = previewEl.querySelectorAll('.preview-page');
      if (idx >= 0 && slots[idx]) {
        scrollSyncPausedUntil = Date.now() + 300;
        slots[idx].scrollIntoView({ block: 'start' });
      }
    }
  });
  updateZoomUI();
}

// Give every slot its final size before rendering so scroll positions are
// right immediately and don't jump while pages render lazily.
async function sizeSlots(gen) {
  const slots = previewEl.querySelectorAll('.preview-page');
  await Promise.all(pageOrder.map(async (ref, i) => {
    if (!docs[ref.doc]) return;
    try {
      const page = await docs[ref.doc].pdf.getPage(ref.page);
      if (gen !== previewGeneration) return;
      const base = page.getViewport({ scale: 1, rotation: viewRotation(page, ref) });
      const s = cssScaleFor(base);
      const c = slots[i] && slots[i].querySelector('canvas');
      if (c && !slots[i].dataset.rendered) {
        c.style.width = Math.floor(base.width * s) + 'px';
        c.style.height = Math.floor(base.height * s) + 'px';
      }
    } catch {}
  }));
}

async function renderPageIntoSlot(slot, idx) {
  const ref = pageOrder[idx];
  if (!ref || !docs[ref.doc]) return;
  try {
    const page = await docs[ref.doc].pdf.getPage(ref.page);
    const rotation = viewRotation(page, ref);
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const cssScale = Math.max(cssScaleFor(baseViewport), 0.05);
    if (typeof zoomMode !== 'number') lastEffectiveZoom = cssScale / PT_TO_PX;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderScale = capRenderScale(baseViewport, cssScale * dpr);
    const viewport = page.getViewport({ scale: renderScale, rotation });
    const canvas = slot.querySelector('canvas');
    if (slot._task) { try { slot._task.cancel(); } catch {} }
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = Math.floor(baseViewport.width * cssScale) + 'px';
    canvas.style.height = Math.floor(baseViewport.height * cssScale) + 'px';
    slot._scale = cssScale;
    renderAnnotationLayer(slot, idx);
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    slot._task = task;
    await task.promise;
    if (typeof zoomMode !== 'number') updateZoomUI();
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error('page render failed', err);
  }
}

function drawAnnotationsOnCanvas(canvas, annotations, renderScale) {
  const ctx = canvas.getContext('2d');
  for (const ann of annotations) {
    if (ann.type === 'shape') drawShapeOnCanvas(ctx, ann, canvas.width, canvas.height, renderScale);
  }
  for (const ann of annotations) {
    if (ann.type !== 'text' || !ann.text) continue;
    const x  = ann.xFrac * canvas.width;
    const y  = ann.yFrac * canvas.height;
    const px = ann.fontSize * renderScale;
    ctx.save();
    ctx.font = `${ann.italic ? 'italic ' : ''}${ann.bold ? 'bold ' : ''}${px}px ${annotFontFace(ann.fontFamily)}`;
    ctx.fillStyle = ann.color || '#000000';
    ctx.textBaseline = 'alphabetic';
    const base = baselineRatio(ann);
    const lines = ann.text.split('\n');
    lines.forEach((line, i) => ctx.fillText(line, x, y + (base + i * LINE_HEIGHT) * px));
    ctx.restore();
  }
}

// Where the first line's baseline sits below the text box's top edge, as a
// fraction of the font size, measured from the browser's own layout (line-height
// 1.25, same as the on-page preview). The compressed and Keep-quality outputs
// place text on this baseline so saved text lands exactly where it was shown.
const LINE_HEIGHT = 1.25;
const baselineCache = new Map();
function baselineRatio(ann) {
  const key = `${ann.fontFamily}|${!!ann.bold}|${!!ann.italic}`;
  if (baselineCache.has(key)) return baselineCache.get(key);
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:-9999px;top:0;white-space:pre;font-size:100px;line-height:${LINE_HEIGHT};` +
    `font-family:${annotFontFace(ann.fontFamily)};font-weight:${ann.bold ? 'bold' : 'normal'};font-style:${ann.italic ? 'italic' : 'normal'}`;
  box.textContent = 'H';
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  box.appendChild(probe);
  document.body.appendChild(box);
  const ratio = (probe.getBoundingClientRect().top - box.getBoundingClientRect().top) / 100;
  box.remove();
  const r = ratio > 0.3 && ratio < 1.5 ? ratio : 0.95; // guard against odd layouts
  baselineCache.set(key, r);
  return r;
}

function annotFontFace(family) {
  return family === 'Times-Roman' ? '"Times New Roman", Times, serif'
       : family === 'Courier'     ? '"Courier New", Courier, monospace'
       : 'Helvetica, Arial, sans-serif';
}

function applyAnnStyle(el, ann, scale) {
  el.style.left = (ann.xFrac * 100) + '%';
  el.style.top  = (ann.yFrac * 100) + '%';
  el.style.fontSize = (ann.fontSize * scale) + 'px';
  el.style.fontFamily = annotFontFace(ann.fontFamily);
  el.style.fontWeight = ann.bold ? 'bold' : 'normal';
  el.style.fontStyle  = ann.italic ? 'italic' : 'normal';
  el.style.color = ann.color || '#000000';
}

// Render text annotations as interactive DOM elements overlaying the page canvas.
function renderAnnotationLayer(slot, idx) {
  renderShapeLayer(slot, idx);
  const layer = slot.querySelector('.annot-layer');
  if (!layer) return;
  const scale = slot._scale || 1;
  layer.innerHTML = '';
  const ref = pageOrder[idx];
  if (!ref || !ref.annotations || !ref.annotations.length) return;
  for (const ann of ref.annotations) {
    if (ann.type !== 'text') continue;
    if (ann.id == null) ann.id = nextAnnId++;
    const isActive = activeAnn && activeAnn.idx === idx && activeAnn.annId === ann.id;
    if (!ann.text && !isActive) continue;
    const el = document.createElement('div');
    el.className = 'annot';
    el.dataset.idx = String(idx);
    el.dataset.annId = String(ann.id);
    applyAnnStyle(el, ann, scale);
    el.textContent = ann.text;
    el.title = 'Drag to move · double-click to edit';
    el.spellcheck = false;
    layer.appendChild(el);
    if (isActive) {
      el.classList.add('selected');
      if (activeAnn.editing) enableEditing(el);
    }
  }
  if (activeAnn && activeAnn.idx === idx) positionStyleBar();
}

function refreshSlotAnnotations(idx) {
  const slot = previewEl.querySelectorAll('.preview-page')[idx];
  if (slot) renderAnnotationLayer(slot, idx);
}

function syncActivePageFromScroll() {
  if (Date.now() < scrollSyncPausedUntil) return;
  const slots = previewEl.querySelectorAll('.preview-page');
  if (!slots.length) return;
  const scrollMid = previewEl.scrollTop + previewEl.clientHeight / 2;
  let best = null, bestDist = Infinity;
  for (const slot of slots) {
    const dist = Math.abs((slot.offsetTop + slot.offsetHeight / 2) - scrollMid);
    if (dist < bestDist) { bestDist = dist; best = slot; }
  }
  if (!best) return;
  const idx = parseInt(best.dataset.idx);
  const ref = pageOrder[idx];
  if (ref && (!currentRef || refKey(ref) !== refKey(currentRef))) {
    currentRef = ref;
    updateThumbActive();
    updatePager();
  }
}

function updateThumbActive() {
  if (!currentRef) return;
  const key = refKey(currentRef);
  thumbsEl.querySelectorAll('.thumb').forEach(el => {
    el.classList.toggle('active', el.dataset.ref === key);
  });
  const active = thumbsEl.querySelector('.thumb.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

previewEl.addEventListener('scroll', () => {
  clearTimeout(scrollSyncTimer);
  scrollSyncTimer = setTimeout(syncActivePageFromScroll, 60);
}, { passive: true });

// ---- Text annotations (inline editing) ---------------------------------------
function getAnn(idx, annId) {
  const ref = pageOrder[idx];
  return ref && ref.annotations ? ref.annotations.find(a => a.id === annId) : null;
}
function activeEl() {
  if (!activeAnn) return null;
  return previewEl.querySelector(`.annot[data-idx="${activeAnn.idx}"][data-ann-id="${activeAnn.annId}"]`);
}

function loadStyleBar(ann) {
  tpFont.value = ann.fontFamily || 'Helvetica';
  tpSize.value = ann.fontSize || 16;
  tpColor.value = ann.color || '#000000';
  tpSwatch.style.background = tpColor.value;
  tpBold.setAttribute('aria-pressed', String(!!ann.bold));
  tpItalic.setAttribute('aria-pressed', String(!!ann.italic));
}

function positionStyleBar() {
  const el = activeEl();
  if (!el) { styleBar.classList.add('hidden'); return; }
  const wrap = el.closest('.page-canvas-wrap');
  if (styleBar.parentNode !== wrap) wrap.appendChild(styleBar);
  styleBar.classList.remove('hidden');
  const wrapW = wrap.clientWidth;
  const barW = styleBar.offsetWidth;
  const barH = styleBar.offsetHeight;
  let left = el.offsetLeft;
  if (left + barW > wrapW) left = Math.max(wrapW - barW, Math.min(left, 0));
  let top = el.offsetTop - barH - 12;
  if (top < -24) top = el.offsetTop + el.offsetHeight + 12; // not enough room above
  styleBar.style.left = left + 'px';
  styleBar.style.top = top + 'px';
}

function hideStyleBar() {
  styleBar.classList.add('hidden');
  if (styleBar.parentNode !== document.body) document.body.appendChild(styleBar);
}

function enableEditing(el) {
  el.contentEditable = 'plaintext-only';
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.classList.add('editing');
  el.title = '';
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function selectAnnotation(idx, annId) {
  if (activeAnn && activeAnn.idx === idx && activeAnn.annId === annId) return;
  finalizeActive();
  const ann = getAnn(idx, annId);
  if (!ann) return;
  activeAnn = { idx, annId, editing: false, isNew: false, dirty: false, preSnapshot: null };
  const el = activeEl();
  if (el) el.classList.add('selected');
  loadStyleBar(ann);
  positionStyleBar();
}

function startEditing() {
  if (!activeAnn || activeAnn.editing) return;
  activeAnn.editing = true;
  const el = activeEl();
  if (el) enableEditing(el);
  positionStyleBar();
}

function createAnnotationAt(idx, xFrac, yFrac) {
  finalizeActive();
  const ref = pageOrder[idx];
  if (!ref) return;
  const preSnapshot = clonePageOrder();
  if (!ref.annotations) ref.annotations = [];
  const ann = { id: nextAnnId++, type: 'text', text: '', xFrac, yFrac, ...lastStyle };
  ref.annotations.push(ann);
  activeAnn = { idx, annId: ann.id, editing: true, isNew: true, dirty: false, preSnapshot };
  loadStyleBar(ann);
  refreshSlotAnnotations(idx);
}

// Record one history entry for a whole editing session on an existing
// annotation, captured just before its first change.
function beginMutation() {
  if (!activeAnn || activeAnn.isNew || activeAnn.dirty) return;
  commitHistory(clonePageOrder());
  activeAnn.dirty = true;
}

function finalizeActive() {
  if (!activeAnn) return;
  const a = activeAnn;
  activeAnn = null;
  const el = previewEl.querySelector(`.annot[data-idx="${a.idx}"][data-ann-id="${a.annId}"]`);
  const ref = pageOrder[a.idx];
  const ann = getAnn(a.idx, a.annId);
  if (!ref) { hideStyleBar(); return; }
  if (ann && el && a.editing) ann.text = el.innerText.replace(/\n$/, '');
  if (ann && !ann.text.trim()) {
    if (!a.isNew && !a.dirty) commitHistory(clonePageOrder());
    ref.annotations = ref.annotations.filter(x => x.id !== a.annId);
  } else if (ann && a.isNew) {
    commitHistory(a.preSnapshot);
  }
  hideStyleBar();
  if (el) {
    el.contentEditable = 'false';
    el.classList.remove('editing', 'selected');
    el.blur();
  }
  refreshSlotAnnotations(a.idx);
  updateEditStatus();
}

function deleteActiveAnnotation() {
  if (!activeAnn) return;
  const a = activeAnn;
  const ref = pageOrder[a.idx];
  if (!a.isNew && !a.dirty) commitHistory(clonePageOrder());
  ref.annotations = ref.annotations.filter(x => x.id !== a.annId);
  activeAnn = null;
  hideStyleBar();
  refreshSlotAnnotations(a.idx);
  updateEditStatus();
}

function updateActiveStyle(patch) {
  if (!activeAnn) return;
  const ann = getAnn(activeAnn.idx, activeAnn.annId);
  if (!ann) return;
  beginMutation();
  Object.assign(ann, patch);
  Object.assign(lastStyle, patch);
  const el = activeEl();
  if (el) {
    const slot = el.closest('.preview-page');
    applyAnnStyle(el, ann, (slot && slot._scale) || 1);
  }
  positionStyleBar();
  updateEditStatus();
  // Keep typing where the caret was after a toolbar click.
  if (activeAnn.editing && el && document.activeElement !== tpSize && document.activeElement !== tpFont) el.focus();
}

tpFont.addEventListener('change', () => updateActiveStyle({ fontFamily: tpFont.value }));
tpSize.addEventListener('input', () => {
  const v = parseInt(tpSize.value);
  if (v >= 4 && v <= 400) updateActiveStyle({ fontSize: v });
});
tpBold.addEventListener('click', () => {
  const on = tpBold.getAttribute('aria-pressed') !== 'true';
  tpBold.setAttribute('aria-pressed', String(on));
  updateActiveStyle({ bold: on });
});
tpItalic.addEventListener('click', () => {
  const on = tpItalic.getAttribute('aria-pressed') !== 'true';
  tpItalic.setAttribute('aria-pressed', String(on));
  updateActiveStyle({ italic: on });
});
tpColor.addEventListener('input', () => {
  tpSwatch.style.background = tpColor.value;
  updateActiveStyle({ color: tpColor.value });
});
tpDelete.addEventListener('click', deleteActiveAnnotation);
// Keep the bar's own clicks from reaching the page underneath.
['pointerdown', 'click', 'dblclick'].forEach(ev => styleBar.addEventListener(ev, e => e.stopPropagation()));

// Finish editing when the user interacts with anything else.
document.addEventListener('pointerdown', (e) => {
  if (!activeAnn) return;
  if (e.target.closest('#styleBar')) return;
  const annEl = e.target.closest('.annot');
  if (annEl && parseInt(annEl.dataset.idx) === activeAnn.idx && parseInt(annEl.dataset.annId) === activeAnn.annId) return;
  finalizeActive();
}, true);

previewEl.addEventListener('beforeinput', (e) => {
  if (e.target.closest && e.target.closest('.annot.editing')) beginMutation();
});
previewEl.addEventListener('input', (e) => {
  const el = e.target.closest && e.target.closest('.annot.editing');
  if (!el || !activeAnn) return;
  const ann = getAnn(activeAnn.idx, activeAnn.annId);
  if (ann) ann.text = el.innerText.replace(/\n$/, '');
  positionStyleBar();
});

previewEl.addEventListener('click', (e) => {
  const annEl = e.target.closest('.annot');
  if (annEl) {
    if (dragState && dragState.moved) return;
    const idx = parseInt(annEl.dataset.idx);
    const annId = parseInt(annEl.dataset.annId);
    selectAnnotation(idx, annId);
    if (textMode) startEditing();
    return;
  }
  if (!textMode) return;
  const slot = e.target.closest('.preview-page');
  if (!slot) return;
  const canvas = slot.querySelector('canvas');
  if (!canvas || !e.target.closest('.page-canvas-wrap')) return;
  const rect = canvas.getBoundingClientRect();
  const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const yFrac = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
  createAnnotationAt(parseInt(slot.dataset.idx), xFrac, yFrac);
});

previewEl.addEventListener('dblclick', (e) => {
  const annEl = e.target.closest('.annot');
  if (!annEl) return;
  e.preventDefault();
  selectAnnotation(parseInt(annEl.dataset.idx), parseInt(annEl.dataset.annId));
  startEditing();
});

// Drag an annotation to move it.
previewEl.addEventListener('pointerdown', (e) => {
  const annEl = e.target.closest('.annot');
  if (!annEl || annEl.classList.contains('editing')) return;
  e.preventDefault();
  const idx = parseInt(annEl.dataset.idx);
  const annId = parseInt(annEl.dataset.annId);
  const ann = getAnn(idx, annId);
  if (!ann) return;
  const canvas = annEl.closest('.preview-page').querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  dragState = {
    annEl, ann, rect,
    startX: e.clientX, startY: e.clientY,
    startXFrac: ann.xFrac, startYFrac: ann.yFrac,
    moved: false,
    preSnapshot: clonePageOrder(),
  };
  annEl.classList.add('dragging');
  try { annEl.setPointerCapture(e.pointerId); } catch {}
});

previewEl.addEventListener('pointermove', (e) => {
  if (!dragState) return;
  if (Math.abs(e.clientX - dragState.startX) > 3 || Math.abs(e.clientY - dragState.startY) > 3) {
    dragState.moved = true;
  }
  if (!dragState.moved) return;
  const dx = (e.clientX - dragState.startX) / dragState.rect.width;
  const dy = (e.clientY - dragState.startY) / dragState.rect.height;
  const nx = Math.max(0, Math.min(1, dragState.startXFrac + dx));
  const ny = Math.max(0, Math.min(1, dragState.startYFrac + dy));
  dragState.ann.xFrac = nx;
  dragState.ann.yFrac = ny;
  dragState.annEl.style.left = (nx * 100) + '%';
  dragState.annEl.style.top  = (ny * 100) + '%';
  if (activeAnn) positionStyleBar();
});

function endAnnotationDrag(e) {
  if (!dragState) return;
  const ds = dragState;
  ds.annEl.classList.remove('dragging');
  try { ds.annEl.releasePointerCapture(e.pointerId); } catch {}
  if (ds.moved) {
    commitHistory(ds.preSnapshot); // pre-move snapshot is the undo target
    if (activeAnn) activeAnn.dirty = false; // later edits get their own undo step
    updateEditStatus();
  }
  // Let the click handler see `moved` before clearing.
  setTimeout(() => { if (dragState === ds) dragState = null; }, 0);
}
previewEl.addEventListener('pointerup', endAnnotationDrag);
previewEl.addEventListener('pointercancel', endAnnotationDrag);

// ---- Shapes ------------------------------------------------------------------
// One geometry function feeds all three renderers (on-page SVG, the compressed
// canvas, and vector PDF), so saved shapes match the preview exactly.
// W, H: displayed page size in output units; s: output units per PDF point.
function shapeGeometry(ann, W, H, s) {
  const x1 = ann.xFrac * W, y1 = ann.yFrac * H, x2 = ann.x2Frac * W, y2 = ann.y2Frac * H;
  const sw = (ann.strokeWidth || 0) * s;
  if (ann.shape === 'rect') {
    const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
    return { body: [['M', l, t], ['L', r, t], ['L', r, b], ['L', l, b], ['Z']], closed: true, head: null };
  }
  if (ann.shape === 'ellipse') {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    const k = 0.5522847498, kx = k * rx, ky = k * ry;
    return {
      body: [
        ['M', cx + rx, cy],
        ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
        ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
        ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
        ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
        ['Z'],
      ],
      closed: true, head: null,
    };
  }
  if (ann.shape === 'arrow') {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > 1e-6) {
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const L = Math.min(Math.max(sw, s) * 3 + 6 * s, len);
      const hw = L * 0.5;
      const bx = x2 - ux * L, by = y2 - uy * L;
      const ex = x2 - ux * L * 0.8, ey = y2 - uy * L * 0.8;
      return {
        body: [['M', x1, y1], ['L', ex, ey]],
        closed: false,
        head: [['M', x2, y2], ['L', bx - uy * hw, by + ux * hw], ['L', bx + uy * hw, by - ux * hw], ['Z']],
      };
    }
  }
  return { body: [['M', x1, y1], ['L', x2, y2]], closed: false, head: null };
}

function pathToD(cmds, map) {
  const f = n => (Math.round(n * 1000) / 1000).toString();
  return cmds.map(([op, ...nums]) => {
    if (op === 'Z') return 'Z';
    const out = [];
    for (let i = 0; i < nums.length; i += 2) {
      const [x, y] = map ? map(nums[i], nums[i + 1]) : [nums[i], nums[i + 1]];
      out.push(f(x), f(y));
    }
    return op + ' ' + out.join(' ');
  }).join(' ');
}

function shapeHasFill(ann) { return (ann.shape === 'rect' || ann.shape === 'ellipse') && !!ann.fill; }
function shapeStrokeWidth(ann) {
  // Lines and arrows always need an outline.
  return ann.shape === 'line' || ann.shape === 'arrow' ? Math.max(ann.strokeWidth || 0, 1) : (ann.strokeWidth || 0);
}

function drawShapeOnCanvas(ctx, ann, W, H, s) {
  const g = shapeGeometry(ann, W, H, s);
  const sw = shapeStrokeWidth(ann);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  const body = new Path2D(pathToD(g.body));
  if (shapeHasFill(ann)) { ctx.fillStyle = ann.fill; ctx.fill(body); }
  if (sw > 0) {
    ctx.strokeStyle = ann.stroke || '#000000';
    ctx.lineWidth = sw * s;
    ctx.stroke(body);
  }
  if (g.head) { ctx.fillStyle = ann.stroke || '#000000'; ctx.fill(new Path2D(pathToD(g.head))); }
  ctx.restore();
}

// Shapes are stored in the page's displayed (rotated, cropped) frame; map each
// point back into PDF user space the same way text annotations are placed.
function drawShapeOnPdfPage(pg, ann, box, rot) {
  const W = box.width, H = box.height;
  const sideways = rot === 90 || rot === 270;
  const Wd = sideways ? H : W, Hd = sideways ? W : H;
  const toPdf = (px, py) => {
    const u = px / Wd, v = py / Hd;
    let X, Y;
    if (rot === 90)       { X = v * W;       Y = u * H; }
    else if (rot === 180) { X = (1 - u) * W; Y = v * H; }
    else if (rot === 270) { X = (1 - v) * W; Y = (1 - u) * H; }
    else                  { X = u * W;       Y = (1 - v) * H; }
    // drawSvgPath flips y, so hand it (X, -Y).
    return [box.x + X, -(box.y + Y)];
  };
  const g = shapeGeometry(ann, Wd, Hd, 1);
  const sw = shapeStrokeWidth(ann);
  const opts = { x: 0, y: 0 };
  if (shapeHasFill(ann)) opts.color = hexToRgb(ann.fill);
  if (sw > 0) {
    opts.borderColor = hexToRgb(ann.stroke);
    opts.borderWidth = sw;
    if (PDFLib.LineCapStyle) opts.borderLineCap = PDFLib.LineCapStyle.Round;
  }
  if (opts.color || opts.borderColor) pg.drawSvgPath(pathToD(g.body, toPdf), opts);
  if (g.head) pg.drawSvgPath(pathToD(g.head, toPdf), { x: 0, y: 0, color: hexToRgb(ann.stroke) });
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function renderShapeLayer(slot, idx) {
  const layer = slot.querySelector('.shape-layer');
  if (!layer) return;
  layer.innerHTML = '';
  const ref = pageOrder[idx];
  const shapes = ref && ref.annotations ? ref.annotations.filter(a => a.type === 'shape') : [];
  if (!shapes.length) { if (activeShape && activeShape.idx === idx) positionShapeBar(); return; }
  const canvas = slot.querySelector('canvas');
  const W = parseFloat(canvas.style.width) || canvas.clientWidth || 1;
  const H = parseFloat(canvas.style.height) || canvas.clientHeight || 1;
  const s = slot._scale || 1;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
  for (const ann of shapes) {
    if (ann.id == null) ann.id = nextAnnId++;
    const g = shapeGeometry(ann, W, H, s);
    const sw = shapeStrokeWidth(ann) * s;
    const selected = activeShape && activeShape.idx === idx && activeShape.annId === ann.id;
    const group = svgEl('g', { class: 'shape' + (selected ? ' selected' : '') });
    const d = pathToD(g.body);
    const fillD = g.head ? d + ' ' + pathToD(g.head) : d;
    // Visible shape
    if (shapeHasFill(ann)) group.appendChild(svgEl('path', { d, fill: ann.fill, stroke: 'none' }));
    if (sw > 0) group.appendChild(svgEl('path', { d, fill: 'none', stroke: ann.stroke, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'miter' }));
    if (g.head) group.appendChild(svgEl('path', { d: pathToD(g.head), fill: ann.stroke, stroke: 'none' }));
    // Generous invisible hit target; closed shapes are grabbable anywhere inside.
    const hit = svgEl('path', {
      d: fillD, class: 'shape-hit', fill: 'none', stroke: 'transparent',
      'stroke-width': Math.max(14, sw + 10),
      'pointer-events': g.closed ? 'all' : 'stroke',
      'data-idx': String(idx), 'data-ann-id': String(ann.id),
    });
    group.appendChild(hit);
    if (g.closed) {
      const xs = [ann.xFrac * W, ann.x2Frac * W], ys = [ann.yFrac * H, ann.y2Frac * H];
      group.appendChild(svgEl('rect', {
        class: 'shape-outline',
        x: Math.min(...xs) - 3, y: Math.min(...ys) - 3,
        width: Math.abs(xs[1] - xs[0]) + 6, height: Math.abs(ys[1] - ys[0]) + 6,
      }));
    } else {
      group.appendChild(svgEl('path', { d, class: 'shape-outline' }));
    }
    svg.appendChild(group);
  }
  layer.appendChild(svg);

  // Resize handles for the selected shape.
  const sel = activeShape && activeShape.idx === idx ? shapes.find(a => a.id === activeShape.annId) : null;
  if (sel) {
    const corners = sel.shape === 'line' || sel.shape === 'arrow'
      ? [['xFrac', 'yFrac'], ['x2Frac', 'y2Frac']]
      : [['xFrac', 'yFrac'], ['x2Frac', 'yFrac'], ['xFrac', 'y2Frac'], ['x2Frac', 'y2Frac']];
    for (const [hx, hy] of corners) {
      const h = document.createElement('div');
      h.className = 'shape-handle';
      h.dataset.idx = String(idx);
      h.dataset.annId = String(sel.id);
      h.dataset.hx = hx;
      h.dataset.hy = hy;
      h.style.left = (sel[hx] * 100) + '%';
      h.style.top = (sel[hy] * 100) + '%';
      if (sel.shape === 'line' || sel.shape === 'arrow') h.style.cursor = 'crosshair';
      else {
        const other = k => (k.startsWith('x2') ? k.replace('x2', 'x') : k.startsWith('y2') ? k.replace('y2', 'y') : k[0] + '2Frac');
        const left = sel[hx] <= sel[other(hx)], top = sel[hy] <= sel[other(hy)];
        h.style.cursor = left === top ? 'nwse-resize' : 'nesw-resize';
      }
      layer.appendChild(h);
    }
  }
  if (activeShape && activeShape.idx === idx) positionShapeBar();
}

function refreshShapes(idx) {
  const slot = previewEl.querySelectorAll('.preview-page')[idx];
  if (slot) renderShapeLayer(slot, idx);
}

function activeShapeAnn() {
  return activeShape ? getAnn(activeShape.idx, activeShape.annId) : null;
}

function selectShape(idx, annId) {
  finalizeActive();
  if (activeShape && activeShape.idx === idx && activeShape.annId === annId) return;
  const prev = activeShape;
  activeShape = { idx, annId, dirty: false };
  if (prev && prev.idx !== idx) refreshShapes(prev.idx);
  const ann = activeShapeAnn();
  if (ann) loadShapeBar(ann);
  refreshShapes(idx);
}

function deselectShape() {
  if (!activeShape) return;
  const idx = activeShape.idx;
  activeShape = null;
  hideShapeBar();
  refreshShapes(idx);
}

function deleteActiveShape() {
  if (!activeShape) return;
  const { idx, annId } = activeShape;
  const ref = pageOrder[idx];
  if (!ref) return;
  recordHistory();
  ref.annotations = ref.annotations.filter(a => a.id !== annId);
  deselectShape();
  updateEditStatus();
}

function loadShapeBar(ann) {
  spStroke.value = ann.stroke || '#000000';
  spStrokeSwatch.style.borderColor = spStroke.value;
  const fillable = ann.shape === 'rect' || ann.shape === 'ellipse';
  spFillGroup.classList.toggle('hidden', !fillable);
  spWidth.querySelector('option[value="0"]').disabled = !fillable;
  spWidth.value = String(ann.strokeWidth || 0);
  if (ann.fill) spFill.value = ann.fill;
  spFillSwatch.style.background = ann.fill || '';
  spFillSwatch.classList.toggle('is-none', !ann.fill);
  spNoFill.setAttribute('aria-pressed', String(!ann.fill));
}

function positionShapeBar() {
  const ann = activeShapeAnn();
  const slot = activeShape && previewEl.querySelectorAll('.preview-page')[activeShape.idx];
  const wrap = slot && slot.querySelector('.page-canvas-wrap');
  if (!ann || !wrap) { hideShapeBar(); return; }
  if (shapeBar.parentNode !== wrap) wrap.appendChild(shapeBar);
  shapeBar.classList.remove('hidden');
  const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  const minX = Math.min(ann.xFrac, ann.x2Frac) * wrapW;
  const minY = Math.min(ann.yFrac, ann.y2Frac) * wrapH;
  const maxY = Math.max(ann.yFrac, ann.y2Frac) * wrapH;
  const barW = shapeBar.offsetWidth, barH = shapeBar.offsetHeight;
  let left = minX;
  if (left + barW > wrapW) left = Math.max(wrapW - barW, Math.min(left, 0));
  let top = minY - barH - 14;
  if (top < -24) top = maxY + 14;
  shapeBar.style.left = left + 'px';
  shapeBar.style.top = top + 'px';
}

function hideShapeBar() {
  shapeBar.classList.add('hidden');
  if (shapeBar.parentNode !== document.body) document.body.appendChild(shapeBar);
}

function updateShapeStyle(patch) {
  const ann = activeShapeAnn();
  if (!ann) return;
  if (!activeShape.dirty) { recordHistory(); activeShape.dirty = true; }
  Object.assign(ann, patch);
  Object.assign(lastShapeStyle, patch);
  loadShapeBar(ann);
  refreshShapes(activeShape.idx);
  updateEditStatus();
}

spStroke.addEventListener('input', () => updateShapeStyle({ stroke: spStroke.value }));
spWidth.addEventListener('change', () => {
  const w = parseFloat(spWidth.value) || 0;
  const ann = activeShapeAnn();
  // An outline-less shape with no fill would vanish, so give it a fill.
  if (w === 0 && ann && !ann.fill) updateShapeStyle({ strokeWidth: 0, fill: spFill.value });
  else updateShapeStyle({ strokeWidth: w });
});
spFill.addEventListener('input', () => updateShapeStyle({ fill: spFill.value }));
spNoFill.addEventListener('click', () => {
  const ann = activeShapeAnn();
  if (ann && !(ann.strokeWidth > 0)) updateShapeStyle({ fill: null, strokeWidth: 2 });
  else updateShapeStyle({ fill: null });
});
spDelete.addEventListener('click', deleteActiveShape);
['pointerdown', 'click', 'dblclick'].forEach(ev => shapeBar.addEventListener(ev, e => e.stopPropagation()));

// Clicking anywhere else drops the shape selection.
document.addEventListener('pointerdown', (e) => {
  if (!activeShape) return;
  if (e.target.closest('.shape-hit, .shape-handle, #shapeBar')) return;
  deselectShape();
}, true);

const clamp01 = n => Math.max(0, Math.min(1, n));

previewEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.annot, #styleBar, #shapeBar')) return;
  const wrap = e.target.closest('.page-canvas-wrap');
  if (!wrap) return;
  const slot = wrap.closest('.preview-page');
  const idx = parseInt(slot.dataset.idx);
  const ref = pageOrder[idx];
  if (!ref) return;
  const rect = slot.querySelector('canvas').getBoundingClientRect();
  const fx = clamp01((e.clientX - rect.left) / rect.width);
  const fy = clamp01((e.clientY - rect.top) / rect.height);
  const handle = e.target.closest('.shape-handle');
  const hit = e.target.closest('.shape-hit');
  let mode, ann;
  if (handle && !shapeTool && !textMode) {
    ann = getAnn(idx, parseInt(handle.dataset.annId));
    mode = 'resize';
  } else if (hit && !shapeTool && !textMode) {
    ann = getAnn(idx, parseInt(hit.dataset.annId));
    if (ann) selectShape(idx, ann.id);
    mode = 'move';
  } else if (shapeTool) {
    finalizeActive();
    const preSnapshot = clonePageOrder();
    if (!ref.annotations) ref.annotations = [];
    ann = { id: nextAnnId++, type: 'shape', shape: shapeTool, xFrac: fx, yFrac: fy, x2Frac: fx, y2Frac: fy, ...lastShapeStyle };
    if (ann.shape === 'line' || ann.shape === 'arrow') ann.strokeWidth = Math.max(ann.strokeWidth || 0, 1);
    else if (!ann.fill && !(ann.strokeWidth > 0)) ann.strokeWidth = 2;
    ref.annotations.push(ann);
    activeShape = { idx, annId: ann.id, dirty: false };
    mode = 'draw';
    shapeDrag = { preSnapshot };
  }
  if (!mode || !ann) return;
  e.preventDefault();
  shapeDrag = {
    ...(shapeDrag || {}),
    mode, idx, ann, rect, slot,
    hx: handle && handle.dataset.hx, hy: handle && handle.dataset.hy,
    startX: e.clientX, startY: e.clientY,
    start: { xFrac: ann.xFrac, yFrac: ann.yFrac, x2Frac: ann.x2Frac, y2Frac: ann.y2Frac },
    moved: false,
    preSnapshot: (shapeDrag && shapeDrag.preSnapshot) || clonePageOrder(),
  };
  try { previewEl.setPointerCapture(e.pointerId); } catch {}
  if (mode === 'draw') { hideShapeBar(); refreshShapes(idx); }
});

previewEl.addEventListener('pointermove', (e) => {
  const sd = shapeDrag;
  if (!sd) return;
  if (Math.abs(e.clientX - sd.startX) > 3 || Math.abs(e.clientY - sd.startY) > 3) sd.moved = true;
  if (!sd.moved) return;
  const { ann, rect, start } = sd;
  const fx = clamp01((e.clientX - rect.left) / rect.width);
  const fy = clamp01((e.clientY - rect.top) / rect.height);
  if (sd.mode === 'move') {
    let dx = (e.clientX - sd.startX) / rect.width;
    let dy = (e.clientY - sd.startY) / rect.height;
    dx = Math.max(-Math.min(start.xFrac, start.x2Frac), Math.min(1 - Math.max(start.xFrac, start.x2Frac), dx));
    dy = Math.max(-Math.min(start.yFrac, start.y2Frac), Math.min(1 - Math.max(start.yFrac, start.y2Frac), dy));
    ann.xFrac = start.xFrac + dx; ann.x2Frac = start.x2Frac + dx;
    ann.yFrac = start.yFrac + dy; ann.y2Frac = start.y2Frac + dy;
  } else {
    // draw moves the end point; resize moves whichever corner was grabbed.
    const hx = sd.mode === 'draw' ? 'x2Frac' : sd.hx;
    const hy = sd.mode === 'draw' ? 'y2Frac' : sd.hy;
    const ox = sd.mode === 'draw' ? 'xFrac' : (hx === 'xFrac' ? 'x2Frac' : 'xFrac');
    const oy = sd.mode === 'draw' ? 'yFrac' : (hy === 'yFrac' ? 'y2Frac' : 'yFrac');
    let px = fx, py = fy;
    if (e.shiftKey) {
      const ax = ann[ox] * rect.width, ay = ann[oy] * rect.height;
      let dxp = px * rect.width - ax, dyp = py * rect.height - ay;
      if (ann.shape === 'line' || ann.shape === 'arrow') {
        const len = Math.hypot(dxp, dyp);
        const ang = Math.round(Math.atan2(dyp, dxp) / (Math.PI / 4)) * (Math.PI / 4);
        dxp = Math.cos(ang) * len; dyp = Math.sin(ang) * len;
      } else {
        const m = Math.max(Math.abs(dxp), Math.abs(dyp));
        dxp = Math.sign(dxp || 1) * m; dyp = Math.sign(dyp || 1) * m;
      }
      px = clamp01((ax + dxp) / rect.width);
      py = clamp01((ay + dyp) / rect.height);
    }
    ann[hx] = px;
    ann[hy] = py;
  }
  renderShapeLayer(sd.slot, sd.idx);
});

function endShapeDrag(e) {
  const sd = shapeDrag;
  if (!sd) return;
  shapeDrag = null;
  try { previewEl.releasePointerCapture(e.pointerId); } catch {}
  const { ann, rect } = sd;
  if (sd.mode === 'draw') {
    const tiny = Math.abs(ann.x2Frac - ann.xFrac) * rect.width < 4 && Math.abs(ann.y2Frac - ann.yFrac) * rect.height < 4;
    if (!sd.moved || tiny) {
      // A plain click drops a default-sized shape.
      const isLine = ann.shape === 'line' || ann.shape === 'arrow';
      const w = (isLine ? 140 : 120) / rect.width, h = (isLine ? 0 : 80) / rect.height;
      ann.x2Frac = clamp01(ann.xFrac + w);
      ann.y2Frac = clamp01(ann.yFrac + h);
      if (ann.x2Frac === ann.xFrac) ann.xFrac = clamp01(ann.x2Frac - w);
      if (!isLine && ann.y2Frac === ann.yFrac) ann.yFrac = clamp01(ann.y2Frac - h);
    }
    commitHistory(sd.preSnapshot);
    const { idx, annId } = { idx: sd.idx, annId: ann.id };
    setShapeTool(null);           // back to select so the new shape can be adjusted
    activeShape = { idx, annId, dirty: false };
    loadShapeBar(ann);
    refreshShapes(idx);
  } else if (sd.moved) {
    commitHistory(sd.preSnapshot);
    if (activeShape) activeShape.dirty = false;
    refreshShapes(sd.idx);
  }
  updateEditStatus();
}
previewEl.addEventListener('pointerup', endShapeDrag);
previewEl.addEventListener('pointercancel', endShapeDrag);

// ---- Collapsible side panels -------------------------------------------------
const edBody = document.querySelector('.ed-body');
const PANEL_KEY = 'pdfsmith.collapsed';
const panelUi = {
  pages:  { collapse: $('pagesCollapseBtn'),  expand: $('pagesExpandBtn'),  label: $('pagesRailLabel') },
  export: { collapse: $('exportCollapseBtn'), expand: $('exportExpandBtn'), label: $('exportRailLabel') },
};

function isCollapsed(name) { return edBody.classList.contains(`${name}-collapsed`); }

function setPanelCollapsed(name, collapsed, { focus = false, persist = true } = {}) {
  if (isCollapsed(name) === collapsed) return;
  edBody.classList.toggle(`${name}-collapsed`, collapsed);
  const ui = panelUi[name];
  ui.collapse.setAttribute('aria-expanded', String(!collapsed));
  ui.expand.setAttribute('aria-expanded', String(!collapsed));
  if (focus) (collapsed ? ui.expand : ui.collapse).focus();
  if (persist) {
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify({ pages: isCollapsed('pages'), export: isCollapsed('export') }));
    } catch (_) { /* storage unavailable */ }
  }
  refitAfterPanelChange();
}

function togglePanel(name) {
  if (window.matchMedia('(max-width: 940px)').matches) return;
  setPanelCollapsed(name, !isCollapsed(name), { focus: document.activeElement !== document.body });
}

// Re-fit the preview once the grid column transition finishes.
let panelRefitTimer;
function refitAfterPanelChange() {
  if (!currentRef) return;
  clearTimeout(panelRefitTimer);
  panelRefitTimer = setTimeout(() => buildContinuousPreview(currentRef), 230);
}

for (const name of Object.keys(panelUi)) {
  const ui = panelUi[name];
  ui.collapse.addEventListener('click', () => setPanelCollapsed(name, true, { focus: true }));
  ui.expand.addEventListener('click', () => setPanelCollapsed(name, false, { focus: true }));
  ui.label.addEventListener('click', () => setPanelCollapsed(name, false, { focus: true }));
}

try {
  const saved = JSON.parse(localStorage.getItem(PANEL_KEY) || 'null');
  if (saved) {
    if (saved.pages) setPanelCollapsed('pages', true, { persist: false });
    if (saved.export) setPanelCollapsed('export', true, { persist: false });
  }
} catch (_) { /* ignore bad or blocked storage */ }

let resizeTimer;
window.addEventListener('resize', () => {
  if (!currentRef) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => buildContinuousPreview(currentRef), 200);
});

// ---- Export form -------------------------------------------------------------
function exportMode() { return modeKeep.checked ? 'keep' : 'compress'; }

function targetBytesFromForm() {
  const size = parseFloat(sizeInput.value);
  if (!size || size <= 0) return null;
  return Math.round((unit === 'MB' ? size * 1024 : size) * 1024);
}
function targetLabel() {
  const size = parseFloat(sizeInput.value);
  return `${trimNum(size || 0, 2)} ${unit}`;
}

function setUnit(u) {
  unit = u;
  document.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === u)));
  updateExportForm();
}
document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => setUnit(b.dataset.unit)));

function setTargetKb(kb) {
  if (kb >= 1024 && kb % 256 === 0) { sizeInput.value = trimNum(kb / 1024, 2); setUnit('MB'); }
  else { sizeInput.value = String(Math.round(kb)); setUnit('KB'); }
}
sizeChips.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => setTargetKb(parseInt(c.dataset.kb))));
sizeInput.addEventListener('input', updateExportForm);
[modeKeep, modeCompress].forEach(r => r.addEventListener('change', updateExportForm));

function updateExportForm() {
  const compress = exportMode() === 'compress';
  sizeBlock.classList.toggle('hidden', !compress);
  submitLabel.textContent = compress ? 'Compress & download' : 'Save & download';
  formError.classList.add('hidden');

  const target = targetBytesFromForm();
  const targetKb = target ? target / 1024 : 0;
  sizeChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', Math.abs(parseInt(c.dataset.kb) - targetKb) < 0.5));

  let note = '';
  if (compress && target && docs.length) {
    if (!isEdited() && docs[0].bytes.byteLength <= target) {
      note = `Your file is already ${fmt(docs[0].bytes.byteLength)} — under this limit. <strong>Keep quality</strong> will look sharper.`;
    } else if (isEdited() && sourceBytesInUse() <= target) {
      note = `Your source files total ${fmt(sourceBytesInUse())} — under this limit, so <strong>Keep quality</strong> will likely fit and look sharper.`;
    }
  }
  underLimitText.innerHTML = note;
  underLimitNote.classList.toggle('hidden', !note);
}

function showExportView(which) {
  exportForm.classList.toggle('hidden', which !== 'form');
  exportWorking.classList.toggle('hidden', which !== 'working');
  result.classList.toggle('hidden', which !== 'result');
  // Progress and results live in the export panel, so make sure it's visible.
  if (which !== 'form') setPanelCollapsed('export', false, { persist: false });
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.classList.remove('hidden');
}

submit.addEventListener('click', () => {
  if (!currentFile || busy) return;
  finalizeActive();
  if (exportMode() === 'keep') saveAsIs();
  else {
    const target = targetBytesFromForm();
    if (!target) { showFormError('Enter a size limit above zero.'); sizeInput.focus(); return; }
    runCompression(target, targetLabel());
  }
});

result.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action;
  if (act === 'reveal') revealDownload(parseInt(btn.dataset.downloadId, 10));
  else if (act === 'back') { lastResult = null; showExportView('form'); }
  else if (act === 'download-anyway') downloadBestEffort();
  else if (act === 'raise') {
    setTargetKb(parseFloat(btn.dataset.kb));
    lastResult = null;
    runCompression(targetBytesFromForm(), targetLabel());
  } else if (act === 'remove-pages') {
    lastResult = null;
    showExportView('form');
    toast('Delete pages from the list on the left, then press Compress again.');
  }
});

cancelBtn.addEventListener('click', () => {
  cancelRequested = true;
  cancelBtn.disabled = true;
  cancelBtn.textContent = 'Cancelling…';
});

// ---- Compression -------------------------------------------------------------
const PRESETS = [
  { dpi: 200, q: 0.85 },
  { dpi: 180, q: 0.80 },
  { dpi: 150, q: 0.75 },
  { dpi: 130, q: 0.70 },
  { dpi: 110, q: 0.60 },
  { dpi: 96,  q: 0.55 },
  { dpi: 85,  q: 0.50 },
  { dpi: 75,  q: 0.45 },
  { dpi: 65,  q: 0.40 },
  { dpi: 55,  q: 0.35 },
  { dpi: 45,  q: 0.30 },
  { dpi: 36,  q: 0.25 },
];
const presetShort = (p) => `${p.dpi} dpi · q${Math.round(p.q * 100)}`;
const presetLong  = (p) => `${p.dpi} dpi · quality ${Math.round(p.q * 100)}`;

class CancelledError extends Error {}

function setProgress(pct) {
  const v = Math.max(0, Math.min(100, pct));
  progressFill.style.width = v + '%';
  progress.setAttribute('aria-valuenow', String(Math.round(v)));
}

function renderLadder(tried, currentIdx) {
  const rows = [];
  tried.forEach((t, i) => {
    rows.push(`<div class="ladder-row"><span>${presetShort(PRESETS[i])}</span><span>${fmt(t)} — too big</span></div>`);
  });
  if (currentIdx < PRESETS.length) {
    rows.push(`<div class="ladder-row current"><span>${presetShort(PRESETS[currentIdx])}</span><span>working…</span></div>`);
  }
  if (currentIdx + 1 < PRESETS.length) {
    rows.push(`<div class="ladder-row pending"><span>${presetShort(PRESETS[currentIdx + 1])}</span><span>—</span></div>`);
  }
  ladderEl.innerHTML = rows.join('');
}

function canvasToJpegBytes(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('Canvas encoding failed'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', quality);
  });
}

async function buildPdfAtPreset(order, preset, onPageProgress) {
  const { dpi, q } = preset;
  const numPages = order.length;
  const newDoc = await PDFLib.PDFDocument.create();

  for (let i = 0; i < numPages; i++) {
    if (cancelRequested) throw new CancelledError('Cancelled');
    const ref = order[i];
    const page = await docs[ref.doc].pdf.getPage(ref.page);
    const rotation = viewRotation(page, ref);
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const scale = capRenderScale(baseViewport, dpi / 72);
    const viewport = page.getViewport({ scale, rotation });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (ref.annotations && ref.annotations.length) drawAnnotationsOnCanvas(canvas, ref.annotations, scale);

    const jpegBytes = await canvasToJpegBytes(canvas, q);
    const jpeg = await newDoc.embedJpg(jpegBytes);

    const newPage = newDoc.addPage([baseViewport.width, baseViewport.height]);
    newPage.drawImage(jpeg, {
      x: 0, y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    });

    canvas.width = canvas.height = 0;

    if (onPageProgress) onPageProgress(i + 1, numPages);
    await new Promise(r => setTimeout(r, 0));
  }

  return await newDoc.save({ useObjectStreams: true });
}

async function compressClientSide(targetBytes) {
  const order = clonePageOrder(); // edits made while this runs don't affect the output
  const tried = [];
  let best = null;
  for (let p = 0; p < PRESETS.length; p++) {
    const preset = PRESETS[p];
    renderLadder(tried, p);
    workPreset.textContent = `Trying ${presetLong(preset)}`;
    const span = 100 / PRESETS.length;
    setProgress(p * span);

    const bytes = await buildPdfAtPreset(order, preset, (page, total) => {
      workPage.textContent = `Page ${page} of ${total}`;
      setProgress(p * span + span * (page / total));
    });

    best = { bytes, preset, size: bytes.byteLength, orderJSON: JSON.stringify(order) };
    if (bytes.byteLength <= targetBytes) return { ...best, reachedTarget: true };
    tried.push(bytes.byteLength);
  }
  return { ...best, reachedTarget: false };
}

function baseName() {
  return (currentFile ? currentFile.name : 'document').replace(/\.(pdf|jpe?g|png)$/i, '');
}

function setBusy(on) {
  busy = on;
  submit.disabled = on;
}

async function runCompression(targetBytes, label) {
  if (!docs[0]) return;
  if (typeof PDFLib === 'undefined') { showFormError('pdf-lib failed to load.'); return; }
  setBusy(true);
  cancelRequested = false;
  cancelBtn.disabled = false;
  cancelBtn.textContent = 'Cancel';
  workPreset.textContent = 'Starting…';
  workPage.textContent = '';
  ladderEl.innerHTML = '';
  setProgress(0);
  showExportView('working');

  const sourceSize = isEdited() ? sourceBytesInUse() : docs[0].bytes.byteLength;
  try {
    const r = await compressClientSide(targetBytes);
    const filename = `${baseName()}-compressed.pdf`;
    if (r.reachedTarget) {
      setProgress(100);
      workPreset.textContent = 'Saving…';
      const saved = await downloadBytes(r.bytes, filename);
      markSaved(r.orderJSON);
      showCompressedResult({ saved, filename, size: r.size, targetBytes, label, sourceSize, preset: r.preset, over: false });
    } else {
      lastResult = { bytes: r.bytes, filename, size: r.size, targetBytes, label, sourceSize, preset: r.preset, orderJSON: r.orderJSON };
      showNotReached(lastResult);
    }
  } catch (err) {
    if (err instanceof CancelledError) {
      showExportView('form');
      toast('Compression cancelled.');
    } else {
      showError(err);
    }
  } finally {
    setBusy(false);
  }
}

async function downloadBestEffort() {
  if (!lastResult) return;
  const r = lastResult;
  try {
    const saved = await downloadBytes(r.bytes, r.filename);
    markSaved(r.orderJSON);
    lastResult = null;
    showCompressedResult({ ...r, saved, over: true });
  } catch (err) { showError(err); }
}

function niceLimitAbove(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return Math.ceil((kb * 1.1) / 50) * 50;         // next 50 KB step
  return Math.ceil((kb * 1.1) / 256) * 256;                        // next 0.25 MB step
}
const kbLabel = (kb) => kb >= 1024 ? `${trimNum(kb / 1024, 2)} MB` : `${kb} KB`;

function showCompressedResult({ saved, filename, size, targetBytes, label, sourceSize, preset, over }) {
  const pct = Math.min(100, (size / targetBytes) * 100);
  const diff = sourceSize ? Math.round((1 - size / sourceSize) * 100) : 0;
  const change = diff >= 0 ? `${diff}% smaller` : 'larger than the original';
  result.innerHTML = `
    <div class="res-head">
      <span class="res-badge ${over ? 'warn' : 'ok'}">${icon(over ? 'i-warn' : 'i-check', 20, 'stroke-width="2.4"')}</span>
      <div class="res-title">
        <h2>Saved to Downloads</h2>
        <span>${escapeHtml(saved.filename.split(/[\\/]/).pop() || filename)}</span>
      </div>
    </div>
    <div class="res-stat ${over ? 'warn' : ''}">
      <div class="res-big"><strong>${fmt(size)}</strong>
        <span style="${over ? 'color:var(--warn-ink-2)' : ''}">${over ? 'over' : 'under'} ${escapeHtml(label)}</span></div>
      <div class="res-bar"><div class="res-bar-fill" style="width:${over ? 100 : pct}%"></div>
        ${over ? `<span class="res-bar-mark" style="left:${(targetBytes / size) * 100}%"></span>` : ''}</div>
      <div class="res-meta"><span>Was ${fmt(sourceSize)} · ${change}</span><span>${presetShort(preset)}</span></div>
    </div>
    <div class="res-actions">
      <button type="button" class="btn btn-dark btn-xl" data-action="reveal" data-download-id="${saved.downloadId}">${icon('i-folder')}Show in folder</button>
      <button type="button" class="btn btn-outline btn-xl" data-action="back">Keep editing</button>
    </div>
    <p class="res-foot push-down">Text in compressed files is no longer selectable. Use <strong>Keep quality</strong> if you need it.</p>`;
  showExportView('result');
}

function showNotReached(r) {
  const raiseKb = niceLimitAbove(r.size);
  result.innerHTML = `
    <div class="res-head">
      <span class="res-badge warn">${icon('i-warn', 20, 'stroke-width="2.2"')}</span>
      <div class="res-title">
        <h2>Smallest possible: <span class="nowrap">${fmt(r.size)}</span></h2>
        <span>Still above your ${escapeHtml(r.label)} limit</span>
      </div>
    </div>
    <div class="res-stat warn">
      <div class="res-bar"><div class="res-bar-fill" style="width:100%"></div>
        <span class="res-bar-mark" style="left:${Math.min(100, (r.targetBytes / r.size) * 100)}%"></span></div>
      <div class="res-meta"><span>Limit ${escapeHtml(r.label)}</span><span>Result ${fmt(r.size)} at ${r.preset.dpi} dpi</span></div>
    </div>
    <div class="res-actions">
      <span class="res-options-label">Try one of these</span>
      <button type="button" class="opt-btn" data-action="download-anyway"><span>Download the ${fmt(r.size)} file anyway</span><span aria-hidden="true">→</span></button>
      <button type="button" class="opt-btn" data-action="raise" data-kb="${raiseKb}"><span>Raise the limit to ${kbLabel(raiseKb)}</span><span aria-hidden="true">→</span></button>
      <button type="button" class="opt-btn" data-action="remove-pages"><span>Remove pages, then retry</span><span aria-hidden="true">→</span></button>
    </div>
    <button type="button" class="btn btn-outline btn-xl push-down" data-action="back">Back</button>`;
  showExportView('result');
}

function showSavedResult({ saved, filename, size }) {
  const total = pageOrder.length;
  result.innerHTML = `
    <div class="res-head">
      <span class="res-badge ok">${icon('i-check', 20, 'stroke-width="2.4"')}</span>
      <div class="res-title">
        <h2>Saved to Downloads</h2>
        <span>${escapeHtml(saved.filename.split(/[\\/]/).pop() || filename)}</span>
      </div>
    </div>
    <div class="res-stat">
      <div class="res-big"><strong>${fmt(size)}</strong><span>Full quality</span></div>
      <div class="res-meta"><span>${total} page${total === 1 ? '' : 's'} · ${protectedSources.length ? 'protected pages saved as images' : 'text stays selectable'}</span></div>
    </div>
    <div class="res-actions">
      <button type="button" class="btn btn-dark btn-xl" data-action="reveal" data-download-id="${saved.downloadId}">${icon('i-folder')}Show in folder</button>
      <button type="button" class="btn btn-outline btn-xl" data-action="back">Keep editing</button>
    </div>
    ${saved.filename ? `<p class="res-path push-down">${escapeHtml(saved.filename)}</p>` : ''}`;
  showExportView('result');
}

function showError(err) {
  result.innerHTML = `
    <div class="res-head">
      <span class="res-badge err">${icon('i-warn', 20, 'stroke-width="2.2"')}</span>
      <div class="res-title">
        <h2>Couldn't save</h2>
        <span>${escapeHtml(err && err.message ? err.message : String(err))}</span>
      </div>
    </div>
    <button type="button" class="btn btn-outline btn-xl" data-action="back">Back</button>`;
  showExportView('result');
}

// ---- Save as-is --------------------------------------------------------------
function hexToRgb(hex) {
  const n = parseInt((hex || '#000000').replace('#', ''), 16);
  return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function resolveStandardFont(family, bold, italic) {
  if (family === 'Helvetica') {
    if (bold && italic) return 'Helvetica-BoldOblique';
    if (bold)           return 'Helvetica-Bold';
    if (italic)         return 'Helvetica-Oblique';
    return 'Helvetica';
  }
  if (family === 'Courier') {
    if (bold && italic) return 'Courier-BoldOblique';
    if (bold)           return 'Courier-Bold';
    if (italic)         return 'Courier-Oblique';
    return 'Courier';
  }
  // Times-Roman
  if (bold && italic) return 'Times-BoldItalic';
  if (bold)           return 'Times-Bold';
  if (italic)         return 'Times-Italic';
  return 'Times-Roman';
}

let unsupportedChars = false;

// Standard PDF fonts only cover WinAnsi. Replace characters they can't encode
// with "?" instead of letting pdf-lib throw and drop the whole line.
function encodableText(font, text) {
  try { font.encodeText(text); return text; } catch {}
  let out = '';
  for (const ch of text) {
    try { font.encodeText(ch); out += ch; } catch { out += '?'; }
  }
  return out;
}

let protectedSources = []; // names of restricted PDFs whose pages had to be rendered as images

// A restricted PDF (opens without a password but is encrypted against editing)
// can't be copied by pdf-lib — its content would stay encrypted and corrupt.
// Render such a page with PDF.js instead and embed it as a high-quality image.
async function rasterPageForKeepQuality(newDoc, ref) {
  const page = await docs[ref.doc].pdf.getPage(ref.page);
  const base = page.getViewport({ scale: 1, rotation: viewRotation(page, ref) });
  const viewport = page.getViewport({ scale: capRenderScale(base, 200 / 72), rotation: viewRotation(page, ref) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const jpeg = await newDoc.embedJpg(await canvasToJpegBytes(canvas, 0.92));
  canvas.width = canvas.height = 0;
  const out = PDFLib.PDFPage.create(newDoc);
  out.setSize(base.width, base.height); // rotation is baked into the image
  out.drawImage(jpeg, { x: 0, y: 0, width: base.width, height: base.height });
  return out;
}

async function buildReorganizedPdfBytes(order) {
  if (typeof PDFLib === 'undefined') throw new Error('pdf-lib failed to load');
  unsupportedChars = false;
  protectedSources = [];
  const srcDocCache = new Map();
  async function getSrcDoc(docIdx) {
    if (srcDocCache.has(docIdx)) return srcDocCache.get(docIdx);
    let d = null;
    try {
      d = await PDFLib.PDFDocument.load(docs[docIdx].bytes.slice());
    } catch (e) {
      if (!/encrypt/i.test(e.message)) throw e;
      protectedSources.push(docs[docIdx].name);
    }
    srcDocCache.set(docIdx, d);
    return d;
  }
  const groups = [];
  let last = null;
  for (let i = 0; i < order.length; i++) {
    const r = order[i];
    if (!last || last.docIdx !== r.doc) {
      last = { docIdx: r.doc, indices: [], outPositions: [] };
      groups.push(last);
    }
    last.indices.push(r.page - 1);
    last.outPositions.push(i);
  }
  const newDoc = await PDFLib.PDFDocument.create();
  const finalPages = new Array(order.length);
  for (const g of groups) {
    const src = await getSrcDoc(g.docIdx);
    if (!src) {
      for (let k = 0; k < g.indices.length; k++) {
        const outIdx = g.outPositions[k];
        finalPages[outIdx] = await rasterPageForKeepQuality(newDoc, order[outIdx]);
      }
      continue;
    }
    const copied = await newDoc.copyPages(src, g.indices);
    copied.forEach((page, k) => {
      const outIdx = g.outPositions[k];
      const addRotation = order[outIdx].rotation || 0;
      if (addRotation !== 0) {
        const current = page.getRotation().angle;
        page.setRotation(PDFLib.degrees((current + addRotation) % 360));
      }
      finalPages[outIdx] = page;
    });
  }
  finalPages.forEach(p => newDoc.addPage(p));

  // Embed text annotations
  if (order.some(r => r.annotations && r.annotations.some(a => a.text || a.type === 'shape'))) {
    const fontCache = new Map();
    const getFont = async (family, bold, italic) => {
      const key = `${family}_${bold}_${italic}`;
      if (!fontCache.has(key)) fontCache.set(key, await newDoc.embedFont(resolveStandardFont(family, bold, italic)));
      return fontCache.get(key);
    };
    for (let i = 0; i < order.length; i++) {
      const anns = order[i].annotations;
      if (!anns || !anns.length) continue;
      const pg = newDoc.getPage(i);
      // Annotations are stored in the page's *displayed* (rotated, cropped) frame.
      const box = pg.getCropBox();
      const W = box.width, H = box.height;
      const rot = ((pg.getRotation().angle % 360) + 360) % 360;
      for (const ann of anns) {
        if (ann.type === 'shape') {
          try { drawShapeOnPdfPage(pg, ann, box, rot); } catch (e) { console.warn('shape draw error', e); }
          continue;
        }
        if (ann.type !== 'text' || !ann.text) continue;
        try {
          const font  = await getFont(ann.fontFamily, ann.bold, ann.italic);
          const color = hexToRgb(ann.color);
          const size  = ann.fontSize;
          const u = ann.xFrac, v = ann.yFrac;
          // Same baseline as the on-page preview (see baselineRatio).
          const ascent = baselineRatio(ann) * size;
          const lineH  = size * LINE_HEIGHT;
          ann.text.split('\n').forEach((raw, li) => {
            const line = encodableText(font, raw);
            if (line !== raw) unsupportedChars = true;
            if (!line.trim()) return;
            const d = ascent + li * lineH; // distance "down" the displayed page
            let x, y;
            if (rot === 90)       { x = v * W + d;       y = u * H; }
            else if (rot === 180) { x = (1 - u) * W;     y = v * H + d; }
            else if (rot === 270) { x = (1 - v) * W - d; y = (1 - u) * H; }
            else                  { x = u * W;           y = (1 - v) * H - d; }
            pg.drawText(line, { x: box.x + x, y: box.y + y, size, font, color, rotate: PDFLib.degrees(rot) });
          });
        } catch (e) { console.warn('text annotation draw error', e); }
      }
    }
  }

  return await newDoc.save({ useObjectStreams: true });
}

// Save bytes to disk via chrome.downloads. Returns { downloadId, filename, size }.
// We can't pick the exact saved path from the extension API — Chrome reports
// it back asynchronously via the DownloadItem record.
function downloadBytes(bytes, filename) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    filename = safeFilename(filename);
    let settled = false;
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        URL.revokeObjectURL(url);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      // Resolve the actual on-disk filename once the download finishes (Chrome
      // may add " (1)" etc. on collisions). Then revoke the blob URL.
      const listener = (delta) => {
        if (settled || delta.id !== downloadId || !delta.state) return;
        if (delta.state.current === 'interrupted') {
          settled = true;
          chrome.downloads.onChanged.removeListener(listener);
          URL.revokeObjectURL(url);
          return reject(new Error('The download was interrupted.'));
        }
        if (delta.state.current !== 'complete') return;
        settled = true;
        chrome.downloads.onChanged.removeListener(listener);
        chrome.downloads.search({ id: downloadId }, (items) => {
          URL.revokeObjectURL(url);
          const item = items && items[0];
          resolve({
            downloadId,
            filename: item ? item.filename : filename,
            size: item ? item.fileSize || bytes.byteLength : bytes.byteLength,
          });
        });
      };
      chrome.downloads.onChanged.addListener(listener);
      // Very small files can finish before the listener is attached.
      chrome.downloads.search({ id: downloadId }, (items) => {
        const item = items && items[0];
        if (item && (item.state === 'complete' || item.state === 'interrupted')) {
          listener({ id: downloadId, state: { current: item.state } });
        }
      });
    });
  });
}

function safeFilename(name) {
  const cleaned = name.replace(/[\\/:*?"<>|~\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned || 'document.pdf';
}

function revealDownload(downloadId) {
  try { chrome.downloads.show(downloadId); } catch (e) { console.error(e); }
}

async function saveAsIs() {
  setBusy(true);
  submitLabel.textContent = 'Saving…';
  try {
    let bytes, name;
    const order = clonePageOrder(); // the file reflects the state when Save was clicked
    const orderJSON = JSON.stringify(order);
    if (!isEdited() && classifyFile(currentFile) === 'pdf') {
      bytes = docs[0].bytes;
      name = currentFile.name;
    } else {
      bytes = await buildReorganizedPdfBytes(order);
      const suffix = !isEdited() ? '' : hasInsertedDocs() ? '-merged' : hasAnnotations() ? '-annotated' : '-reorganized';
      name = `${baseName()}${suffix}.pdf`;
    }
    const saved = await downloadBytes(bytes, name);
    markSaved(orderJSON);
    showSavedResult({ saved, filename: name, size: saved.size });
    if (protectedSources.length) {
      toast(`${protectedSources.join(', ')} is protected against editing, so its pages were saved as high-quality images. Their text can't be selected in the new file.`, 9000);
    } else if (unsupportedChars) {
      toast("Some characters in your text aren't supported by the standard PDF fonts and were saved as \"?\". Use Compress to a size to keep them exactly as shown.", 8000);
    }
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
    updateExportForm();
  }
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty() || busy) { e.preventDefault(); e.returnValue = ''; }
});

updateZoomUI();
updateExportForm();
