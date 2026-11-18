import { CONFIG } from './config.js';
import './ornament.js';
import './paw.js';
import { createDrapeLite } from './drape-lite.js';

const $ = (id) => document.getElementById(id);

// 新人照片大螢幕：跟祝福大螢幕同一套畫框和過場，輪播的是 couple/photos.json 列的照片（不用登入、不連資料庫）
const isDemo = false;
document.querySelectorAll('[data-couple]').forEach((el) => (el.textContent = CONFIG.couple));

/* ---------- QR code 指向賓客頁（LINE 內開啟時自動跳外部瀏覽器） ---------- */
const guestUrl = new URL('./?openExternalBrowser=1', location.href).href;
const qr = qrcode(0, 'M');
qr.addData(guestUrl);
qr.make();
document.querySelectorAll('[data-qr]').forEach((el) => (el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })));

/* ---------- 滑鼠動了才顯示游標和計數 ---------- */
let awakeTimer;
addEventListener('mousemove', () => {
  document.body.classList.add('awake');
  clearTimeout(awakeTimer);
  awakeTimer = setTimeout(() => document.body.classList.remove('awake'), 2500);
});

/* ---------- 媒體快取：每個檔案只下載一次，重播不吃流量 ---------- */
async function mediaUrl(entry) {
  if (isDemo || !('caches' in window) || new URL(entry.url).origin !== location.origin) return entry.url;
  try {
    const cache = await caches.open('wall-media');
    let res = await cache.match(entry.url);
    if (!res) {
      res = await fetch(entry.url);
      if (!res.ok) throw new Error(res.status);
      await cache.put(entry.url, res.clone());
    }
    return URL.createObjectURL(await res.blob());
  } catch {
    return entry.url;
  }
}

// 開幕後在背景把所有已通過的影片、照片先下載存到這台電腦：會場網路斷掉也能繼續播
const prefetched = new Set();
let prefetching = false;
async function prefetchAll(list) {
  list = list.filter((e) => new URL(e.url).origin === location.origin);   // 只有同網站的檔案能存進快取
  if (isDemo || !('caches' in window) || prefetching) return;
  prefetching = true;
  try {
    const cache = await caches.open('wall-media');
    for (const e of list) {
      if (prefetched.has(e.url)) continue;
      try {
        if (!(await cache.match(e.url))) {
          const res = await fetch(e.url);
          if (res.ok) await cache.put(e.url, res);
        }
        prefetched.add(e.url);
      } catch { /* 下次重新整理清單時再試 */ }
    }
  } finally { prefetching = false; }
}

/* ---------- 播放清單：couple/photos.json ---------- */
// 每一項可以是檔名字串 "01.jpg"，或 { "src": "01.jpg", "caption": "2019 第一次約會" }；
// 檔案放在 couple/ 資料夾，副檔名是 mp4/mov/webm 的當影片播
let approved = [];
let cursor = 0;
let playing = null;

async function refresh() {
  try {
    const list = await fetch(`couple/photos.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json());
    approved = list.map((x, i) => {
      const item = typeof x === 'string' ? { src: x } : x;
      const url = new URL(item.src, new URL('couple/', location.href)).href;
      return { id: `${i}:${item.src}`, url, kind: /\.(mp4|mov|m4v|webm)$/i.test(item.src) ? 'video' : 'photo', name: item.caption || '', message: item.note || '' };
    });
  } catch { return; }
  prefetchAll(approved);
  // 外部相簿（Google 相簿）的照片不能存進快取，先用 <img> 全部預載，讓瀏覽器自己留著
  for (const e of approved) if (e.kind === 'photo' && new URL(e.url).origin !== location.origin) new Image().src = e.url;
}

function pick() {
  if (!approved.length) return null;
  cursor %= approved.length;
  $('count').textContent = `第 ${cursor + 1} / ${approved.length} 張`;
  return approved[cursor++];
}

/* ---------- 顯示 ---------- */
const slots = [$('slotA'), $('slotB')];
const frames = await fetch('frames/frames.json').then((r) => r.json()).catch(() => []);
let frameIndex = 0;

// 比例跟畫框視窗差不多就填滿（裁一點邊），差太多才完整顯示＋模糊背景
function fit(media) {
  const win = media.closest('.win');
  const [mw, mh] = media.tagName === 'VIDEO' ? [media.videoWidth, media.videoHeight] : [media.naturalWidth, media.naturalHeight];
  if (!mw || !win) return;
  const diff = Math.abs(mw / mh - win.clientWidth / win.clientHeight) / (win.clientWidth / win.clientHeight);
  media.style.objectFit = diff < 0.45 ? 'cover' : 'contain';
}

// 先量出照片／影片的長寬比，好挑直式或橫式畫框；量不到就當直式
function measure(url, kind) {
  return new Promise((resolve) => {
    const done = (w, h) => { clearTimeout(t); resolve(w && h ? w / h : 0.8); };
    const t = setTimeout(() => done(0, 0), 4000);
    if (kind === 'video') {
      const v = Object.assign(document.createElement('video'), { preload: 'metadata', muted: true });
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done(0, 0);
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done(0, 0);
      img.src = url;
    }
  });
}

// 把媒體包進下一個畫框：橫拍的用橫式畫框，直拍的用直式或方形；沒有畫框素材時直接顯示
function framed(inner, aspect) {
  const pool = frames.filter((f) => (aspect > 1.1 ? f.w > f.h : f.w <= f.h * 1.05));
  const f = pool[frameIndex++ % pool.length];
  if (!f) return `<div class="fbox" style="aspect-ratio:16/9"><div class="win" style="inset:0">${inner}</div></div>`;
  const [x, y, w, h] = f.win.map((v) => `${v * 100}%`);
  // dx：個別畫框的左右微調（畫框寬度的比例，負數往左）；scale：個別畫框縮放
  return `<div class="fbox" style="aspect-ratio:${f.w}/${f.h};height:calc(var(--frame-scale) * ${(f.scale || 1) * 100}%);translate:${(f.dx || 0) * 100}% 0">
    <div class="win" style="left:${x};top:${y};width:${w};height:${h};-webkit-mask-image:url(${f.mask});mask-image:url(${f.mask})">${inner}</div>
    <img class="fimg" src="${f.src}" alt=""></div>`;
}
let front = 0, timer = null;
const music = $('music');

function duck(on) {
  if (!CONFIG.musicUrl) return;
  const target = on ? 0.06 : 0.55;
  const step = () => {
    const d = target - music.volume;
    if (Math.abs(d) < 0.02) { music.volume = target; return; }
    music.volume += d * 0.15;
    requestAnimationFrame(step);
  };
  step();
}

/* ---------- 過場動畫：網址 ?fx=curtain | hang | spot；?fast = 每則只播 5 秒（預覽用） ---------- */
const params = new URLSearchParams(location.search);
const FX = params.get('fx') || CONFIG.transition || 'curtain';
const FAST = params.has('fast');
const SECONDS = Number(params.get('sec')) || CONFIG.couplePhotoSeconds || CONFIG.photoSeconds;   // ?sec=6 可臨時改每張秒數
document.body.dataset.fx = FX;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 舊的退場；nextName 是下一位賓客（布幕過場時顯示在布幕上）
async function fxOut(old, nextName) {
  if (!old.classList.contains('on')) return;          // 第一則沒有舊的
  $('deco').classList.add('away');                     // 插圖先收起來
  if (FX === 'curtain') {
    $('card').classList.add('fade');
    await drape.close(1300);
    $('intermission').textContent = nextName;
    $('intermission').classList.add('show');
    await wait(2600);                                  // 布幕上的日期多停一下，看得清楚
  } else if (FX === 'hang') {
    $('card').classList.add('fade');
    old.classList.add('leave');
    await wait(650);
  } else if (FX === 'spot') {
    $('card').classList.add('fade');
    $('spot').classList.add('shut');
    await wait(1000);
  } else {
    $('card').classList.add('fade');
  }
}

async function fxIn(back) {
  if (FX === 'curtain') {
    $('intermission').classList.remove('show');
    await wait(300);
    drape.open(1600);
    await wait(900);
  } else if (FX === 'hang') {
    back.classList.add('enter');
    await wait(500);
  } else if (FX === 'spot') {
    $('spot').classList.remove('shut');
    await wait(500);
  }
}

/* ---------- 隨機插圖裝飾：只放在空白紙面，不碰畫框、布幕、名字、QR code ---------- */
const DECOS = [{ src: 'deco/bow.png', ratio: 700 / 530 }, { src: 'deco/cat.png', ratio: 700 / 578 }, { src: 'deco/cat2.png', ratio: 666 / 700 }, { src: 'deco/ring.png', ratio: 440 / 700, scale: 0.8 }, { src: 'deco/doves.png', ratio: 900 / 423, scale: 1.3 }, { src: 'deco/love.png', ratio: 700 / 678 }, { src: 'deco/bow2.png', ratio: 700 / 622 }, { src: 'deco/love2.png', ratio: 700 / 678 }];  // scale：個別插圖縮放
const rand = (a, b) => a + Math.random() * (b - a);
const grow = (r, g) => ({ left: r.left - g, right: r.right + g, top: r.top - g, bottom: r.bottom + g });
const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function scatterDeco(slot) {
  const W = innerWidth, H = innerHeight, gap = H * 0.03;
  const box = slot.querySelector('.fbox')?.getBoundingClientRect();
  if (!box) { $('deco').innerHTML = ''; return; }
  const card = $('card').getBoundingClientRect();
  // 名字區在照片模式會往上移 5vh，兩個位置都避開
  const cardZone = { left: card.left, right: card.right, top: card.top - H * 0.05, bottom: card.bottom, width: card.width };
  const blocks = [box, cardZone, document.querySelector('.heading .names').getBoundingClientRect(), $('qr-card').getBoundingClientRect()]
    .filter((r) => r.width).map((r) => grow(r, gap));
  const clearOfCurtain = (r) => {
    for (let i = 0; i <= 6; i++) {
      const y = r.top + ((r.bottom - r.top) * i) / 6;
      const e = drape.edgeX(y) + gap;
      if (r.left < e || r.right > W - e) return false;
    }
    return true;
  };
  // 從所有插圖隨機挑 6 張不重複；左右各 3 張，每側上中下各一張，平均分布
  const picks = [...DECOS].sort(() => Math.random() - 0.5).slice(0, 6);
  const sides = [0, 0, 0, 1, 1, 1];
  const bandH = (box.bottom - box.top) / 3;

  // 每張插圖都塞進同樣大小的正方形，看起來一樣大；全部都放得下的最大尺寸
  function tryPlace(S) {
    const placed = [], out = [];
    for (const [i, d] of picks.entries()) {
      const side = sides[i];
      const size = S * (d.scale || 1);
      const w = d.ratio >= 1 ? size : size * d.ratio, h = d.ratio >= 1 ? size / d.ratio : size;
      const pad = S * 0.08;                              // 旋轉後外框會大一點
      let ok = false;
      // 每張靠近自己格子的中心，只小幅隨機偏移，插圖之間才會平均、不擠
      const zoneL = side === 0 ? drape.edgeX(box.top + bandH * (i % 3 + 0.5)) + gap : box.right + gap;
      const zoneR = side === 0 ? box.left - gap : W - drape.edgeX(box.top + bandH * (i % 3 + 0.5)) - gap;
      const cy = box.top + bandH * (i % 3 + 0.5);
      // 上中下左右錯開（之字形）：上、下靠外側，中間靠畫框；兩側方向相反
      const half = Math.max(0, (zoneR - zoneL - w) / 2);
      const outward = side === 0 ? -1 : 1;
      const cx = (zoneL + zoneR) / 2 + (i % 3 === 1 ? -outward : outward) * half * 0.6;
      for (let k = 0; k < 60 && !ok; k++) {
        const jitter = 0.3 + k / 60;                      // 找不到位置就慢慢放寬偏移範圍
        const x = cx - w / 2 + rand(-1, 1) * half * 0.35 * Math.min(1, jitter);
        const y = cy - h / 2 + rand(-1, 1) * Math.max(0, (bandH - h) / 2) * Math.min(1, jitter);
        const r = { left: x - pad, right: x + w + pad, top: y - pad, bottom: y + h + pad };
        if (x < 0 || x + w > W || r.top < 0 || r.bottom > H) continue;
        if (blocks.some((b) => hits(r, b)) || placed.some((b) => hits(r, b)) || !clearOfCurtain(r)) continue;
        placed.push(grow(r, S * 0.5));                  // 插圖之間至少隔半張插圖
        out.push(`<img src="${d.src}" alt="" style="left:${x}px;top:${y}px;--h:${h}px;--r:${rand(-12, 12)}deg;--d:${1.2 + (i % 3) * 0.25 + side * 0.12}s">`);
        ok = true;
      }
      if (!ok) return null;
    }
    return out.join('');
  }
  let html = '';
  for (let S = H * 0.14; S >= H * 0.06 && !html; S *= 0.92) html = tryPlace(S) || '';
  $('deco').innerHTML = html;    // 放不下就都不放
}

// 視窗大小改變（例如接上投影機）就重新擺插圖
let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => started && slots[front].classList.contains('on') && scatterDeco(slots[front]), 300);
});

let busy = false, again = false, typeToken = 0;
async function next() {
  if (busy) { again = true; return; }
  busy = true;
  try { await showNext(); } finally { busy = false; }
  if (again) { again = false; next(); }
}

async function showNext() {
  clearTimeout(timer);
  const entry = pick();
  const old = slots[front];
  if (!entry) {
    playing = null;
    $('idle').style.opacity = 1;
    $('card').classList.add('fade');
    slots.forEach((s) => s.classList.remove('on'));
    return;
  }
  playing = entry;
  const url = await mediaUrl(entry);
  const aspect = await measure(url, entry.kind);
  const back = slots[1 - front];
  back.classList.remove('leave', 'enter', 'settled');
  back.classList.toggle('photo', entry.kind === 'photo');
  back.innerHTML = framed(entry.kind === 'video'
    ? `<video playsinline preload="auto"></video>`
    : `<div class="bg"></div><img alt="">`, aspect);
  let media;
  if (entry.kind === 'video') {
    media = back.querySelector('video');
    media.onloadedmetadata = () => fit(media);
    media.src = url;
  } else {
    back.querySelector('.bg').style.backgroundImage = `url("${url}")`;
    media = back.querySelector('.win img');
    media.onload = () => fit(media);
    media.src = url;
    // 先在背景把大照片解碼好，換場時才不會卡一下
    await media.decode?.().catch(() => {});
  }

  await fxOut(old, entry.name);

  // 換上新的一則
  old.querySelectorAll('video').forEach((v) => { v.onended = v.onerror = null; v.pause(); });
  $('idle').style.opacity = 0;
  $('who').textContent = entry.name;
  // 說明文字先整段排好（隱形），之後一個字一個字浮現，排版才不會跳
  const chars = [...(entry.message || '')];
  $('msg').innerHTML = chars.map((c) => `<span class="ch">${c.replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x])}</span>`).join('');
  const typing = ++typeToken;
  back.classList.add('on');
  old.classList.remove('on');
  front = 1 - front;
  document.body.classList.toggle('showing-photo', entry.kind === 'photo');
  scatterDeco(back);
  $('deco').classList.remove('away');
  setTimeout(() => {
    old.querySelectorAll('.win video, .win img').forEach((m) => m.src.startsWith('blob:') && !isDemo && URL.revokeObjectURL(m.src));
    if (!old.classList.contains('on')) { old.innerHTML = ''; old.classList.remove('leave', 'enter'); }
  }, 1200);

  document.body.classList.toggle('showing-photo', entry.kind === 'photo');
  await fxIn(back);
  if (entry.kind === 'photo' && (entry.name || entry.message)) {
    // 照片先大大地看一下，再縮小、浮現名字和祝福
    await wait(2200);
    back.classList.add('settled');
    await wait(700);
  }
  $('card').classList.remove('fade');

  // 打字效果：每個字約 0.11 秒；打完後才開始算停留秒數
  if (chars.length) {
    await wait(500);
    for (const el of $('msg').querySelectorAll('.ch')) {
      if (typing !== typeToken) return;            // 已經換下一張了
      el.classList.add('on');
      await wait(el.textContent.trim() ? 110 : 60);
    }
  }

  const cap = FAST ? 5 : Infinity;
  if (entry.kind === 'video') {
    media.onended = () => next();
    media.onerror = () => next();
    timer = setTimeout(next, Math.min(cap, CONFIG.videoMaxSeconds + 15) * 1000); // 保險：卡住就跳下一則
    duck(true);
    try { await media.play(); } catch { media.muted = true; media.play().catch(() => next()); }
  } else {
    duck(false);
    timer = setTimeout(next, Math.min(cap, SECONDS) * 1000); // 從名字出現後開始算
  }
}

/* ---------- 開幕 ---------- */
let started = false;
const drape = createDrapeLite($('drape'), { lines: 24, spread: [0.13, 0.05, 0.15], gather: 0.55 });
$('start').onclick = async () => {
  $('start').classList.add('gone');
  const opened = drape.open(3200);
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (CONFIG.musicUrl) { music.src = CONFIG.musicUrl; music.volume = 0.55; music.play().catch(() => {}); }
  await opened;                                  // 布幕完全拉開後才放第一張，兩件事不搶效能
  started = true;
  $('qr-card').hidden = params.has('noqr');     // ?noqr 可以把右下角 QR code 藏起來
  next();
};

await refresh();
