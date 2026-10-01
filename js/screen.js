import { CONFIG } from './config.js';
import { isDemo, listEntries, onChange } from './store.js';
import './ornament.js';
import { createDrape } from './drape.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-couple]').forEach((el) => (el.textContent = CONFIG.couple));
if (isDemo) document.body.insertAdjacentHTML('beforeend', '<div class="demo-banner">示範模式：資料只存在這台電腦</div>');

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
  if (isDemo || !('caches' in window)) return entry.url;
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

/* ---------- 播放清單 ---------- */
let approved = [];          // 依通過時間排序
let known = null;           // 已知的 id（第一次載入前為 null）
const priority = [];        // 新通過、優先插播的 id
let cursor = 0;
let playing = null;

async function refresh() {
  try {
    approved = await listEntries('approved');
  } catch { return; }
  const ids = new Set(approved.map((e) => e.id));
  if (known) for (const id of ids) if (!known.has(id)) priority.push(id);
  known = ids;
  $('count').textContent = `已通過 ${approved.length} 則祝福`;
  // 正在播的被撤下，就立刻換下一則
  if (started && (!playing || !ids.has(playing.id))) next();
}

function pick() {
  while (priority.length) {
    const e = approved.find((x) => x.id === priority.shift());
    if (e) return e;
  }
  if (!approved.length) return null;
  cursor %= approved.length;
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

// 把媒體包進下一個畫框；沒有畫框素材時直接顯示
function framed(inner) {
  const f = frames[frameIndex++ % frames.length];
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
document.body.dataset.fx = FX;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 舊的退場；nextName 是下一位賓客（布幕過場時顯示在布幕上）
async function fxOut(old, nextName) {
  if (!old.classList.contains('on')) return;          // 第一則沒有舊的
  if (FX === 'curtain') {
    $('card').classList.add('fade');
    await drape.close(1300);
    $('intermission').textContent = nextName;
    $('intermission').classList.add('show');
    await wait(900);
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

/* ---------- 隨機插圖裝飾：畫框左右兩側各擺一個，不碰到畫框、布幕和名字 ---------- */
const DECOS = [{ src: 'deco/bow.png', ratio: 700 / 530 }, { src: 'deco/cat.png', ratio: 700 / 665 }];
const rand = (a, b) => a + Math.random() * (b - a);
function scatterDeco(slot) {
  const W = innerWidth, H = innerHeight;
  const box = slot.querySelector('.fbox')?.getBoundingClientRect();
  if (!box) { $('deco').innerHTML = ''; return; }
  const gap = H * 0.04;                        // 跟畫框至少留這麼多
  const curtain = W * 0.17;                    // 布幕收束後大約佔的寬度
  const top = H * 0.17, bottom = box.bottom - gap;
  const zones = [
    { from: curtain, to: box.left - gap },                 // 左側
    { from: box.right + gap, to: W - curtain, maxBottom: H * 0.68 },  // 右側，避開右下角 QR code
  ];
  // 洗牌後依序發給左右兩側，同一畫面不會出現兩個一樣的圖案
  const picks = [...DECOS].sort(() => Math.random() - 0.5);
  $('deco').innerHTML = zones.map((z, i) => {
    const d = picks[i % picks.length];
    const room = z.to - z.from;
    // 旋轉後外框會變大一點，所以寬度多算 15%
    const h = Math.min(rand(H * 0.11, H * 0.17), room / (d.ratio * 1.15));
    if (h < H * 0.06) return '';                 // 空間太小就不放
    const w = h * d.ratio;
    const x = rand(z.from, z.to - w * 1.15) + w * 0.075;
    const yMax = Math.min(bottom, z.maxBottom ?? bottom) - h * 1.1;
    if (yMax <= top) return '';
    const y = rand(top, yMax);
    return `<img src="${d.src}" alt="" style="left:${x}px;top:${y}px;--h:${h}px;--r:${rand(-14, 14)}deg;--d:${0.4 + i * 0.35}s">`;
  }).join('');
}

let busy = false, again = false;
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
  const back = slots[1 - front];
  back.classList.remove('leave', 'enter', 'settled');
  back.classList.toggle('photo', entry.kind === 'photo');
  back.innerHTML = framed(entry.kind === 'video'
    ? `<video playsinline preload="auto"></video>`
    : `<div class="bg"></div><img alt="">`);
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
  }

  await fxOut(old, entry.name);

  // 換上新的一則
  old.querySelectorAll('video').forEach((v) => { v.onended = v.onerror = null; v.pause(); });
  $('idle').style.opacity = 0;
  $('who').textContent = entry.name;
  $('msg').textContent = entry.message || '';
  back.classList.add('on');
  old.classList.remove('on');
  front = 1 - front;
  scatterDeco(back);
  setTimeout(() => {
    old.querySelectorAll('.win video, .win img').forEach((m) => m.src.startsWith('blob:') && !isDemo && URL.revokeObjectURL(m.src));
    if (!old.classList.contains('on')) { old.innerHTML = ''; old.classList.remove('leave', 'enter'); }
  }, 1200);

  document.body.classList.toggle('showing-photo', entry.kind === 'photo');
  await fxIn(back);
  if (entry.kind === 'photo') {
    // 照片先大大地看一下，再縮小、浮現名字和祝福
    await wait(2200);
    back.classList.add('settled');
    await wait(700);
  }
  $('card').classList.remove('fade');

  const cap = FAST ? 5 : Infinity;
  if (entry.kind === 'video') {
    media.onended = () => next();
    media.onerror = () => next();
    timer = setTimeout(next, Math.min(cap, CONFIG.videoMaxSeconds + 15) * 1000); // 保險：卡住就跳下一則
    duck(true);
    try { await media.play(); } catch { media.muted = true; media.play().catch(() => next()); }
  } else {
    duck(false);
    timer = setTimeout(next, Math.min(cap, CONFIG.photoSeconds) * 1000); // 從名字出現後開始算
  }
}

/* ---------- 開幕 ---------- */
let started = false;
const drape = createDrape($('drape'), { lines: 24, spread: [0.13, 0.05, 0.15], gather: 0.55 });
$('start').onclick = () => {
  $('start').classList.add('gone');
  drape.open(3200);
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (CONFIG.musicUrl) { music.src = CONFIG.musicUrl; music.volume = 0.55; music.play().catch(() => {}); }
  setTimeout(() => {
    started = true;
    $('qr-card').hidden = false;
    next();
  }, 3000);
};

await refresh();
onChange(() => refresh());
setInterval(refresh, 30_000); // 保險：即時通知漏掉時也會補抓
