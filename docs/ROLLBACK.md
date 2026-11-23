# Rollback Plan

What to do when a release breaks something. Work through it in order — most incidents only need
step 2.

## 1. Find what broke

| Symptom | Likely layer | Go to |
|---|---|---|
| Web app blank, erroring, or behaving wrongly since the last push | Web build (Vercel) | §2 |
| Everything fails, web and phone alike; `/api/health` shows `database` or `auth` down | Supabase | §6 |
| A feature fails with "Something went wrong" right after running a migration | Database change | §4 |
| Push notifications, feedback emails or account emails stopped | Edge Function | §5 |
| Sign-in, reset emails or redirects broke after a dashboard change | Configuration | §6 |
| Only the phone app is affected | Mobile release | §3 |

Check `https://lexxbridge.app/api/health` first: it reports whether Supabase's login service and
database are answering, and which commit the web app is running (`version`).

## 2. Web app (Vercel) — instant, no rebuild

Every production deploy is kept, so switching back takes seconds:

1. Vercel dashboard → **lexxbridge** → **Deployments**.
2. Find the last deployment that worked (each shows its commit message).
3. **⋯ → Instant Rollback** → confirm.
4. Check the site and `/api/health` (its `version` should now show the older commit).

After an instant rollback, Vercel stops putting new pushes live automatically until you undo it —
that's deliberate, so a follow-up push doesn't re-break production. Once the fix is ready:

- fix forward and push, or revert the bad commit: `git revert <sha>` then `git push`;
- then on the new deployment, **⋯ → Promote** (this also turns auto-deploys back on).

## 3. Phone app

- **Now (testing in Expo Go):** the phone loads the JavaScript from the dev server, so step 2's
  `git revert` plus restarting `npx expo start` is the rollback.
- **After store release:** a store build can't be un-released — only replaced. Before launch,
  set up EAS Update (`expo-updates`, not installed yet) so JavaScript fixes and rollbacks can ship
  without store review (`eas update:rollback`). For a bad native build, halt the staged rollout in
  Play Console / App Store Connect and ship a new build with a higher version number.

## 4. Database migrations — forward-only

Never edit or "un-run" a past migration file (see [`RULES.md`](RULES.md)). To undo one, run the
reverse SQL in the Supabase SQL editor, and commit it as a new migration so the files keep matching
the live database.

**Before applying any migration, write its undo SQL first.** Structural changes (new tables,
triggers, policies) undo cleanly. Anything that deletes or rewrites data can't be undone by SQL —
only by restoring a backup, so take a manual backup first (§6).

Undo SQL for the recent migrations:

```sql
-- 0085 rate limits (removes only the new limits; 0055/0056 stay)
drop trigger if exists posts_rate_limit on public.posts;
drop trigger if exists comments_rate_limit on public.comments;
drop trigger if exists reports_rate_limit on public.reports;
drop trigger if exists data_grievances_rate_limit on public.data_grievances;
drop trigger if exists clients_rate_limit on public.clients;
drop trigger if exists cases_rate_limit on public.cases;
drop trigger if exists documents_rate_limit on public.documents;
drop function if exists public.enforce_insert_rate_limit();

-- 0084 chat pins (users lose their pins; nothing else)
drop table if exists public.conversation_pins;

-- 0083 chat clears (deleted chats reappear in people's lists)
drop table if exists public.conversation_clears;
drop function if exists public.trg_conversation_clears_now();
```

The app is written to cope: chat pins and clears fail open (lists still load without them).

## 5. Edge Functions

Redeploy the last good version from git:

```sh
git checkout <good-sha> -- supabase/functions/<name>
supabase functions deploy <name>
git checkout HEAD -- supabase/functions/<name>   # back to current files afterwards
```

## 6. Supabase itself, settings, and data

- **Supabase outage** (status page: https://status.supabase.com): nothing to roll back — wait it out
  and post a notice to users if it lasts.
- **Dashboard settings** (Auth URL Configuration, email templates, SMTP, Vercel environment
  variables): none of these have version history. Copy the old value into the change's commit
  message or a note *before* editing, so it can be pasted back.
- **Lost or corrupted data**: restore from a backup. On the Free plan there are no automatic
  backups — only manual ones (Dashboard → Database → Backups, or `pg_dump`); see
  [`DEPLOYMENT.md`](DEPLOYMENT.md) §5. A restore replaces the whole database, so anything written
  after the backup is lost.

## 7. Afterwards

1. Confirm `/api/health` returns `"status":"ok"`, then sign in and try the broken flow.
2. If personal data was exposed, follow [`BREACH_RESPONSE.md`](BREACH_RESPONSE.md) — it has legal
   deadlines.
3. Write down what broke, why, and what would have caught it earlier.
