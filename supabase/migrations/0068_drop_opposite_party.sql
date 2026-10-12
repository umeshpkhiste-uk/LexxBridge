-- Reverses the opposite_party column added in 0004: the "Opposite party"
-- field was removed from the case create/edit screens, the case detail
-- view, the case list card, and the client payment-statement export, so
-- it's no longer written or read anywhere in the app.
alter table public.cases
  drop column opposite_party;
