// 婚禮祝福牆設定。supabaseUrl 留空 = 示範模式（資料只存在這台電腦的瀏覽器）。
export const CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
  bucket: 'media',

  couple: 'Corner & Tsung',
  date: '2026 · 11 · 19',

  videoMaxSeconds: 60,
  photoSeconds: 8,        // 大螢幕每張照片停留秒數
  maxUploadMB: 45,        // Supabase 免費方案單檔上限 50MB
  musicUrl: '',           // 大螢幕背景音樂（mp3 網址），留空 = 不播
};
