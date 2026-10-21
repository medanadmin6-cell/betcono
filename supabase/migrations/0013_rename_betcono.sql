-- The site is BetCono now. Same two places the name reaches the database as
-- the last rename: the house league custom matches are filed under, and the
-- account name shown on the manual deposit screen. Both are carried over here
-- so a running deployment says the new name without anyone editing a row by
-- hand.

alter table custom_matches alter column league set default 'BetCono Special';

update custom_matches set league = 'BetCono Special' where league = 'Stakeza Special';

update app_settings
   set value = 'BetCono Ghana', updated_at = now()
 where key = 'deposit_account_name' and value = 'Stakeza Ghana';
