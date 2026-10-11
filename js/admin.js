import { CONFIG } from './config.js';
import { isDemo, listEntries, setStatus, totalBytes, onChange, currentUser, signIn } from './store.js';
import './ornament.js';
import './paw.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-couple]').forEach((el) => (el.textContent = CONFIG.couple));
if (isDemo) document.body.insertAdjacentHTML('beforeend', '<div class="demo-banner">示範模式：資料只存在這台電腦</div>');

const LIMIT_BYTES = 1024 ** 3; // Supabase 免費方案 1GB
const ACTIONS = {
  pending: [['hidden', '✕ 隱藏', 'ghost'], ['approved', '✓ 通過', '']],
  approved: [['hidden', '撤下', 'ghost'], ['pending', '移回待審', 'ghost']],
  hidden: [['pending', '移回待審', 'ghost'], ['approved', '✓ 通過', '']],
};
let tab = 'pending';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const time = (iso) => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

function cardHtml(e) {
  const media = e.kind === 'video'
    ? `<video src="${esc(e.url)}" controls playsinline preload="metadata"></video>`
    : `<img src="${esc(e.url)}" alt="" loading="lazy">`;
  const btns = ACTIONS[tab].map(([to, label, cls]) =>
    `<button class="plaque ${cls}" data-id="${esc(e.id)}" data-to="${to}">${label}</button>`).join('');
  return `<article class="card"><div class="media">${media}</div>
    <div class="body"><p class="who">${esc(e.name)}</p>${e.message ? `<p class="msg">${esc(e.message)}</p>` : ''}
    <p class="meta">${e.kind === 'video' ? '影片' : '照片'} · ${e.size < 1048576 ? `${Math.round(e.size / 1024)}KB` : `${(e.size / 1048576).toFixed(1)}MB`} · ${time(e.created_at)}</p></div>
    <div class="btns">${btns}</div></article>`;
}

/* ---------- 新祝福提醒：分頁標題顯示數量、手機震動、叮一聲、跳出小通知 ---------- */
let knownPending = null;           // 第一次載入前為 null，避免一打開就叮
let audio = null;
addEventListener('pointerdown', () => {   // 瀏覽器規定要先點過畫面才能出聲
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  audio.resume?.();
}, { passive: true });

function ding() {
  if (!audio) return;
  const t = audio.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.12 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.4);
  });
}

function notifyNew(n) {
  ding();
  navigator.vibrate?.([120, 80, 120]);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = `有 ${n} 則新的祝福等你審核`;
  toast.onclick = () => document.querySelector('nav [data-tab="pending"]').click();
  document.body.append(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function render() {
  const [pending, approved, hidden, bytes] = await Promise.all(
    [listEntries('pending'), listEntries('approved'), listEntries('hidden'), totalBytes()]);
  const lists = { pending, approved, hidden };
  for (const k in lists) $(`n-${k}`).textContent = lists[k].length || '';

  document.title = pending.length ? `(${pending.length}) 祝福審核` : '祝福審核';
  const ids = new Set(pending.map((e) => e.id));
  if (knownPending) {
    const fresh = [...ids].filter((id) => !knownPending.has(id)).length;
    if (fresh) notifyNew(fresh);
  }
  knownPending = ids;

  // 待審：最舊的先審；其他：最新的在前
  const items = tab === 'pending' ? lists[tab] : [...lists[tab]].reverse();
  const grid = $('grid');
  const playingSrc = [...grid.querySelectorAll('video')].find((v) => !v.paused)?.getAttribute('src');
  if (playingSrc && items.some((e) => e.url === playingSrc)) {
    // 有影片正在看就不要整頁重畫，只更新計數
  } else {
    grid.innerHTML = items.length ? items.map(cardHtml).join('')
      : `<p class="empty">${{ pending: '目前沒有待審核的祝福，新上傳的會自動出現在這裡', approved: '還沒有通過的祝福', hidden: '沒有被隱藏的祝福' }[tab]}</p>`;
  }

  $('meter').style.width = `${Math.min(100, (bytes / LIMIT_BYTES) * 100)}%`;
  $('usage-text').textContent = `已用 ${(bytes / 1024 / 1024).toFixed(0)}MB / 1GB`;
}

$('grid').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-id]');
  if (!btn) return;
  btn.closest('.card').classList.add('leaving');
  try {
    await setStatus(btn.dataset.id, btn.dataset.to);
  } catch {
    alert('沒有存到，請檢查網路後再按一次。');
  }
  render();
});

document.querySelectorAll('nav [data-tab]').forEach((b) => (b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll('nav [data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
  $('grid').innerHTML = '';
  render();
}));

/* ---------- 一鍵下載全部祝福（影片、照片＋一份留言清單），婚後保存用 ---------- */
const STATUS_ZH = { approved: '已通過', pending: '待審核', hidden: '已隱藏' };
function loadJSZip() {
  return window.JSZip ? Promise.resolve(window.JSZip) : new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/jszip-3.10.1.min.js';
    sc.onload = () => resolve(window.JSZip);
    sc.onerror = () => reject(new Error('下載工具載入失敗，請檢查網路'));
    document.head.append(sc);
  });
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
// 抓不到就等一下再試，最多 3 次；回應不是 200 也算失敗，免得把錯誤訊息存成影片檔
async function fetchBlob(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      return await res.blob();
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

$('download-all').onclick = async () => {
  const btn = $('download-all');
  if (btn.disabled) return;
  btn.disabled = true;
  const label = btn.textContent;
  try {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const all = [];
    for (const st of ['approved', 'pending', 'hidden']) (await listEntries(st)).forEach((e) => all.push({ ...e, st }));
    if (!all.length) { alert('目前還沒有任何祝福可以下載。'); return; }
    const rows = [['狀態', '名字', '留言', '類型', '上傳時間', '檔案'].map(csvCell).join(',')];
    const missing = [];
    let i = 0;
    for (const e of all) {
      i += 1;
      btn.textContent = `下載中 ${i} / ${all.length}`;
      const ext = (e.mime || '').includes('webm') ? 'webm' : e.kind === 'video' ? 'mp4' : 'jpg';
      const file = `${String(i).padStart(3, '0')}_${(e.name || '無名').replace(/[\\/:*?"<>|]/g, '')}.${ext}`;
      let saved = true;
      try {
        zip.folder(STATUS_ZH[e.st]).file(file, await fetchBlob(e.url), { binary: true, compression: 'STORE' });
      } catch {
        saved = false;   // 單一檔案抓不到就先略過，清單會標「缺檔」，最後再提醒
        missing.push(`${STATUS_ZH[e.st]}：${e.name}`);
      }
      rows.push([STATUS_ZH[e.st], e.name, e.message, e.kind === 'video' ? '影片' : '照片',
        new Date(e.created_at).toLocaleString('zh-TW'), saved ? `${STATUS_ZH[e.st]}/${file}` : '缺檔（下載失敗）'].map(csvCell).join(','));
    }
    zip.file('祝福留言清單.csv', '\ufeff' + rows.join('\n'));   // 加 BOM，Excel 打開中文才不會亂碼
    btn.textContent = '打包中…';
    const out = await zip.generateAsync({ type: 'blob' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(out),
      download: `${CONFIG.couple.replace(/\W+/g, '')}祝福_${new Date().toLocaleDateString('sv')}.zip`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    if (missing.length) {
      alert(`有 ${missing.length} 個檔案沒下載成功，壓縮檔裡少了它們（清單裡標「缺檔」）：\n\n${missing.join('\n')}\n\n請確認網路後再按一次「全部下載」。`);
    }
  } catch (err) {
    alert(`下載失敗：${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
};

async function enter() {
  $('login').hidden = true;
  $('panel').hidden = false;
  await render();
  onChange(() => render());
  setInterval(render, 20_000);
}

$('login').onsubmit = async (e) => {
  e.preventDefault();
  $('login-error').hidden = true;
  try {
    await signIn($('email').value.trim(), $('pw').value);
    enter();
  } catch (err) {
    $('login-error').textContent = err.message;
    $('login-error').hidden = false;
  }
};

if (await currentUser()) enter();
else $('login').hidden = false;
