-- The advocate's own UPI ID (VPA), used to build a "pay now" UPI deep link
-- on payment reminders and statements. Optional, private — covered by the
-- existing advocate_profiles RLS policies (no new policy needed).
alter table public.advocate_profiles
  add column upi_id text;
