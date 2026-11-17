alter table public.business_popup_settings
  drop constraint if exists business_popup_settings_color_check;

alter table public.business_popup_settings
  add constraint business_popup_settings_color_check
  check (
    color in ('violet', 'blue', 'emerald', 'amber', 'rose')
    or color ~ '^#[0-9A-Fa-f]{6}$'
  );
