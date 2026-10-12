-- Reverses most of 0043: the "Organization details" section was removed
-- from the organization tab of the client form. contact_person_name moved
-- up next to the organization name field and stays; the other three
-- fields are no longer written or read anywhere in the app.
alter table public.clients
  drop column contact_person_designation,
  drop column gstin,
  drop column registration_number;
