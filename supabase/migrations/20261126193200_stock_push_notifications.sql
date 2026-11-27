alter table public.business_popup_settings
  add column if not exists notify_stock_alerts boolean not null default false;
