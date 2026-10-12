-- Supports hard-deleting a case from the app (3-dot menu on Home, and the
-- case edit screen). Every other child table already cascades or SET NULLs
-- on cases.id (case_participants/hearings/meetings/tasks/documents =
-- CASCADE, communications = SET NULL, left as-is — not in scope here).
-- transactions.case_id was SET NULL, which would silently orphan a case's
-- financial records instead of deleting them with it, so it's switched to
-- CASCADE. `cases` itself had no DELETE policy at all, so a delete would
-- otherwise be blocked by RLS regardless of the FK change.

alter table public.transactions
  drop constraint transactions_case_id_fkey,
  add constraint transactions_case_id_fkey
    foreign key (case_id) references public.cases (id) on delete cascade;

create policy "advocate can delete own cases"
  on public.cases for delete
  using (auth.uid() = advocate_id);
