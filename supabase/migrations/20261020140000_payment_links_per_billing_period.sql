drop table if exists pg_temp.billing_plan_payment_links_legacy;

create temporary table billing_plan_payment_links_legacy
as
select plan_code, payment_url
from public.billing_plan_payment_links;

alter table public.billing_plan_payment_links
  drop constraint if exists billing_plan_payment_links_pkey;

alter table public.billing_plan_payment_links
  add column if not exists period_id uuid;

alter table public.billing_plan_payment_links replica identity full;

with first_period_per_plan as (
  select distinct on (plan_code) plan_code, id
  from public.billing_plan_periods
  order by plan_code, display_order, code
)
update public.billing_plan_payment_links as links
set period_id = periods.id
from first_period_per_plan as periods
where links.plan_code = periods.plan_code
  and links.period_id is null;

delete from public.billing_plan_payment_links
where period_id is null;

insert into public.billing_plan_payment_links (plan_code, payment_url, period_id)
select legacy.plan_code, legacy.payment_url, periods.id
from billing_plan_payment_links_legacy as legacy
join public.billing_plan_periods as periods
  on periods.plan_code = legacy.plan_code
where not exists (
  select 1
  from public.billing_plan_payment_links as existing
  where existing.period_id = periods.id
);

alter table public.billing_plan_payment_links
  alter column period_id set not null;

alter table public.billing_plan_payment_links
  drop column plan_code;

alter table public.billing_plan_payment_links
  add constraint billing_plan_payment_links_pkey primary key (period_id);

alter table public.billing_plan_payment_links replica identity default;

alter table public.billing_plan_payment_links
  add constraint billing_plan_payment_links_period_id_fkey
  foreign key (period_id)
  references public.billing_plan_periods(id)
  on delete cascade;

drop table billing_plan_payment_links_legacy;
