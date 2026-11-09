-- The operator can freeze a player. A frozen account cannot log in, bet,
-- cash out, deposit or withdraw until it is unfrozen. The balance is kept.
alter table users add column if not exists frozen boolean not null default false;
