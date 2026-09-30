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

async function next() {
  clearTimeout(timer);
  const entry = pick();
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
  back.innerHTML = entry.kind === 'video'
    ? `<video playsinline preload="auto"></video>`
    : `<div class="bg"></div><img alt="">`;

  if (entry.kind === 'video') {
    const v = back.querySelector('video');
    v.src = url;
    v.onended = () => next();
    v.onerror = () => next();
    timer = setTimeout(next, (CONFIG.videoMaxSeconds + 15) * 1000); // 保險：卡住就跳下一則
    duck(true);
    try { await v.play(); } catch { v.muted = true; v.play().catch(() => next()); }
  } else {
    back.querySelector('.bg').style.backgroundImage = `url("${url}")`;
    back.querySelector('img').src = url;
    duck(false);
    timer = setTimeout(next, CONFIG.photoSeconds * 1000);
  }

  $('idle').style.opacity = 0;
  $('card').classList.add('fade');
  setTimeout(() => {
    $('who').textContent = entry.name;
    $('msg').textContent = entry.message || '';
    $('card').classList.remove('fade');
  }, 500);

  back.classList.add('on');
  const old = slots[front];
  old.classList.remove('on');
  setTimeout(() => {
    old.querySelectorAll('video').forEach((v) => { v.onended = v.onerror = null; v.pause(); });
    old.querySelectorAll('video, img').forEach((m) => m.src.startsWith('blob:') && !isDemo && URL.revokeObjectURL(m.src));
    if (!old.classList.contains('on')) old.innerHTML = '';
  }, 1200);
  front = 1 - front;
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
