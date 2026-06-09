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

let currentFile = null;
let renderTask = null;

const fmt = (b) => {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/1024/1024).toFixed(2) + ' MB';
};

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('drag');
}));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('drag');
}));
drop.addEventListener('drop', e => {
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

changeFileBtn.addEventListener('click', () => {
  currentFile = null;
  docs.length = 0;
  pageOrder = [];
  originalPageCount = 0;
  currentRef = null;
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
  docs.length = 1;
  for (const k of Array.from(thumbCache.keys())) {
    if (!k.startsWith('0:')) thumbCache.delete(k);
  }
  pageOrder = Array.from({ length: originalPageCount }, (_, i) => ({ doc: 0, page: i + 1 }));
  if (!currentRef || currentRef.doc !== 0 || currentRef.page > originalPageCount) {
    currentRef = pageOrder[0];
  }
  rebuildThumbList();
  renderMainPage(currentRef);
  updateEditStatus();
});

function hasInsertedDocs() { return docs.length > 1; }

function isOrderChanged() {
  if (pageOrder.length !== originalPageCount) return true;
  for (let i = 0; i < pageOrder.length; i++) {
    const r = pageOrder[i];
    if (r.doc !== 0 || r.page !== i + 1) return true;
  }
  return false;
}

function isEdited() {
  return hasInsertedDocs() || isOrderChanged();
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
  } else {
    editStatusEl.textContent = 'Pages edited — output reflects new order.';
  }
}

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert('Please choose a PDF file.');
    return;
  }
  currentFile = file;
  fileInfoEl.textContent = `${file.name} · ${fmt(file.size)}`;
  headerSubtitle.textContent = file.name;

  uploader.classList.add('hidden');
  viewer.classList.remove('hidden');
  changeFileBtn.classList.remove('hidden');

  try {
    const docEntry = await loadDoc(file);
    docs.length = 0;
    docs.push(docEntry);
  } catch (err) {
    previewEl.innerHTML = `<div class="placeholder" style="color:var(--err)">Failed to load PDF: ${err.message}</div>`;
    return;
  }

  originalPageCount = docs[0].pdf.numPages;
  pageOrder = Array.from({ length: originalPageCount }, (_, i) => ({ doc: 0, page: i + 1 }));
  await renderDocThumbnails(0);
  rebuildThumbList();
  currentRef = pageOrder[0];
  await renderMainPage(currentRef);
  updateEditStatus();
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
    wrap.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', wrap.dataset.ref);
  });
  wrap.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    clearDropIndicators();
  });
  wrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = wrap.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    clearDropIndicators();
    wrap.classList.add(above ? 'drop-above' : 'drop-below');
  });
  wrap.addEventListener('dragleave', () => {
    wrap.classList.remove('drop-above', 'drop-below');
  });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedKey = e.dataTransfer.getData('text/plain');
    if (!draggedKey || draggedKey === wrap.dataset.ref) {
      clearDropIndicators();
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    movePageByKey(draggedKey, wrap.dataset.ref, above);
    clearDropIndicators();
  });

  return wrap;
}

function clearDropIndicators() {
  document.querySelectorAll('.thumb.drop-above, .thumb.drop-below')
    .forEach(el => el.classList.remove('drop-above', 'drop-below'));
}

function makeInsertBar(insertIndex) {
  const bar = document.createElement('div');
  bar.className = 'insert-bar';
  bar.title = 'Insert PDF or image here';
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = '+ Insert PDF / image';
  bar.appendChild(chip);
  bar.addEventListener('click', () => triggerInsert(insertIndex));
  return bar;
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
  const removed = pageOrder.splice(idx, 1)[0];
  if (currentRef && refKey(removed) === refKey(currentRef)) {
    currentRef = pageOrder[Math.min(idx, pageOrder.length - 1)];
    renderMainPage(currentRef);
  }
  rebuildThumbList();
  updateEditStatus();
}

function movePageByKey(draggedKey, targetKey, insertAbove) {
  const from = pageOrder.findIndex(r => refKey(r) === draggedKey);
  if (from === -1) return;
  const [ref] = pageOrder.splice(from, 1);
  let to = pageOrder.findIndex(r => refKey(r) === targetKey);
  if (to === -1) return;
  if (!insertAbove) to += 1;
  pageOrder.splice(to, 0, ref);
  rebuildThumbList();
  updateEditStatus();
}

async function selectPage(ref) {
  if (currentRef && refKey(ref) === refKey(currentRef)) return;
  currentRef = ref;
  const key = refKey(ref);
  document.querySelectorAll('.thumb').forEach(el => {
    el.classList.toggle('active', el.dataset.ref === key);
  });
  const active = document.querySelector('.thumb.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  await renderMainPage(ref);
}

function triggerInsert(insertIndex) {
  pendingInsertIndex = insertIndex;
  insertFileInput.value = '';
  insertFileInput.click();
}

insertFileInput.addEventListener('change', async () => {
  const file = insertFileInput.files[0];
  if (!file) return;
  const lower = file.name.toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const isImg = /\.(jpe?g|png)$/.test(lower)
    || file.type === 'image/jpeg' || file.type === 'image/png';
  if (!isPdf && !isImg) {
    alert('Please choose a PDF, JPG, or PNG file.');
    return;
  }
  if (pendingInsertIndex == null) return;
  const insertAt = pendingInsertIndex;
  pendingInsertIndex = null;

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
    const newRefs = Array.from({ length: entry.pdf.numPages }, (_, i) => ({ doc: docIdx, page: i + 1 }));
    pageOrder.splice(insertAt, 0, ...newRefs);
    rebuildThumbList();
    updateEditStatus();
    if (newRefs.length) {
      await selectPage(newRefs[0]);
    }
  } catch (err) {
    alert(`Failed to load inserted PDF: ${err.message}`);
  }
});

async function renderMainPage(ref) {
  if (renderTask) {
    try { renderTask.cancel(); } catch (e) {}
    renderTask = null;
  }
  if (!ref || !docs[ref.doc]) return;
  const page = await docs[ref.doc].pdf.getPage(ref.page);
  const containerWidth = previewEl.clientWidth - 48;
  const containerHeight = previewEl.clientHeight - 48;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    containerWidth / baseViewport.width,
    containerHeight / baseViewport.height,
    2.5
  );
  const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  previewEl.innerHTML = '';
  previewEl.appendChild(canvas);

  renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (err) {
    if (err && err.name !== 'RenderingCancelledException') console.error(err);
  } finally {
    renderTask = null;
  }
}

let resizeTimer;
window.addEventListener('resize', () => {
  if (!currentRef) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderMainPage(currentRef), 150);
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
    const page = await docs[ref.doc].pdf.getPage(ref.page);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

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
    copied.forEach((page, k) => { finalPages[g.outPositions[k]] = page; });
  }
  finalPages.forEach(p => newDoc.addPage(p));
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
      name = `${base}-${hasInsertedDocs() ? 'merged' : 'reorganized'}.pdf`;
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
    submit.textContent = 'Compress';
    hideProgress();
  }
});
