-- 婚禮祝福牆：在 Supabase「SQL Editor」整段貼上執行一次即可。

-- 1. 祝福資料表
create table if not exists public.entries (
  id          uuid primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 20),
  message     text check (char_length(message) <= 60),
  kind        text not null check (kind in ('video', 'photo')),
  mime        text,
  size        integer check (size <= 25 * 1024 * 1024),
  path        text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  approved_at timestamptz
);

alter table public.entries enable row level security;

-- 賓客（未登入）：只能新增「待審」的祝福
create policy "guests add pending" on public.entries
  for insert to anon with check (status = 'pending' and approved_at is null);

-- 賓客與大螢幕：只看得到已通過的
create policy "public sees approved" on public.entries
  for select to anon using (status = 'approved');

-- 審核人員（登入）：看全部、改狀態
create policy "staff read all" on public.entries
  for select to authenticated using (true);
create policy "staff update" on public.entries
  for update to authenticated using (true) with check (true);

-- 即時通知
alter publication supabase_realtime add table public.entries;

-- 2. 檔案空間（公開讀取，單檔 25MB，只收影片和照片；網頁上限 20MB，留一點餘裕）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 26214400,
        array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "guests upload media" on storage.objects
  for insert to anon with check (bucket_id = 'media');
