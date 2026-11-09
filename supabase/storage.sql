-- Buckets.
--
-- Team crests are public: they are rendered on match cards for every visitor.
insert into storage.buckets (id, name, public)
values ('team-crests', 'team-crests', true)
on conflict (id) do nothing;
