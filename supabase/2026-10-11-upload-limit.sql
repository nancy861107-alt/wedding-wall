-- 已經建好的 Supabase 專案：在「SQL Editor」整段貼上執行一次，把單檔上限從 50MB 降到 25MB。
-- 網頁本身限制 20MB；這裡是伺服器端的最後一道關，避免有人繞過網頁直接上傳大檔塞滿 1GB 免費空間。

update storage.buckets set file_size_limit = 26214400 where id = 'media';

alter table public.entries drop constraint if exists entries_size_check;
alter table public.entries add constraint entries_size_check check (size <= 25 * 1024 * 1024);
