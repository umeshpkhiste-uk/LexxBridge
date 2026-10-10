-- case_financial_summary.total_pending previously ignored expenses, so the
-- home-page case cards and client-dues list (which read straight from this
-- view) disagreed with the Financials/Ledger tab and client statements,
-- which fold expenses into "pending" (see feeTotals.ts's doc comment).
-- Bring the view in line: a case's own expenses are now added to its
-- pending balance (and to total_fees, so total_fees = total_received +
-- total_pending still holds), and client_financial_summary now also counts
-- expenses that aren't tied to any case.
create or replace view public.case_financial_summary
with (security_invoker = true) as
with sums as (
  select
    case_id,
    coalesce(sum(amount) filter (where type = 'income' and status = 'completed'), 0) as received,
    coalesce(sum(amount) filter (where type = 'income' and status = 'pending'), 0) as pending_entries,
    coalesce(sum(amount) filter (where type = 'expense'), 0) as expenses
  from public.transactions
  where case_id is not null
  group by case_id
)
select
  c.id as case_id,
  coalesce(s.received, 0) as total_received,
  case
    when c.agreed_fee is not null then greatest(c.agreed_fee - coalesce(s.received, 0), 0)
    else coalesce(s.pending_entries, 0)
  end + coalesce(s.expenses, 0) as total_pending,
  coalesce(s.expenses, 0) as total_expenses,
  coalesce(s.received, 0) - coalesce(s.expenses, 0) as net_amount,
  coalesce(c.agreed_fee, coalesce(s.received, 0) + coalesce(s.pending_entries, 0)) + coalesce(s.expenses, 0) as total_fees
from public.cases c
left join sums s on s.case_id = c.id
where c.agreed_fee is not null or s.case_id is not null;

create or replace view public.client_financial_summary
with (security_invoker = true) as
with by_client as (
  select
    client_id,
    coalesce(sum(amount) filter (where type = 'income' and status = 'completed'), 0) as received,
    coalesce(sum(amount) filter (where type = 'expense'), 0) as expenses,
    -- Pending entries and expenses not tied to one of the client's cases.
    coalesce(sum(amount) filter (where type = 'income' and status = 'pending' and case_id is null), 0) as loose_pending,
    coalesce(sum(amount) filter (where type = 'expense' and case_id is null), 0) as loose_expenses
  from public.transactions
  where client_id is not null
  group by client_id
),
case_due as (
  select c.client_id, sum(f.total_pending) as pending
  from public.case_financial_summary f
  join public.cases c on c.id = f.case_id
  group by c.client_id
)
select
  coalesce(b.client_id, d.client_id) as client_id,
  coalesce(b.received, 0) as total_received,
  coalesce(d.pending, 0) + coalesce(b.loose_pending, 0) + coalesce(b.loose_expenses, 0) as outstanding_amount,
  coalesce(b.expenses, 0) as total_expenses
from by_client b
full join case_due d on d.client_id = b.client_id;
