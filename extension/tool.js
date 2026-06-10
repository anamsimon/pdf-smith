pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js');

const fileInput = document.getElementById('file');
const drop = document.getElementById('drop');
const uploader = document.getElementById('uploader');
const viewer = document.getElementById('viewer');
const thumbsEl = document.getElementById('thumbs');
const previewEl = document.getElementById('preview');
const fileInfoEl = document.getElementById('fileInfo');
const headerSubtitle = document.getElementById('headerSubtitle');
const changeFileBtn = document.getElementById('changeFileBtn');
const submit = document.getElementById('submit');
const downloadAsIsBtn = document.getElementById('downloadAsIs');
const insertFileInput = document.getElementById('insertFile');
const resetBtn = document.getElementById('resetBtn');
const pageCountEl = document.getElementById('pageCount');
const editStatusEl = document.getElementById('editStatus');
const result = document.getElementById('result');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');

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
let previewRenderObserver = null;
let scrollSyncTimer = null;
let zoomLevel = 1.0;
const ZOOM_MIN = 0.25, ZOOM_MAX = 3.0, ZOOM_STEP = 0.25;

const zoomBar = document.getElementById('zoomBar');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomLabel = document.getElementById('zoomLabel');
const textModeBtn = document.getElementById('textModeBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 100;

let textMode = false;
let pendingPlacement = null; // { idx, xFrac, yFrac }
let editingTarget = null;    // { idx, annId } when editing an existing annotation
let dragState = null;        // active annotation drag
let nextAnnId = 1;

const textPanel = document.getElementById('textPanel');
const tpFont    = document.getElementById('tpFont');
const tpSize    = document.getElementById('tpSize');
const tpBold    = document.getElementById('tpBold');
const tpItalic  = document.getElementById('tpItalic');
const tpColor   = document.getElementById('tpColor');
const tpText    = document.getElementById('tpText');
const tpAdd     = document.getElementById('tpAdd');
const tpCancel  = document.getElementById('tpCancel');
const tpClose   = document.getElementById('tpClose');
const tpHint    = document.getElementById('tpHint');

const fmt = (b) => {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/1024/1024).toFixed(2) + ' MB';
};

// ---- Undo / Redo history ----------------------------------------------------
// History is a stack of pageOrder snapshots. pageOrder holds page order,
// per-page rotation and text annotations, so a snapshot fully captures the
// editable state. docs[] is append-only, so undone inserts leave a harmless
// unreferenced doc entry that a redo can point back to.
function clonePageOrder() {
  return structuredClone(pageOrder);
}

function updateUndoRedoUI() {
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
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
  hideTextPanel();
  dragState = null;
  // Re-point currentRef to an equivalent entry in the restored order.
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
  if (!undoStack.length) return;
  redoStack.push(clonePageOrder());
  pageOrder = undoStack.pop();
  applyRestoredState();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(clonePageOrder());
  pageOrder = redoStack.pop();
  applyRestoredState();
}

if (undoBtn) undoBtn.addEventListener('click', undo);
if (redoBtn) redoBtn.addEventListener('click', redo);

document.addEventListener('keydown', (e) => {
  if (viewer.classList.contains('hidden')) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // let native text undo work
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

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

function updateZoomUI() {
  zoomLabel.textContent = Math.round(zoomLevel * 100) + '%';
  zoomOutBtn.disabled = zoomLevel <= ZOOM_MIN;
  zoomInBtn.disabled = zoomLevel >= ZOOM_MAX;
}
zoomInBtn.addEventListener('click', () => {
  zoomLevel = Math.min(+(zoomLevel + ZOOM_STEP).toFixed(2), ZOOM_MAX);
  updateZoomUI();
  buildContinuousPreview(currentRef);
});
zoomOutBtn.addEventListener('click', () => {
  zoomLevel = Math.max(+(zoomLevel - ZOOM_STEP).toFixed(2), ZOOM_MIN);
  updateZoomUI();
  buildContinuousPreview(currentRef);
});

textModeBtn.addEventListener('click', () => {
  textMode = !textMode;
  textModeBtn.classList.toggle('active', textMode);
  previewEl.classList.toggle('text-mode', textMode);
  if (!textMode) hideTextPanel();
});

function positionTextPanel(clientX, clientY) {
  const pw = 280, ph = 240;
  textPanel.style.left = Math.max(8, Math.min(clientX + 12, window.innerWidth  - pw - 8)) + 'px';
  textPanel.style.top  = Math.max(8, Math.min(clientY + 12, window.innerHeight - ph - 8)) + 'px';
}

function showTextPanel(clientX, clientY) {
  editingTarget = null;
  textPanel.classList.remove('hidden');
  tpText.value = '';
  tpAdd.disabled = true;
  tpAdd.textContent = 'Add';
  positionTextPanel(clientX, clientY);
}

function openTextPanelForEdit(idx, ann, clientX, clientY) {
  editingTarget = { idx, annId: ann.id };
  pendingPlacement = null;
  textPanel.classList.remove('hidden');
  tpText.value   = ann.text;
  tpFont.value   = ann.fontFamily || 'Helvetica';
  tpSize.value   = ann.fontSize || 16;
  tpColor.value  = ann.color || '#000000';
  tpBold.classList.toggle('active', !!ann.bold);
  tpItalic.classList.toggle('active', !!ann.italic);
  tpAdd.disabled = !ann.text.trim();
  tpAdd.textContent = 'Save';
  tpHint.textContent = `Editing text on page ${idx + 1}`;
  positionTextPanel(clientX, clientY);
  tpText.focus();
}

function hideTextPanel() {
  textPanel.classList.add('hidden');
  pendingPlacement = null;
  editingTarget = null;
  tpAdd.textContent = 'Add';
}

tpText.addEventListener('input', () => {
  tpAdd.disabled = !tpText.value.trim();
});
tpBold.addEventListener('click',   () => tpBold.classList.toggle('active'));
tpItalic.addEventListener('click', () => tpItalic.classList.toggle('active'));
tpClose.addEventListener('click',  hideTextPanel);
tpCancel.addEventListener('click', () => { hideTextPanel(); textMode = false; textModeBtn.classList.remove('active'); previewEl.classList.remove('text-mode'); });

tpAdd.addEventListener('click', () => {
  const text = tpText.value.trim();
  if (!text) return;
  const fontSize = Math.max(4, parseInt(tpSize.value) || 16);
  const bold   = tpBold.classList.contains('active');
  const italic = tpItalic.classList.contains('active');

  if (editingTarget) {
    const ref = pageOrder[editingTarget.idx];
    const ann = ref && ref.annotations && ref.annotations.find(a => a.id === editingTarget.annId);
    if (ann) {
      recordHistory();
      ann.text = text;
      ann.fontSize = fontSize;
      ann.fontFamily = tpFont.value;
      ann.bold = bold;
      ann.italic = italic;
      ann.color = tpColor.value;
      refreshSlotAnnotations(editingTarget.idx);
    }
    hideTextPanel();
    updateEditStatus();
    return;
  }

  if (!pendingPlacement) return;
  const { idx, xFrac, yFrac } = pendingPlacement;
  recordHistory();
  if (!pageOrder[idx].annotations) pageOrder[idx].annotations = [];
  pageOrder[idx].annotations.push({
    id: nextAnnId++,
    type: 'text', text, xFrac, yFrac,
    fontSize,
    fontFamily: tpFont.value,
    bold, italic,
    color:  tpColor.value,
  });
  refreshSlotAnnotations(idx);
  hideTextPanel();
  updateEditStatus();
});

changeFileBtn.addEventListener('click', () => {
  if (previewRenderObserver) { previewRenderObserver.disconnect(); previewRenderObserver = null; }
  zoomLevel = 1.0; updateZoomUI();
  currentFile = null;
  docs.length = 0;
  pageOrder = [];
  originalPageCount = 0;
  currentRef = null;
  clearHistory();
  thumbCache.clear();
  thumbsEl.innerHTML = '';
  previewEl.innerHTML = '<div class="placeholder">Loading preview…</div>';
  result.className = 'result';
  result.innerHTML = '';
  viewer.classList.add('hidden');
  uploader.classList.remove('hidden');
  changeFileBtn.classList.add('hidden');
  headerSubtitle.textContent = 'Upload a PDF to get started';
  fileInput.value = '';
  updateEditStatus();
});

resetBtn.addEventListener('click', () => {
  if (!docs[0]) return;
  const hadRotations = pageOrder.some(r => (r.rotation || 0) !== 0);
  docs.length = 1;
  for (const k of Array.from(thumbCache.keys())) {
    if (!k.startsWith('0:')) thumbCache.delete(k);
  }
  pageOrder = Array.from({ length: originalPageCount }, (_, i) => ({ doc: 0, page: i + 1, rotation: 0, annotations: [] }));
  if (!currentRef || currentRef.doc !== 0 || currentRef.page > originalPageCount) {
    currentRef = pageOrder[0];
  }
  if (hadRotations) renderDocThumbnails(0);
  clearHistory();
  rebuildThumbList();
  buildContinuousPreview(currentRef);
  updateEditStatus();
});

function hasInsertedDocs() { return docs.length > 1; }

function isOrderChanged() {
  if (pageOrder.length !== originalPageCount) return true;
  for (let i = 0; i < pageOrder.length; i++) {
    const r = pageOrder[i];
    if (r.doc !== 0 || r.page !== i + 1 || (r.rotation || 0) !== 0) return true;
  }
  return false;
}

function hasAnnotations() {
  return pageOrder.some(r => r.annotations && r.annotations.length > 0);
}

function isEdited() {
  return hasInsertedDocs() || isOrderChanged() || hasAnnotations();
}

function updateEditStatus() {
  const edited = isEdited();
  const total = pageOrder.length;
  pageCountEl.textContent = `${total} page${total === 1 ? '' : 's'}`;
  resetBtn.disabled = !edited;
  if (!edited) {
    editStatusEl.textContent = '';
  } else if (hasInsertedDocs()) {
    const inserted = pageOrder.filter(r => r.doc !== 0).length;
    editStatusEl.textContent = `Pages edited — ${inserted} inserted page${inserted === 1 ? '' : 's'}.`;
  } else if (hasAnnotations() && !isOrderChanged()) {
    const count = pageOrder.reduce((s, r) => s + (r.annotations ? r.annotations.length : 0), 0);
    editStatusEl.textContent = `Pages edited — ${count} text annotation${count === 1 ? '' : 's'} added.`;
  } else {
    editStatusEl.textContent = 'Pages edited — output reflects new order.';
  }
}

async function handleFiles(files) {
  const valid = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const isPdf = lower.endsWith('.pdf');
    const isImg = /\.(jpe?g|png)$/.test(lower) || file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isPdf && !isImg) {
      alert(`Skipping "${file.name}": only PDF, JPG, or PNG files are supported.`);
      continue;
    }
    valid.push({ file, isPdf });
  }
  if (!valid.length) return;

  currentFile = valid[0].file;
  headerSubtitle.textContent = valid.length === 1 ? valid[0].file.name : `${valid.length} files`;
  fileInfoEl.textContent = valid.length === 1
    ? `${valid[0].file.name} · ${fmt(valid[0].file.size)}`
    : `${valid.length} files · ${fmt(valid.reduce((s, e) => s + e.file.size, 0))} total`;

  zoomLevel = 1.0; updateZoomUI();
  uploader.classList.add('hidden');
  viewer.classList.remove('hidden');
  changeFileBtn.classList.remove('hidden');

  // Load first file as the base document
  try {
    let firstEntry;
    if (valid[0].isPdf) {
      firstEntry = await loadDoc(valid[0].file);
    } else {
      const pdfBytes = await imageFileToPdfBytes(valid[0].file);
      firstEntry = await loadDocFromBytes(pdfBytes, valid[0].file.name);
    }
    docs.length = 0;
    docs.push(firstEntry);
  } catch (err) {
    previewEl.innerHTML = `<div class="placeholder" style="color:var(--err)">Failed to load file: ${err.message}</div>`;
    return;
  }

  originalPageCount = docs[0].pdf.numPages;
  pageOrder = Array.from({ length: originalPageCount }, (_, i) => ({ doc: 0, page: i + 1, rotation: 0, annotations: [] }));
  clearHistory();
  await renderDocThumbnails(0);
  rebuildThumbList();
  currentRef = pageOrder[0];
  buildContinuousPreview(currentRef);
  updateEditStatus();

  // Append remaining files
  for (let i = 1; i < valid.length; i++) {
    const { file, isPdf } = valid[i];
    try {
      let entry;
      if (isPdf) {
        entry = await loadDoc(file);
      } else {
        const pdfBytes = await imageFileToPdfBytes(file);
        entry = await loadDocFromBytes(pdfBytes, file.name);
      }
      const docIdx = docs.length;
      docs.push(entry);
      await renderDocThumbnails(docIdx);
      const newRefs = Array.from({ length: entry.pdf.numPages }, (_, j) => ({ doc: docIdx, page: j + 1, rotation: 0, annotations: [] }));
      pageOrder.push(...newRefs);
    } catch (err) {
      alert(`Failed to load "${file.name}": ${err.message}`);
    }
  }

  if (valid.length > 1) {
    rebuildThumbList();
    buildContinuousPreview(currentRef);
    updateEditStatus();
  }
}

async function loadDoc(file) {
  const buf = await file.arrayBuffer();
  return loadDocFromBytes(new Uint8Array(buf), file.name);
}

async function loadDocFromBytes(bytes, name) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  return { pdf, bytes, name };
}

async function imageFileToPdfBytes(file) {
  if (typeof PDFLib === 'undefined') throw new Error('pdf-lib failed to load');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lower = file.name.toLowerCase();
  const isPng = lower.endsWith('.png') || file.type === 'image/png';
  const isJpg = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || file.type === 'image/jpeg';
  if (!isPng && !isJpg) throw new Error('Unsupported image type');

  const newDoc = await PDFLib.PDFDocument.create();
  const img = isPng ? await newDoc.embedPng(bytes) : await newDoc.embedJpg(bytes);

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

async function renderDocThumbnails(docIdx) {
  const entry = docs[docIdx];
  const total = entry.pdf.numPages;
  for (let p = 1; p <= total; p++) {
    const ref = { doc: docIdx, page: p };
    const wrap = buildThumbElement(ref);
    thumbCache.set(refKey(ref), wrap);

    try {
      const page = await entry.pdf.getPage(p);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = 170;
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = wrap.querySelector('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch (err) {
      console.error('thumbnail render failed for', refKey(ref), err);
    }
  }
}

function buildThumbElement(ref) {
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  wrap.dataset.ref = refKey(ref);
  wrap.draggable = true;

  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);

  const label = document.createElement('div');
  label.className = 'label';
  wrap.appendChild(label);

  if (ref.doc !== 0) {
    const badge = document.createElement('div');
    badge.className = 'badge-doc';
    badge.textContent = `+${ref.doc}`;
    badge.title = docs[ref.doc] ? `Inserted from ${docs[ref.doc].name}` : 'Inserted page';
    wrap.appendChild(badge);
  }

  const rot = document.createElement('button');
  rot.type = 'button';
  rot.className = 'rot';
  rot.title = 'Rotate 90°';
  rot.textContent = '↻';
  rot.addEventListener('click', (e) => {
    e.stopPropagation();
    rotatePageByKey(wrap.dataset.ref);
  });
  wrap.appendChild(rot);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'del';
  del.title = 'Remove page';
  del.textContent = '×';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deletePageAt(wrap.dataset.ref);
  });
  wrap.appendChild(del);

  wrap.addEventListener('click', () => selectPage(ref));

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
    // Remove the placeholder before measuring so its own height doesn't
    // distort thumbnail positions (which would cause flicker/oscillation).
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

function rotatePageByKey(key) {
  const entries = pageOrder.filter(r => refKey(r) === key);
  if (!entries.length) return;
  recordHistory();
  const newRot = ((entries[0].rotation || 0) + 90) % 360;
  entries.forEach(r => { r.rotation = newRot; });
  const wrap = thumbCache.get(key);
  if (wrap) {
    const [docIdx, pageNum] = key.split(':').map(Number);
    rerenderThumbElement(wrap, docIdx, pageNum, newRot);
  }
  // Re-render all preview slots that show this source page
  previewEl.querySelectorAll('.preview-page').forEach(slot => {
    const idx = parseInt(slot.dataset.idx);
    if (pageOrder[idx] && refKey(pageOrder[idx]) === key) {
      delete slot.dataset.rendered;
      renderPageIntoSlot(slot, idx);
    }
  });
  updateEditStatus();
}

async function rerenderThumbElement(wrap, docIdx, pageNum, rotation) {
  if (!docs[docIdx]) return;
  try {
    const page = await docs[docIdx].pdf.getPage(pageNum);
    const targetWidth = 170;
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale, rotation });
    const canvas = wrap.querySelector('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  } catch (err) {
    console.error('thumbnail re-render failed', err);
  }
}

function makeInsertBar(insertIndex) {
  const bar = document.createElement('div');
  bar.className = 'insert-bar';

  const fileChip = document.createElement('span');
  fileChip.className = 'chip';
  fileChip.title = 'Insert PDF or image';
  fileChip.textContent = '+ File';
  fileChip.addEventListener('click', (e) => { e.stopPropagation(); triggerInsert(insertIndex); });
  bar.appendChild(fileChip);

  const blankChip = document.createElement('span');
  blankChip.className = 'chip chip-outline';
  blankChip.title = 'Insert blank white page';
  blankChip.textContent = '+ Blank';
  blankChip.addEventListener('click', (e) => { e.stopPropagation(); insertBlankPage(insertIndex); });
  bar.appendChild(blankChip);

  return bar;
}

async function insertBlankPage(insertIndex) {
  if (typeof PDFLib === 'undefined') { alert('pdf-lib not loaded'); return; }
  let pageW = 612, pageH = 792;
  if (docs[0] && docs[0].pdf.numPages > 0) {
    const p = await docs[0].pdf.getPage(1);
    const vp = p.getViewport({ scale: 1 });
    pageW = vp.width; pageH = vp.height;
  }
  const blankDoc = await PDFLib.PDFDocument.create();
  blankDoc.addPage([pageW, pageH]);
  const pdfBytes = await blankDoc.save({ useObjectStreams: true });
  const entry = await loadDocFromBytes(pdfBytes, 'blank.pdf');
  const docIdx = docs.length;
  docs.push(entry);
  await renderDocThumbnails(docIdx);
  const newRef = { doc: docIdx, page: 1, rotation: 0, annotations: [] };
  recordHistory();
  pageOrder.splice(insertIndex, 0, newRef);
  rebuildThumbList();
  buildContinuousPreview(newRef);
  updateEditStatus();
  selectPage(newRef);
}

function rebuildThumbList() {
  thumbsEl.innerHTML = '';
  thumbsEl.appendChild(makeInsertBar(0));
  pageOrder.forEach((ref, idx) => {
    const el = thumbCache.get(refKey(ref));
    if (!el) return;
    el.querySelector('.label').textContent = `Page ${idx + 1}`;
    el.classList.toggle('active', currentRef && refKey(ref) === refKey(currentRef));
    thumbsEl.appendChild(el);
    thumbsEl.appendChild(makeInsertBar(idx + 1));
  });
}

function deletePageAt(key) {
  if (pageOrder.length <= 1) {
    alert("Can't delete the last remaining page.");
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
  const from = pageOrder.findIndex(r => refKey(r) === draggedKey);
  if (from === -1) return;
  if (beforeKey === draggedKey) return;
  recordHistory();
  const [ref] = pageOrder.splice(from, 1);
  let to;
  if (beforeKey == null) {
    to = pageOrder.length;
  } else {
    to = pageOrder.findIndex(r => refKey(r) === beforeKey);
    if (to === -1) to = pageOrder.length;
  }
  pageOrder.splice(to, 0, ref);
  rebuildThumbList();
  buildContinuousPreview(currentRef);
  updateEditStatus();
}

function selectPage(ref) {
  currentRef = ref;
  updateThumbActive();
  const idx = pageOrder.findIndex(r => r === ref || refKey(r) === refKey(ref));
  if (idx >= 0) {
    const slot = previewEl.querySelectorAll('.preview-page')[idx];
    if (slot) slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function triggerInsert(insertIndex) {
  pendingInsertIndex = insertIndex;
  insertFileInput.value = '';
  insertFileInput.click();
}

insertFileInput.addEventListener('change', async () => {
  const files = Array.from(insertFileInput.files);
  if (!files.length) return;
  if (pendingInsertIndex == null) return;
  let insertAt = pendingInsertIndex;
  pendingInsertIndex = null;

  const histSnapshot = clonePageOrder();
  let firstNewRef = null;
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const isPdf = lower.endsWith('.pdf');
    const isImg = /\.(jpe?g|png)$/.test(lower)
      || file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isPdf && !isImg) {
      alert(`Skipping "${file.name}": only PDF, JPG, or PNG files are supported.`);
      continue;
    }
    try {
      let entry;
      if (isPdf) {
        entry = await loadDoc(file);
      } else {
        const pdfBytes = await imageFileToPdfBytes(file);
        entry = await loadDocFromBytes(pdfBytes, file.name);
      }
      const docIdx = docs.length;
      docs.push(entry);
      await renderDocThumbnails(docIdx);
      const newRefs = Array.from({ length: entry.pdf.numPages }, (_, i) => ({ doc: docIdx, page: i + 1, rotation: 0, annotations: [] }));
      pageOrder.splice(insertAt, 0, ...newRefs);
      insertAt += newRefs.length;
      if (!firstNewRef && newRefs.length) firstNewRef = newRefs[0];
    } catch (err) {
      alert(`Failed to load "${file.name}": ${err.message}`);
    }
  }

  if (firstNewRef) commitHistory(histSnapshot);
  rebuildThumbList();
  buildContinuousPreview(firstNewRef || currentRef);
  updateEditStatus();
  if (firstNewRef) selectPage(firstNewRef);
});

function buildContinuousPreview(scrollToRef) {
  if (previewRenderObserver) { previewRenderObserver.disconnect(); previewRenderObserver = null; }
  previewEl.innerHTML = '';
  if (!pageOrder.length) return;

  for (let i = 0; i < pageOrder.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'preview-page';
    slot.dataset.idx = String(i);
    const wrap = document.createElement('div');
    wrap.className = 'page-canvas-wrap';
    wrap.appendChild(document.createElement('canvas'));
    const layer = document.createElement('div');
    layer.className = 'annot-layer';
    wrap.appendChild(layer);
    slot.appendChild(wrap);
    previewEl.appendChild(slot);
  }

  previewRenderObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && !entry.target.dataset.rendered) {
        entry.target.dataset.rendered = '1';
        renderPageIntoSlot(entry.target, parseInt(entry.target.dataset.idx));
      }
    }
  }, { root: previewEl, rootMargin: '400px 0px 400px 0px' });

  previewEl.querySelectorAll('.preview-page').forEach(slot => previewRenderObserver.observe(slot));

  if (scrollToRef) {
    const idx = pageOrder.findIndex(r => r === scrollToRef || refKey(r) === refKey(scrollToRef));
    if (idx >= 0) {
      const slots = previewEl.querySelectorAll('.preview-page');
      if (slots[idx]) slots[idx].scrollIntoView({ block: 'start' });
    }
  }
}

async function renderPageIntoSlot(slot, idx) {
  const ref = pageOrder[idx];
  if (!ref || !docs[ref.doc]) return;
  const rotation = ref.rotation || 0;
  try {
    const page = await docs[ref.doc].pdf.getPage(ref.page);
    const containerWidth = previewEl.clientWidth - 48;
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const fitScale = Math.min(containerWidth / baseViewport.width, 2.5);
    const scale = Math.max(fitScale * zoomLevel, 0.1);
    const viewport = page.getViewport({ scale, rotation });
    const canvas = slot.querySelector('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    slot._scale = scale;
    renderAnnotationLayer(slot, idx, scale);
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error('page render failed', err);
  }
}

function drawAnnotationsOnCanvas(canvas, annotations, renderScale) {
  const ctx = canvas.getContext('2d');
  for (const ann of annotations) {
    if (ann.type !== 'text' || !ann.text) continue;
    const x  = ann.xFrac * canvas.width;
    const y  = ann.yFrac * canvas.height;
    const px = ann.fontSize * renderScale;
    const face = ann.fontFamily === 'Times-Roman' ? '"Times New Roman", Times, serif'
               : ann.fontFamily === 'Courier'      ? '"Courier New", Courier, monospace'
               : 'Helvetica, Arial, sans-serif';
    ctx.save();
    ctx.font = `${ann.italic ? 'italic ' : ''}${ann.bold ? 'bold ' : ''}${px}px ${face}`;
    ctx.fillStyle = ann.color || '#000000';
    ctx.textBaseline = 'top';
    const lines = ann.text.split('\n');
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * px * 1.25));
    ctx.restore();
  }
}

function annotFontFace(family) {
  return family === 'Times-Roman' ? '"Times New Roman", Times, serif'
       : family === 'Courier'     ? '"Courier New", Courier, monospace'
       : 'Helvetica, Arial, sans-serif';
}

// Render text annotations as interactive DOM elements overlaying the page canvas.
function renderAnnotationLayer(slot, idx, scale) {
  const layer = slot.querySelector('.annot-layer');
  const canvas = slot.querySelector('canvas');
  if (!layer || !canvas) return;
  layer.innerHTML = '';
  const ref = pageOrder[idx];
  if (!ref || !ref.annotations || !ref.annotations.length) return;
  const displayScale = canvas.width ? (canvas.clientWidth || canvas.width) / canvas.width : 1;
  for (const ann of ref.annotations) {
    if (ann.type !== 'text' || !ann.text) continue;
    if (ann.id == null) ann.id = nextAnnId++;
    const el = document.createElement('div');
    el.className = 'annot';
    el.dataset.idx = String(idx);
    el.dataset.annId = String(ann.id);
    el.style.left = (ann.xFrac * 100) + '%';
    el.style.top  = (ann.yFrac * 100) + '%';
    el.style.fontSize = (ann.fontSize * scale * displayScale) + 'px';
    el.style.fontFamily = annotFontFace(ann.fontFamily);
    el.style.fontWeight = ann.bold ? 'bold' : 'normal';
    el.style.fontStyle  = ann.italic ? 'italic' : 'normal';
    el.style.color = ann.color || '#000000';
    el.textContent = ann.text;
    el.title = 'Drag to move · double-click to edit';
    const del = document.createElement('button');
    del.className = 'annot-del';
    del.type = 'button';
    del.textContent = '✕';
    del.title = 'Delete text';
    el.appendChild(del);
    layer.appendChild(el);
  }
}

function refreshSlotAnnotations(idx) {
  const slot = previewEl.querySelectorAll('.preview-page')[idx];
  if (slot) renderAnnotationLayer(slot, idx, slot._scale || 1);
}

function syncActivePageFromScroll() {
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
  }
}

function updateThumbActive() {
  if (!currentRef) return;
  const key = refKey(currentRef);
  document.querySelectorAll('.thumb').forEach(el => {
    el.classList.toggle('active', el.dataset.ref === key);
  });
  const active = document.querySelector('.thumb.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

previewEl.addEventListener('scroll', () => {
  clearTimeout(scrollSyncTimer);
  scrollSyncTimer = setTimeout(syncActivePageFromScroll, 60);
}, { passive: true });

previewEl.addEventListener('click', (e) => {
  // Delete an annotation when its × button is clicked.
  const del = e.target.closest('.annot-del');
  if (del) {
    e.stopPropagation();
    const annEl = del.closest('.annot');
    const idx = parseInt(annEl.dataset.idx);
    const annId = parseInt(annEl.dataset.annId);
    const ref = pageOrder[idx];
    if (ref && ref.annotations) {
      ref.annotations = ref.annotations.filter(a => a.id !== annId);
      refreshSlotAnnotations(idx);
      updateEditStatus();
    }
    return;
  }
  // Don't start a new placement when interacting with an existing annotation.
  if (e.target.closest('.annot')) return;
  if (!textMode) return;
  const slot = e.target.closest('.preview-page');
  if (!slot) return;
  const canvas = slot.querySelector('canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const yFrac = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
  pendingPlacement = { idx: parseInt(slot.dataset.idx), xFrac, yFrac };
  showTextPanel(e.clientX, e.clientY);
  tpHint.textContent = `Page ${parseInt(slot.dataset.idx) + 1} — adjust text, then click Add`;
});

// Double-click an annotation to edit it.
previewEl.addEventListener('dblclick', (e) => {
  const annEl = e.target.closest('.annot');
  if (!annEl) return;
  e.preventDefault();
  e.stopPropagation();
  const idx = parseInt(annEl.dataset.idx);
  const annId = parseInt(annEl.dataset.annId);
  const ref = pageOrder[idx];
  const ann = ref && ref.annotations && ref.annotations.find(a => a.id === annId);
  if (ann) openTextPanelForEdit(idx, ann, e.clientX, e.clientY);
});

// Drag an annotation to move it.
previewEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.annot-del')) return;
  const annEl = e.target.closest('.annot');
  if (!annEl) return;
  e.preventDefault();
  const idx = parseInt(annEl.dataset.idx);
  const annId = parseInt(annEl.dataset.annId);
  const ref = pageOrder[idx];
  const ann = ref && ref.annotations && ref.annotations.find(a => a.id === annId);
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
  const dx = (e.clientX - dragState.startX) / dragState.rect.width;
  const dy = (e.clientY - dragState.startY) / dragState.rect.height;
  const nx = Math.max(0, Math.min(1, dragState.startXFrac + dx));
  const ny = Math.max(0, Math.min(1, dragState.startYFrac + dy));
  dragState.ann.xFrac = nx;
  dragState.ann.yFrac = ny;
  dragState.annEl.style.left = (nx * 100) + '%';
  dragState.annEl.style.top  = (ny * 100) + '%';
  if (Math.abs(e.clientX - dragState.startX) > 3 || Math.abs(e.clientY - dragState.startY) > 3) {
    dragState.moved = true;
  }
});

function endAnnotationDrag(e) {
  if (!dragState) return;
  dragState.annEl.classList.remove('dragging');
  try { dragState.annEl.releasePointerCapture(e.pointerId); } catch {}
  const moved = dragState.moved;
  const preSnapshot = dragState.preSnapshot;
  dragState = null;
  if (moved) {
    commitHistory(preSnapshot); // pre-move snapshot is the undo target
    updateEditStatus();
  }
}
previewEl.addEventListener('pointerup', endAnnotationDrag);
previewEl.addEventListener('pointercancel', endAnnotationDrag);

let resizeTimer;
window.addEventListener('resize', () => {
  if (!currentRef) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => buildContinuousPreview(currentRef), 200);
});

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

function setProgress(pct, label) {
  progress.classList.remove('hidden');
  progressFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (label) progressLabel.textContent = label;
}
function hideProgress() {
  progress.classList.add('hidden');
  progressFill.style.width = '0%';
}

function canvasToJpegBytes(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('Canvas encoding failed'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', quality);
  });
}

async function buildPdfAtPreset(preset, onPageProgress) {
  const { dpi, q } = preset;
  const scale = dpi / 72;
  const order = pageOrder.slice();
  const numPages = order.length;
  const newDoc = await PDFLib.PDFDocument.create();

  for (let i = 0; i < numPages; i++) {
    const ref = order[i];
    const rotation = ref.rotation || 0;
    const page = await docs[ref.doc].pdf.getPage(ref.page);
    const baseViewport = page.getViewport({ scale: 1, rotation });
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
  let best = null;
  for (let p = 0; p < PRESETS.length; p++) {
    const preset = PRESETS[p];
    const presetLabel = `dpi=${preset.dpi}, q=${(preset.q * 100).toFixed(0)}`;
    setProgress((p / PRESETS.length) * 100, `Trying ${presetLabel}…`);

    const bytes = await buildPdfAtPreset(preset, (page, total) => {
      const presetSpan = 100 / PRESETS.length;
      const pageFrac = page / total;
      setProgress(p * presetSpan + presetSpan * pageFrac,
        `Trying ${presetLabel} · page ${page}/${total}`);
    });

    best = { bytes, preset: presetLabel, size: bytes.byteLength };
    if (bytes.byteLength <= targetBytes) {
      return { ...best, reachedTarget: true };
    }
  }
  return { ...best, reachedTarget: false, preset: best.preset + ' (target not reached)' };
}

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

async function buildReorganizedPdfBytes() {
  if (typeof PDFLib === 'undefined') throw new Error('pdf-lib failed to load');
  const srcDocCache = new Map();
  async function getSrcDoc(docIdx) {
    if (srcDocCache.has(docIdx)) return srcDocCache.get(docIdx);
    const d = await PDFLib.PDFDocument.load(docs[docIdx].bytes.slice());
    srcDocCache.set(docIdx, d);
    return d;
  }
  const groups = [];
  let last = null;
  for (let i = 0; i < pageOrder.length; i++) {
    const r = pageOrder[i];
    if (!last || last.docIdx !== r.doc) {
      last = { docIdx: r.doc, indices: [], outPositions: [] };
      groups.push(last);
    }
    last.indices.push(r.page - 1);
    last.outPositions.push(i);
  }
  const newDoc = await PDFLib.PDFDocument.create();
  const finalPages = new Array(pageOrder.length);
  for (const g of groups) {
    const src = await getSrcDoc(g.docIdx);
    const copied = await newDoc.copyPages(src, g.indices);
    copied.forEach((page, k) => {
      const outIdx = g.outPositions[k];
      const addRotation = pageOrder[outIdx].rotation || 0;
      if (addRotation !== 0) {
        const current = page.getRotation().angle;
        page.setRotation(PDFLib.degrees((current + addRotation) % 360));
      }
      finalPages[outIdx] = page;
    });
  }
  finalPages.forEach(p => newDoc.addPage(p));

  // Embed text annotations
  if (hasAnnotations()) {
    const fontCache = new Map();
    const getFont = async (family, bold, italic) => {
      const key = `${family}_${bold}_${italic}`;
      if (!fontCache.has(key)) fontCache.set(key, await newDoc.embedFont(resolveStandardFont(family, bold, italic)));
      return fontCache.get(key);
    };
    for (let i = 0; i < pageOrder.length; i++) {
      const anns = pageOrder[i].annotations;
      if (!anns || !anns.length) continue;
      const pg = newDoc.getPage(i);
      const { width: pgW, height: pgH } = pg.getSize();
      for (const ann of anns) {
        if (ann.type !== 'text' || !ann.text) continue;
        try {
          const font  = await getFont(ann.fontFamily, ann.bold, ann.italic);
          const color = hexToRgb(ann.color);
          const size  = ann.fontSize;
          const x     = ann.xFrac * pgW;
          // textBaseline='top' in canvas → PDF baseline = top - ascent
          const ascent = font.heightAtSize(size);
          const lineH  = size * 1.25;
          const lines  = ann.text.split('\n');
          lines.forEach((line, li) => {
            const y = (1 - ann.yFrac) * pgH - ascent - li * lineH;
            if (line) pg.drawText(line, { x, y: Math.max(y, 2), size, font, color });
          });
        } catch (e) { console.warn('text annotation draw error', e); }
      }
    }
  }

  return await newDoc.save({ useObjectStreams: true });
}

// Save bytes to disk via chrome.downloads. Returns { downloadId, filename }.
// We can't pick the exact saved path from the extension API — Chrome reports
// it back asynchronously via the DownloadItem record.
function downloadBytes(bytes, filename) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        URL.revokeObjectURL(url);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      // Resolve the actual on-disk filename once the download finishes (Chrome
      // may add " (1)" etc. on collisions). Then revoke the blob URL.
      const listener = (delta) => {
        if (delta.id !== downloadId || !delta.state || delta.state.current !== 'complete') return;
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
    });
  });
}

function revealDownload(downloadId) {
  try { chrome.downloads.show(downloadId); } catch (e) { console.error(e); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

downloadAsIsBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  downloadAsIsBtn.disabled = true;
  const originalLabel = downloadAsIsBtn.textContent;
  downloadAsIsBtn.innerHTML = '<span class="spinner"></span>Saving…';
  result.className = 'result';
  try {
    let bytes, name;
    const base = currentFile.name.replace(/\.pdf$/i, '');
    if (!isEdited()) {
      bytes = docs[0].bytes;
      name = currentFile.name;
    } else {
      bytes = await buildReorganizedPdfBytes();
      name = `${base}-${hasInsertedDocs() ? 'merged' : hasAnnotations() ? 'annotated' : 'reorganized'}.pdf`;
    }
    const saved = await downloadBytes(bytes, name);
    result.innerHTML = `
      <span class="badge ok">Saved</span>
      <div class="stat"><span>File</span><span>${escapeHtml(name)}</span></div>
      <div class="stat"><span>Size</span><span>${fmt(saved.size)}</span></div>
      <code class="saved-path">${escapeHtml(saved.filename)}</code>
      <button class="reveal" type="button" data-download-id="${saved.downloadId}">Show in folder</button>
    `;
    result.classList.add('show');
  } catch (err) {
    result.className = 'result show err';
    result.innerHTML = `<strong style="color:var(--err)">Error:</strong> ${escapeHtml(err.message)}`;
  } finally {
    downloadAsIsBtn.disabled = false;
    downloadAsIsBtn.textContent = originalLabel;
  }
});

result.addEventListener('click', (e) => {
  const btn = e.target.closest('.reveal');
  if (btn && btn.dataset.downloadId) revealDownload(parseInt(btn.dataset.downloadId, 10));
});

submit.addEventListener('click', async () => {
  if (!currentFile) return;
  const size = parseFloat(document.getElementById('size').value);
  const unit = document.getElementById('unit').value;
  if (!size || size <= 0) {
    result.className = 'result show err';
    result.innerHTML = '<strong style="color:var(--err)">Error:</strong> Enter a valid target size';
    return;
  }
  const targetKb = unit === 'MB' ? size * 1024 : size;
  const targetBytes = Math.round(targetKb * 1024);

  submit.disabled = true;
  submit.innerHTML = '<span class="spinner"></span>Compressing…';
  result.className = 'result';

  try {
    if (!docs[0]) throw new Error('PDF not loaded yet');
    if (typeof PDFLib === 'undefined') throw new Error('pdf-lib failed to load');
    setProgress(0, 'Starting…');
    const r = await compressClientSide(targetBytes);
    const base = currentFile.name.replace(/\.pdf$/i, '');
    setProgress(100, 'Saving…');
    const saved = await downloadBytes(r.bytes, `${base}-compressed.pdf`);

    const badge = r.reachedTarget
      ? '<span class="badge ok">Target reached</span>'
      : '<span class="badge warn">Best effort</span>';
    const ratio = ((1 - r.size / currentFile.size) * 100).toFixed(1);

    result.innerHTML = `
      ${badge}
      <div class="stat"><span>Original</span><span>${fmt(currentFile.size)}</span></div>
      <div class="stat"><span>Target</span><span>${fmt(targetBytes)}</span></div>
      <div class="stat"><span>Final</span><span>${fmt(r.size)} (-${ratio}%)</span></div>
      <div class="stat"><span>Preset</span><span>${escapeHtml(r.preset)}</span></div>
      <div class="stat"><span>File</span><span>${escapeHtml(`${base}-compressed.pdf`)}</span></div>
      <code class="saved-path">${escapeHtml(saved.filename)}</code>
      <button class="reveal" type="button" data-download-id="${saved.downloadId}">Show in folder</button>
    `;
    result.classList.add('show');
  } catch (err) {
    result.className = 'result show err';
    result.innerHTML = `<strong style="color:var(--err)">Error:</strong> ${escapeHtml(err.message)}`;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Compress & Download';
    hideProgress();
  }
});
