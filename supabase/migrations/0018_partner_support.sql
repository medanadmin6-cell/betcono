-- A partner's own support lines, shown only to players who used their referral code.
alter table sub_admins add column if not exists support_phone text;
alter table sub_admins add column if not exists support_whatsapp text;
