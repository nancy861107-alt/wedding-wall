// 婚禮祝福牆設定。supabaseUrl 留空 = 示範模式（資料只存在這台電腦的瀏覽器）。
export const CONFIG = {
  supabaseUrl: 'https://fczxrzzhuoxdohtlxkas.supabase.co',
  supabaseKey: 'sb_publishable_LOv24p-cWryUSfD5A4nkMg_zG8BhpI7',
  bucket: 'media',

  couple: 'Corner & Tsung',
  date: '19 · XI · 2026',

  videoMaxSeconds: 60,
  photoSeconds: 8,        // 大螢幕每張照片停留秒數
  maxUploadMB: 45,        // Supabase 免費方案單檔上限 50MB
  musicUrl: '',           // 大螢幕背景音樂（mp3 網址），留空 = 不播

  // 上傳後「分享到 IG 限動」要提示標記的帳號與 hashtag（帳號留空 = 不提示標記）
  instagram: '',          // 例如 'corner.tsung'（不用加 @）
  hashtag: '#CornerTsungWedding',
};
