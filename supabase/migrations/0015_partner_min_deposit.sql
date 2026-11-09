-- A partner can raise the minimum deposit for players who joined with their link.
-- Null means the country minimum still applies.
alter table sub_admins add column if not exists min_deposit numeric(14,2);
