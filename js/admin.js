import { CONFIG } from './config.js';
import { isDemo, listEntries, setStatus, totalBytes, onChange, currentUser, signIn } from './store.js';
import './ornament.js';

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

async function render() {
  const [pending, approved, hidden, bytes] = await Promise.all(
    [listEntries('pending'), listEntries('approved'), listEntries('hidden'), totalBytes()]);
  const lists = { pending, approved, hidden };
  for (const k in lists) $(`n-${k}`).textContent = lists[k].length || '';

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
