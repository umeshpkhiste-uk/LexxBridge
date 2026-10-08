-- record_partial_payment was replayable for a partial payment: the function
-- only ever rejects a replay once the transaction's status leaves 'pending',
-- but a partial payment deliberately leaves status = 'pending' (just with a
-- reduced amount) so the remainder can still be collected later. Replaying
-- the exact same call — a captured/resent request, or just a client retry
-- after a lost response, or a double-tap — succeeds again as long as the
-- replayed amount is still <= the (now smaller) remaining amount: it
-- inserts a second "completed" ledger row for money that was only actually
-- received once, and further reduces what's recorded as still owed.
--
-- Fixed with a server-side idempotency key: the client generates one fresh
-- UUID per "record payment" submission (not per retry of that same
-- submission) and passes it through. The key's own primary-key uniqueness
-- is what makes two concurrent calls with the same key serialize correctly
-- (the second INSERT blocks on the unique index until the first transaction
-- resolves, then either sees the committed result or — if the first failed
-- validation and rolled back — is free to retry cleanly).
create table public.payment_idempotency_keys (
  idempotency_key uuid primary key,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  result_transaction_id uuid,
  created_at timestamptz not null default now()
);

alter table public.payment_idempotency_keys enable row level security;

create policy "advocate can use idempotency keys for own transactions"
  on public.payment_idempotency_keys for all
  using (exists (
    select 1 from public.transactions t
    where t.id = payment_idempotency_keys.transaction_id and t.advocate_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.transactions t
    where t.id = payment_idempotency_keys.transaction_id and t.advocate_id = (select auth.uid())
  ));

-- Stale keys are only ever useful for a short post-submission retry window;
-- nothing needs them once their transaction itself ages out of relevance.
select cron.schedule('purge-old-payment-idempotency-keys', '41 3 * * *',
  $$delete from public.payment_idempotency_keys where created_at < now() - interval '30 days';$$);

drop function public.record_partial_payment(uuid, numeric, text, text);

create function public.record_partial_payment(
  p_transaction_id uuid,
  p_amount_received numeric,
  p_payment_method text default null,
  p_receipt_path text default null,
  p_idempotency_key uuid default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_remaining numeric;
  v_result_id uuid;
begin
  if p_idempotency_key is not null then
    begin
      insert into public.payment_idempotency_keys (idempotency_key, transaction_id)
      values (p_idempotency_key, p_transaction_id);
    exception when unique_violation then
      select result_transaction_id into v_result_id
        from public.payment_idempotency_keys where idempotency_key = p_idempotency_key;
      if v_result_id is null then
        raise exception 'This payment is already being recorded — try again in a moment';
      end if;
      select * into v_transaction from public.transactions where id = v_result_id;
      return v_transaction;
    end;
  end if;

  select * into v_transaction from public.transactions where id = p_transaction_id for update;

  if v_transaction is null then
    raise exception 'Transaction not found';
  end if;

  if v_transaction.type <> 'income' or v_transaction.status <> 'pending' then
    raise exception 'Only a pending income transaction can be marked as received';
  end if;

  if p_amount_received is null or p_amount_received <= 0 or p_amount_received > v_transaction.amount then
    raise exception 'Amount received must be greater than 0 and no more than the pending amount';
  end if;

  v_remaining := v_transaction.amount - p_amount_received;

  if v_remaining = 0 then
    update public.transactions
       set status = 'completed',
           transaction_date = current_date,
           payment_method = coalesce(nullif(trim(p_payment_method), ''), payment_method),
           receipt_path = coalesce(p_receipt_path, receipt_path)
     where id = p_transaction_id;
    v_result_id := p_transaction_id;
  else
    update public.transactions set amount = v_remaining where id = p_transaction_id;

    insert into public.transactions (
      advocate_id, case_id, client_id, type, category, amount, currency, status,
      transaction_date, payment_method, reference_number, notes, receipt_path
    ) values (
      v_transaction.advocate_id, v_transaction.case_id, v_transaction.client_id, v_transaction.type,
      v_transaction.category, p_amount_received, v_transaction.currency, 'completed',
      current_date, coalesce(nullif(trim(p_payment_method), ''), v_transaction.payment_method),
      v_transaction.reference_number, v_transaction.notes, p_receipt_path
    )
    returning id into v_result_id;
  end if;

  if p_idempotency_key is not null then
    update public.payment_idempotency_keys
       set result_transaction_id = v_result_id
     where idempotency_key = p_idempotency_key;
  end if;

  select * into v_transaction from public.transactions where id = v_result_id;
  return v_transaction;
end;
$$;

revoke execute on function public.record_partial_payment(uuid, numeric, text, text, uuid) from public, anon;
grant execute on function public.record_partial_payment(uuid, numeric, text, text, uuid) to authenticated;
