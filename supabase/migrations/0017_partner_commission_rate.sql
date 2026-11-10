-- Per-partner commission rate, set by the operator from the admin "Commission %"
-- page. Stored as a fraction (0.75 = 75%). Null means the default (70%).
alter table sub_admins add column if not exists commission_rate numeric(5,4);

alter table sub_admins drop constraint if exists sub_admins_commission_rate_chk;
alter table sub_admins
  add constraint sub_admins_commission_rate_chk
  check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1));
