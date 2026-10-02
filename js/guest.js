import { CONFIG } from './config.js';
import { isDemo, addEntry, listEntries, onChange } from './store.js';
import './ornament.js';
import { createDrape } from './drape.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-couple]').forEach((el) => (el.textContent = CONFIG.couple));
document.querySelectorAll('[data-date]').forEach((el) => (el.textContent = CONFIG.date));
if (isDemo) document.body.insertAdjacentHTML('beforeend', '<div class="demo-banner">示範模式：資料只存在這台電腦</div>');

// 兩種首頁：預設是展示頁（膠卷）；網址加 ?record 是錄影拍照頁（QR code 連到這裡）
const RECORD = new URLSearchParams(location.search).has('record');
document.body.classList.add(RECORD ? 'mode-record' : 'mode-show');
if (!RECORD) {
  $('kicker').textContent = '來自親友的祝福';
  $('invite').innerHTML = '第一則祝福即將登場';
  document.title = '大家的祝福';
}

const drape = createDrape($('drape'), { spread: [0.27, 0.10, 0.22] });

// 首頁按鈕和連結的寬度，依它們所在高度的布幕開口來縮，不要壓到布幕
function fitToCurtain() {
  if ($('s-home').hidden) return;
  for (const el of document.querySelectorAll('#s-home .actions, #s-home .alt, #s-home .invite')) {
    el.style.maxWidth = '';
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    let edge = 0;
    for (let i = 0; i <= 4; i++) edge = Math.max(edge, drape.edgeX(r.top + scrollY + (r.height * i) / 4));
    const room = innerWidth - 2 * (edge + 14);
    if (room < r.width) el.style.maxWidth = `${Math.max(170, room)}px`;
  }
}
addEventListener('resize', fitToCurtain);
document.fonts?.ready.then(fitToCurtain);
setTimeout(fitToCurtain, 2400);
document.body.classList.add('at-home');
// 布幕拉開到七成左右，內容才淡入
setTimeout(() => drape.open(), 500);
setTimeout(() => document.body.classList.add('revealed'), 2300);

/* ---------- 取景框、預覽框套上畫框素材（每位賓客隨機一個長方形畫框） ---------- */
const frames = await fetch('frames/frames.json').then((r) => r.json()).catch(() => []);
const rectFrames = [0, 3, 1].map((i) => frames[i]).filter(Boolean);   // 金色雕花、木框、方框
const pf = rectFrames[Math.floor(Math.random() * rectFrames.length)];
function applyFrame(el) {
  if (!pf) return;
  const [x, y, w, h] = pf.win;
  const win = document.createElement('div');
  win.className = 'win';
  win.append(...el.childNodes);
  win.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%`;
  el.append(win);
  el.insertAdjacentHTML('beforeend', `<img class="pf-img" src="${pf.src}" alt="">`);
  el.style.aspectRatio = String((0.8 * h) / w);   // 把畫框稍微拉寬或壓窄，讓挖空處剛好是 4:5
  el.classList.add('pframe');
}
document.querySelectorAll('.viewer, .thumb').forEach(applyFrame);
const thumbWin = () => $('thumb').querySelector('.win') || $('thumb');

// 畫框下方隨機擺 3 張小插圖，每次進到這個畫面都不一樣
const MINIS = ['bow', 'bow2', 'cat', 'cat2', 'ring', 'doves', 'love', 'love2'];
const rnd = (a, b) => a + Math.random() * (b - a);
function scatterMinis(section) {
  const box = section.querySelector('.minis');
  if (!box) return;
  const picks = [...MINIS].sort(() => Math.random() - 0.5).slice(0, 3);
  box.innerHTML = picks.map((n, i) =>
    `<img src="deco/${n}.png" alt="" style="--h:${rnd(46, 62)}px;--r:${rnd(-14, 14)}deg;--y:${rnd(-12, 12)}px;--d:${0.15 + i * 0.15}s">`).join('');
}

function show(id) {
  document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== id));
  scatterMinis($(id));
  document.body.classList.toggle('at-home', id === 's-home');
  if (id === 's-home') requestAnimationFrame(fitToCurtain);
  if (id !== 's-home') stopFilmVideos();   // 離開首頁就停掉膠卷裡正在播的影片
  window.scrollTo(0, 0);
}
// 在這台電腦預覽（localhost）時不顯示「沒辦法開啟相機」，因為預覽視窗本來就會擋相機；正式網址照常顯示
const IS_PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname);
function showError(el, msg) {
  if (IS_PREVIEW && el.id === 'cam-error') msg = '';
  el.textContent = msg; el.hidden = !msg;
}

// 目前要送出的內容
let pending = null; // { kind, blob }

/* ---------- 錄影 ---------- */
const MIME_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
let stream = null, recorder = null, chunks = [], facing = 'user', tick = null;
let mode = 'video'; // 'video' 錄影 | 'photo' 拍照

// 錄成 IG 直式貼文比例 4:5：把鏡頭畫面置中裁切畫到 canvas 再錄
const OUT_W = 720, OUT_H = 900;
let canvas = null, drawTimer = null;
function cropStream(src) {
  if (!HTMLCanvasElement.prototype.captureStream) return src;
  const cam = $('cam');
  canvas ??= Object.assign(document.createElement('canvas'), { width: OUT_W, height: OUT_H });
  const ctx = canvas.getContext('2d');
  clearInterval(drawTimer);
  drawTimer = setInterval(() => {
    const vw = cam.videoWidth, vh = cam.videoHeight;
    if (!vw) return;
    const scale = Math.max(OUT_W / vw, OUT_H / vh);
    const sw = OUT_W / scale, sh = OUT_H / scale;
    ctx.drawImage(cam, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, OUT_W, OUT_H);
  }, 1000 / 30);
  return new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...src.getAudioTracks()]);
}

async function startCamera() {
  stopCamera();
  showError($('cam-error'), '');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } },
      audio: mode === 'video' ? { echoCancellation: true, noiseSuppression: true } : false,
    });
    $('cam').srcObject = stream;
    $('cam').classList.toggle('mirror', facing === 'user');
  } catch (e) {
    showError($('cam-error'), `沒辦法開啟相機。請允許相機${mode === 'video' ? '和麥克風' : ''}權限；如果是在 LINE 裡打開，請點右上角「⋯」選「用瀏覽器開啟」。也可以回上一頁改用「從相簿選照片或影片」。`);
  }
}
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function setTimer(sec, live) {
  $('timer').textContent = `0:${String(sec).padStart(2, '0')}`;
  $('timer').classList.toggle('live', live);
}

function startRecording() {
  if (!stream) return;
  const mimeType = MIME_TYPES.find((t) => window.MediaRecorder?.isTypeSupported(t)) || '';
  recorder = new MediaRecorder(cropStream(stream), { mimeType, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 96_000 });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    clearInterval(tick);
    clearInterval(drawTimer);
    const blob = new Blob(chunks, { type: (recorder.mimeType || 'video/mp4').split(';')[0] });
    stopCamera();
    pending = { kind: 'video', blob };
    showReview();
  };
  recorder.start(1000);
  let left = CONFIG.videoMaxSeconds;
  setTimer(left, true);
  tick = setInterval(() => {
    left -= 1;
    setTimer(left, true);
    if (left <= 0) recorder.state === 'recording' && recorder.stop();
  }, 1000);
  $('rec-btn').classList.add('stop');
  $('rec-btn').setAttribute('aria-label', '停止錄影');
  $('rec-hint').textContent = '錄好了就按方塊停止';
  $('flip').hidden = true;
}

function resetRecordUI() {
  clearInterval(tick);
  const photo = mode === 'photo';
  setTimer(CONFIG.videoMaxSeconds, false);
  $('timer').hidden = photo;
  $('rec-btn').classList.remove('stop');
  $('rec-btn').classList.toggle('shutter', photo);
  $('rec-btn').setAttribute('aria-label', photo ? '拍照' : '開始錄影');
  $('rec-hint').textContent = photo ? '按下白色按鈕拍照' : `按下紅色按鈕開始錄，最長 ${CONFIG.videoMaxSeconds} 秒`;
  $('redo').textContent = photo ? '重拍' : '重錄';
  $('use').textContent = photo ? '用這張' : '用這段';
  $('flip').hidden = false;
}

function openCamera(m) { mode = m; resetRecordUI(); show('s-record'); startCamera(); }

// 預覽剛錄好／拍好的內容
function showReview() {
  const url = URL.createObjectURL(pending.blob);
  const isVideo = pending.kind === 'video';
  $('review').hidden = !isVideo;
  $('review-img').hidden = isVideo;
  if (isVideo) $('review').src = url; else $('review-img').src = url;
  show('s-review');
}

/* ---------- 拍照：跟錄影一樣裁成 4:5 ---------- */
const PHOTO_W = 1080, PHOTO_H = 1350;
function takePhoto() {
  const cam = $('cam');
  const vw = cam.videoWidth, vh = cam.videoHeight;
  if (!vw) return;
  const c = Object.assign(document.createElement('canvas'), { width: PHOTO_W, height: PHOTO_H });
  const ctx = c.getContext('2d');
  const scale = Math.max(PHOTO_W / vw, PHOTO_H / vh);
  const sw = PHOTO_W / scale, sh = PHOTO_H / scale;
  // 前鏡頭照片跟預覽畫面一樣左右相反，比較符合自拍習慣
  if (facing === 'user') { ctx.translate(PHOTO_W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(cam, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
  $('flash').classList.remove('go'); void $('flash').offsetWidth; $('flash').classList.add('go');
  c.toBlob((blob) => {
    stopCamera();
    pending = { kind: 'photo', blob };
    setTimeout(showReview, 250);
  }, 'image/jpeg', 0.86);
}

$('go-video').onclick = () => openCamera('video');
$('go-photo').onclick = () => openCamera('photo');
$('rec-btn').onclick = () => {
  if (mode === 'photo') return takePhoto();
  recorder?.state === 'recording' ? recorder.stop() : startRecording();
};
$('flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startCamera(); };
$('rec-cancel').onclick = () => { if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); } clearInterval(drawTimer); stopCamera(); resetRecordUI(); show('s-home'); };
$('redo').onclick = () => { $('review').pause(); openCamera(mode); };
$('use').onclick = () => { $('review').pause(); toDetails(); };

/* ---------- 從相簿選照片或影片 ---------- */
$('pick-file').onclick = () => $('file-pick').click();
$('file-pick').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.type.startsWith('image/')) return usePhotoFile(file);
  const mb = file.size / 1024 / 1024;
  if (mb > CONFIG.maxUploadMB) {
    alert(`這支影片 ${mb.toFixed(0)}MB，超過上限 ${CONFIG.maxUploadMB}MB。\n請改用「錄一段祝福影片」直接錄，檔案會小很多。`);
    return;
  }
  const secs = await videoDuration(file);
  if (secs > CONFIG.videoMaxSeconds + 5) {
    alert(`這支影片有 ${Math.round(secs)} 秒，請選 ${CONFIG.videoMaxSeconds} 秒以內的影片。`);
    return;
  }
  pending = { kind: 'video', blob: file };
  toDetails();
};
function videoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve(isFinite(v.duration) ? v.duration : 0); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

/* ---------- 相簿照片：先在手機上壓縮 ---------- */
async function usePhotoFile(file) {
  try {
    pending = { kind: 'photo', blob: await compressImage(file) };
    toDetails();
  } catch {
    alert('這張照片讀不出來，請換一張試試。');
  }
}
async function compressImage(file, maxSide = 1600) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.82));
}

/* ---------- 填名字、送出 ---------- */
function toDetails() {
  const url = URL.createObjectURL(pending.blob);
  thumbWin().querySelectorAll('video, img').forEach((n) => n.remove());
  thumbWin().insertAdjacentHTML('afterbegin', pending.kind === 'video'
    ? `<video src="${url}" muted playsinline autoplay loop></video>`
    : `<img src="${url}" alt="你的照片">`);
  showError($('form-error'), '');
  $('name').value = localStorage.getItem('guestName') || '';
  show('s-details');
}
$('msg').oninput = () => ($('count').textContent = `${$('msg').value.length} / 60`);
$('back-home').onclick = () => { pending = null; show('s-home'); };

$('form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('name').value.trim();
  if (!name) { showError($('form-error'), '請填上你的名字，新人才知道是誰的祝福'); $('name').focus(); return; }
  try { localStorage.setItem('guestName', name); } catch {}
  $('bar').style.width = '0';
  show('s-sending');
  try {
    await addEntry({ name, message: $('msg').value.trim(), kind: pending.kind, blob: pending.blob },
      (p) => ($('bar').style.width = `${Math.round(p * 100)}%`));
    prepareShare(pending);
    pending = null;
    $('msg').value = '';
    $('count').textContent = '0 / 60';
    show('s-done');
    petals();
  } catch (err) {
    show('s-details');
    showError($('form-error'), `${err.message}。按「送出祝福」可以重送。`);
  }
};
$('again').onclick = () => show('s-home');

/* ---------- 分享到 IG 限動 ---------- */
const tagText = [CONFIG.instagram && `@${CONFIG.instagram}`, CONFIG.hashtag].filter(Boolean).join(' ');
let shareFile = null;

function prepareShare({ kind, blob }) {
  const ext = blob.type.includes('webm') ? 'webm' : kind === 'video' ? 'mp4' : 'jpg';
  shareFile = new File([blob], `${CONFIG.couple.replace(/\W+/g, '')}-wedding.${ext}`, { type: blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg') });
  const canShare = navigator.canShare?.({ files: [shareFile] });
  $('share-ig').hidden = !canShare;
  $('save-file').hidden = canShare;
  if (!canShare) {
    $('save-file').href = URL.createObjectURL(shareFile);
    $('save-file').download = shareFile.name;
  }
  $('ig-tip').innerHTML = tagText
    ? `發限動時記得加上 <b>${tagText}</b>${canShare ? '<br>按下按鈕會自動複製，在限動裡長按「貼上」就好' : ''}`
    : '';
}

$('share-ig').onclick = async () => {
  if (tagText) navigator.clipboard?.writeText(tagText).catch(() => {});
  try {
    await navigator.share({ files: [shareFile] });
  } catch (err) {
    if (err.name !== 'AbortError') $('ig-tip').textContent = '這支手機沒辦法直接分享，請改用「存到手機」再自己發 IG。';
  }
};

function petals() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.style.left = `${Math.random() * 100}vw`;
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--r', `${Math.random() * 720}deg`);
    p.style.animationDuration = `${3 + Math.random() * 3}s`;
    p.style.animationDelay = `${Math.random() * 1.5}s`;
    document.body.append(p);
    p.addEventListener('animationend', () => p.remove());
  }
}


/* ---------- 展示首頁：斜斜流動的膠卷牆（最新 12 則已通過的祝福） ---------- */
const FILM_MAX = 12, REELS = 3, FLOW_PX_PER_SEC = 26;
const escHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let filmIds = '', filmItems = [];
const strip = RECORD ? null : await fetch('film/strip.json').then((r) => r.json()).catch(() => null);

// 影片只抓第一格畫面當縮圖，放大看時才真的下載播放，省流量
const thumbs = new Map();
function videoThumb(e) {
  if (!thumbs.has(e.id)) thumbs.set(e.id, new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'metadata';
    const done = (url) => { resolve(url); v.removeAttribute('src'); v.load(); };
    v.onloadeddata = () => {
      try {
        const c = Object.assign(document.createElement('canvas'), { width: 360, height: Math.round(360 * v.videoHeight / v.videoWidth) || 450 });
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        done(c.toDataURL('image/jpeg', 0.7));
      } catch { done(''); }
    };
    v.onerror = () => done('');
    setTimeout(() => done(''), 8000);
    v.src = `${e.url}#t=0.1`;
  }));
  return thumbs.get(e.id);
}

async function loadFilm() {
  if (!strip) return;
  let items = [];
  try { items = (await listEntries('approved')).reverse().slice(0, FILM_MAX); } catch { return; }
  const ids = items.map((e) => e.id).join();
  if (ids === filmIds) return;
  filmIds = ids; filmItems = items;
  $('film').hidden = !items.length;
  document.body.classList.toggle('has-film', items.length > 0);
  if (!items.length) return;

  const pics = await Promise.all(items.map((e) => (e.kind === 'video' ? videoThumb(e) : e.url)));
  const slot = (idx, win) => {
    const e = items[idx], [x, y, w, h] = win.map((v) => `${v * 100}%`);
    return `<button class="slot" data-i="${idx}" style="left:${x};top:${y};width:${w};height:${h}" aria-label="${escHtml(e.name)} 的祝福">
      ${pics[idx] ? `<img src="${escHtml(pics[idx])}" alt="" loading="lazy">` : ''}
      ${e.kind === 'video' ? '<span class="vid">▶</span>' : ''}<span class="tag">${escHtml(e.name)}</span></button>`;
  };
  // 每條膠卷至少 3 段（9 格），祝福不夠就輪流重複；每條從不同的祝福開始
  // 段數要讓「總格數」剛好是祝福數的倍數，接回開頭時才不會同一則連續出現兩次
  const per = strip.wins.length;
  let tiles = 3;
  while ((tiles * per) % items.length && tiles < 12) tiles++;
  $('reels').innerHTML = Array.from({ length: REELS }, (_, r) => {
    const set = Array.from({ length: tiles }, (_, t) => `<div class="tile" style="aspect-ratio:${strip.w}/${strip.h}">
      ${strip.wins.map((win, k) => slot((r * 3 + t * per + k) % items.length, win)).join('')}
      <img class="strip" src="${strip.src}" alt=""></div>`).join('');
    return `<div class="reel"><div class="reel-track">${set}${set}</div></div>`;   // 放兩份，捲到一半剛好接回開頭
  }).join('');
  // 流動速度固定，膠卷越長轉一圈越久
  setTimeout(() => document.querySelectorAll('.reel-track').forEach((t, i) => {
    t.style.setProperty('--dur', `${Math.round(t.scrollHeight / 2 / (FLOW_PX_PER_SEC + i * 5))}s`);
  }), 50);
}

function openLightbox(e) {
  $('lb-media').innerHTML = e.kind === 'video'
    ? `<video src="${escHtml(e.url)}" controls autoplay playsinline></video>`
    : `<img src="${escHtml(e.url)}" alt="${escHtml(e.name)} 的照片">`;
  $('lb-who').textContent = e.name;
  $('lb-msg').textContent = e.message || '';
  $('lightbox').hidden = false;
  $('reels').classList.add('paused');
}
function stopFilmVideos() {   // 關掉放大檢視
  $('lb-media').innerHTML = '';
  $('lightbox').hidden = true;
  $('reels').classList.remove('paused');
}
$('reels').addEventListener('click', (ev) => {
  const b = ev.target.closest('.slot');
  if (b) openLightbox(filmItems[+b.dataset.i]);
});
$('lb-close').onclick = stopFilmVideos;
$('lightbox').addEventListener('click', (ev) => { if (ev.target === $('lightbox')) stopFilmVideos(); });

if (!RECORD) {
  loadFilm();
  onChange(() => loadFilm());
}
