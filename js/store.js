// 資料層：示範模式用 IndexedDB + BroadcastChannel；正式模式用 Supabase。
import { CONFIG } from './config.js';

// 示範模式（本機假資料）：在這台電腦預覽（localhost）時預設開啟，網址加 ?live 才讀 Supabase 真資料；
// 放上網路後一律讀真資料，除非網址加 ?demo
const q = new URLSearchParams(location.search);
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const isDemo = !CONFIG.supabaseUrl || q.has('demo') || (isLocal && !q.has('live'));

/* ---------- Supabase ---------- */
let sbPromise = null;
function supabase() {
  sbPromise ??= import('../vendor/supabase-2.117.2.mjs')
    .then(({ createClient }) => createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey));
  return sbPromise;
}
const publicUrl = (path) => `${CONFIG.supabaseUrl}/storage/v1/object/public/${CONFIG.bucket}/${path}`;

function xhrUpload(path, blob, mime, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${CONFIG.supabaseUrl}/storage/v1/object/${CONFIG.bucket}/${path}`);
    x.setRequestHeader('apikey', CONFIG.supabaseKey);
    if (!CONFIG.supabaseKey.startsWith('sb_')) x.setRequestHeader('Authorization', `Bearer ${CONFIG.supabaseKey}`);
    x.setRequestHeader('Content-Type', mime);
    x.setRequestHeader('cache-control', 'max-age=31536000');
    x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(`上傳失敗（${x.status}）`)));
    x.onerror = () => reject(new Error('網路中斷，請確認訊號後再試一次'));
    x.send(blob);
  });
}

/* ---------- 示範模式 IndexedDB ---------- */
let idbPromise = null;
function idb() {
  idbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('wedding-wall', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('entries', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', mode);
    const req = fn(tx.objectStore('entries'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('wedding-wall') : null;
const demoUrls = new Map();
function withDemoUrl(e) {
  if (!demoUrls.has(e.id)) demoUrls.set(e.id, URL.createObjectURL(e.blob));
  if (e.thumb && !demoUrls.has(`${e.id}:thumb`)) demoUrls.set(`${e.id}:thumb`, URL.createObjectURL(e.thumb));
  const { blob, thumb, ...rest } = e;
  return { ...rest, url: demoUrls.get(e.id), thumbUrl: demoUrls.get(`${e.id}:thumb`) || null };
}

/* ---------- 公開 API ---------- */
const extFor = (mime) => (mime.includes('mp4') ? 'mp4' : mime.includes('webm') ? 'webm' : mime.includes('png') ? 'png' : 'jpg');

// thumb：影片的 3 格縮圖（一張橫排三格的 JPEG），膠卷頁用它來做動圖，不用每個人都去下載影片
export async function addEntry({ name, message, kind, blob, thumb }, onProgress) {
  const id = crypto.randomUUID();
  const mime = blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const row = { id, name, message, kind, mime, size: blob.size };

  if (isDemo) {
    // 假裝上傳進度，讓試作看得到進度條
    for (let p = 0; p <= 1; p += 0.1) { onProgress?.(p); await new Promise((r) => setTimeout(r, 120)); }
    await idbDo('readwrite', (s) => s.put({ ...row, blob, thumb: thumb || null, status: 'pending', created_at: new Date().toISOString(), approved_at: null }));
    channel?.postMessage('change');
    return;
  }
  const path = `${new Date().toISOString().slice(0, 10)}/${id}.${extFor(mime)}`;
  await xhrUpload(path, blob, mime, onProgress);
  if (thumb) await xhrUpload(`${path}.thumb.jpg`, thumb, 'image/jpeg').catch(() => {});   // 縮圖失敗不影響送出
  const sb = await supabase();
  const { error } = await sb.from('entries').insert({ ...row, path });
  if (error) throw new Error('資料寫入失敗，請再試一次');
}

// status: 'pending' | 'approved' | 'hidden'；依時間排序（已通過依通過時間）
export async function listEntries(status) {
  const orderKey = status === 'approved' ? 'approved_at' : 'created_at';
  if (isDemo) {
    const all = await idbDo('readonly', (s) => s.getAll());
    return all.filter((e) => e.status === status)
      .sort((a, b) => (a[orderKey] > b[orderKey] ? 1 : -1))
      .map(withDemoUrl);
  }
  const sb = await supabase();
  const { data, error } = await sb.from('entries').select('*').eq('status', status).order(orderKey, { ascending: true });
  if (error) throw error;
  return data.map((e) => ({ ...e, url: publicUrl(e.path), thumbUrl: e.kind === 'video' ? publicUrl(`${e.path}.thumb.jpg`) : null }));
}

export async function setStatus(id, status) {
  const patch = { status, approved_at: status === 'approved' ? new Date().toISOString() : null };
  if (isDemo) {
    await idbDo('readwrite', (s) => {
      const req = s.get(id);
      req.onsuccess = () => s.put({ ...req.result, ...patch });
      return req;
    });
    channel?.postMessage('change');
    return;
  }
  const sb = await supabase();
  const { error } = await sb.from('entries').update(patch).eq('id', id);
  if (error) throw error;
}

export async function totalBytes() {
  if (isDemo) return (await idbDo('readonly', (s) => s.getAll())).reduce((n, e) => n + e.size, 0);
  const sb = await supabase();
  const { data } = await sb.from('entries').select('size');
  return (data || []).reduce((n, e) => n + (e.size || 0), 0);
}

// 資料有變動時呼叫 cb（不傳內容，接收端自己重抓）
export async function onChange(cb) {
  if (isDemo) { channel?.addEventListener('message', cb); return; }
  const sb = await supabase();
  sb.channel('entries').on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, cb).subscribe();
}

/* ---------- 審核登入 ---------- */
export async function currentUser() {
  if (isDemo) return { email: 'demo' };
  const sb = await supabase();
  return (await sb.auth.getSession()).data.session?.user ?? null;
}
export async function signIn(email, password) {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error('帳號或密碼不對');
}
export async function signOut() {
  if (!isDemo) await (await supabase()).auth.signOut();
}
