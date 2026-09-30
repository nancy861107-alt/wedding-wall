import { CONFIG } from './config.js';
import { isDemo, addEntry } from './store.js';
import { crest } from './ornament.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-couple]').forEach((el) => (el.textContent = CONFIG.couple));
document.querySelectorAll('[data-date]').forEach((el) => (el.textContent = CONFIG.date));
$('crest-top').innerHTML = crest();
if (isDemo) document.body.insertAdjacentHTML('beforeend', '<div class="demo-banner">示範模式：資料只存在這台電腦</div>');

requestAnimationFrame(() => setTimeout(() => $('curtain').classList.add('open'), 300));

function show(id) {
  document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== id));
  window.scrollTo(0, 0);
}
function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

// 目前要送出的內容
let pending = null; // { kind, blob }

/* ---------- 錄影 ---------- */
const MIME_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
let stream = null, recorder = null, chunks = [], facing = 'user', tick = null;

async function startCamera() {
  stopCamera();
  showError($('cam-error'), '');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    $('cam').srcObject = stream;
    $('cam').classList.toggle('mirror', facing === 'user');
  } catch (e) {
    showError($('cam-error'), '沒辦法開啟相機。請允許相機和麥克風權限；如果是在 LINE 裡打開，請點右上角「⋯」選「用瀏覽器開啟」。也可以回上一頁改用「從相簿選影片」。');
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
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 96_000 });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    clearInterval(tick);
    const blob = new Blob(chunks, { type: (recorder.mimeType || 'video/mp4').split(';')[0] });
    stopCamera();
    pending = { kind: 'video', blob };
    $('review').src = URL.createObjectURL(blob);
    show('s-review');
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
  setTimer(CONFIG.videoMaxSeconds, false);
  $('rec-btn').classList.remove('stop');
  $('rec-btn').setAttribute('aria-label', '開始錄影');
  $('rec-hint').textContent = `按下紅色按鈕開始錄，最長 ${CONFIG.videoMaxSeconds} 秒`;
  $('flip').hidden = false;
}

$('go-video').onclick = () => { resetRecordUI(); show('s-record'); startCamera(); };
$('rec-btn').onclick = () => (recorder?.state === 'recording' ? recorder.stop() : startRecording());
$('flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startCamera(); };
$('rec-cancel').onclick = () => { if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); } stopCamera(); resetRecordUI(); show('s-home'); };
$('redo').onclick = () => { $('review').pause(); resetRecordUI(); show('s-record'); startCamera(); };
$('use').onclick = () => { $('review').pause(); toDetails(); };

/* ---------- 從相簿選影片 ---------- */
$('pick-video').onclick = () => $('file-video').click();
$('file-video').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
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

/* ---------- 照片（拍照或相簿），先在手機上壓縮 ---------- */
$('go-photo').onclick = () => $('file-photo').click();
$('file-photo').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    pending = { kind: 'photo', blob: await compressImage(file) };
    toDetails();
  } catch {
    alert('這張照片讀不出來，請換一張試試。');
  }
};
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
  $('thumb').querySelectorAll('video, img').forEach((n) => n.remove());
  $('thumb').insertAdjacentHTML('afterbegin', pending.kind === 'video'
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
