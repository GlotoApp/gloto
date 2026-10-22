alter table public.profiles
  add column if not exists color_mode text not null default 'dark'
  check (color_mode in ('dark', 'light'));
