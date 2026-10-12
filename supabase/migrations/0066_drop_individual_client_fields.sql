-- Reverses 0044: the "Individual details" section (occupation, PAN,
-- date of birth) was removed from the new/edit client form, so these
-- columns are no longer written or read anywhere in the app.
alter table public.clients
  drop column occupation,
  drop column pan_number,
  drop column date_of_birth;
