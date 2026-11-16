# Personal Data Breach Response

What to do, in order, when personal data in LexxBridge may have been exposed, altered, lost or
made unavailable. Written for whoever is on call — today, the app owner. Read it once now, not
for the first time during an incident.

**Legal basis:** DPDP Act 2023 §8(5)–(6), DPDP Rules 2025 (Rule 7), CERT-In Directions (28 April
2022). Penalties for failing to notify go up to ₹200 crore (Act, Schedule item 2). The deadlines
below are as understood when this was written. **Re-check the current Rules and the Board's and
CERT-In's own guidance at the start of every incident** — they may have changed.

## 1. Is it a breach?

A "personal data breach" (Act §2(u)) is *any* unauthorised processing, or accidental disclosure,
acquisition, sharing, use, alteration, destruction **or loss of access** to personal data that
compromises its confidentiality, integrity or availability. Treat all of these as breaches:

- Someone reads data they shouldn't (a leaked key, an RLS policy bug, a compromised account).
- Data is changed or deleted without authorisation.
- Data is lost or unavailable (deleted bucket, unrecoverable database).
- An email, export or statement goes to the wrong person.

When in doubt, **start this procedure** and close it later if it turns out not to be one. The
clock starts when you *become aware*, not when you're sure.

## 2. Deadlines at a glance

| When | What | To whom |
|---|---|---|
| Immediately | Record the incident (§4 SQL) — this timestamp starts every clock | Internal register |
| Within **6 hours** of noticing | Report the cyber incident | CERT-In — `incident@cert-in.org.in` |
| **Without delay** | Initial intimation: what happened, extent, timing, location, likely impact | Data Protection Board of India |
| **Without delay** | Notice to every affected user (content in §6) | Each affected user, in-app + email |
| Within **72 hours** of becoming aware | Detailed report (content in §7) | Data Protection Board of India |
| Without undue delay | Notice to advocates whose **client** data was affected (Terms §3) | Those advocates |

## 3. Contain (first hours)

Stop the leak before investigating it. Pick what applies:

- **Leaked secret or key** — rotate it:
  - Supabase keys / JWT signing key: Dashboard → Project Settings → API Keys / JWT Keys. Rotating
    the JWT key signs **every** user out. After rotating the anon/publishable key, update
    `EXPO_PUBLIC_SUPABASE_ANON_KEY` in Vercel and ship a new app build.
  - Edge Function secrets (`RESEND_API_KEY`, `INTERNAL_FUNCTION_SECRET`,
    `SUPABASE_SERVICE_ROLE_KEY`): Dashboard → Edge Functions → Secrets. Rotate the Resend key in
    Resend first, then here. If `INTERNAL_FUNCTION_SECRET` changes, update its Vault copy too
    (it's read via `vault.decrypted_secrets` by the push trigger).
- **Compromised user account** — ban it (Dashboard → Authentication → Users → user → Ban), then
  end its sessions:
  ```sql
  delete from auth.sessions where user_id = '<user uuid>';
  ```
  Existing access tokens stay valid until they expire (up to 1 hour) unless you also rotate the
  JWT key.
- **Bad code or RLS policy** — roll back: Vercel → Deployments → previous → Promote; for a
  database policy, apply a new migration that fixes it (never edit an old one).
- **Ongoing attack** — Dashboard → Project Settings → General → Pause project. The app goes down
  for everyone; use it only if the leak can't be stopped any other way.
- **Export the logs now.** Supabase keeps API/Auth/Edge logs for a short time (as little as one
  day on the Free plan). Dashboard → Logs → export the relevant window before it rolls off.
  `public.audit_logs` is kept 13 months.

## 4. Record it (SQL editor)

Do this first, even before you know much — fill in the rest as you learn it.

```sql
insert into public.data_breach_incidents (became_aware_at, summary)
values (now(), 'One line: what you know so far')
returning id, reference;
```

Keep it current as you go:

```sql
update public.data_breach_incidents set
  occurred_at = '<timestamp, if known>',
  data_categories = '{profile, client_data}',  -- profile, client_data, documents, financial, messages_ciphertext, key_backups, contact_info
  affected_user_count = 0,
  cause = '...',
  containment_actions = '...',
  status = 'contained'
where reference = 'B-...';
```

## 5. Assess

Work out **whose** data and **what** data. Useful starting points:

- `public.audit_logs` — who did what, when.
- Supabase Logs (exported in §3) — API requests by IP, user and time.
- Storage → the bucket in question → object list.

Things specific to LexxBridge that change the impact:

- **Chat messages are end-to-end encrypted.** Leaked `messages` rows expose who talked to whom and
  when, but not content, unless a device's private key also leaked.
- **Message key backups** (`messaging_key_backups`) are protected by the user's passphrase. If
  they leak, tell those users to set a new backup passphrase. A weak passphrase can be guessed
  offline.
- **Client data**: advocates are the Data Fiduciary for their clients' data (Terms §3), and
  LexxBridge is their processor. Tell affected advocates so they can meet their own duty to their
  clients.

Build the affected-user list as a query you can reuse:

```sql
-- Example: everyone who owns a row in the affected table. Adjust to the incident.
select distinct advocate_id as user_id from public.clients where <condition>;
```

## 6. Notify affected users

The notice must cover (Rule 7(1)), in clear and plain language:

1. What happened: nature, extent, and when and where it happened.
2. What it may mean for them (the relevant consequences).
3. What we've done and are doing to reduce the risk.
4. What they can do to protect themselves.
5. Who to contact: the Grievance Officer (`deepomeshcreation@gmail.com`).

**Template.** Adapt it to the incident; don't send it as-is.

> **Subject: Important: a security incident affecting your LexxBridge account**
>
> On [date], we discovered that [what happened, in one or two plain sentences]. It affected
> [which data — e.g. "the names and phone numbers of clients you'd added"] between [start] and
> [end]. [What it did NOT affect — e.g. "Your password and chat messages were not affected."]
>
> This could mean [likely consequence — e.g. "someone may contact your clients pretending to be
> you"].
>
> We have [containment and remediation actions taken].
>
> To protect yourself, we recommend: [steps — change your password, watch for suspicious messages,
> set a new message-backup passphrase, inform your clients].
>
> If you have any questions, reply to this email or raise a grievance in the app (Settings →
> Privacy & your rights → Privacy grievance), quoting reference [B-...]. Our Grievance Officer can
> be reached at deepomeshcreation@gmail.com.

The app's language choice is stored only on each device, so the server can't tell who reads
Hindi or Marathi. Either include all three versions (English, then हिन्दी, then मराठी) in each
notice, or use the languages advocates list on their profile (`advocate_profiles.languages`) as a
guide.

**In-app and push** (one step; the existing trigger sends the push automatically). Keep the
title short. The body shows in full in the app's Notifications screen.

```sql
with affected as (
  select p.id from public.advocate_profiles p
  where p.id in (/* the affected-user query from §5 */)
),
sent as (
  insert into public.notifications (recipient_id, type, title, body)
  select id, 'security_notice',
         'Important: security incident on your account',
         'Full notice text here (sections 1–5 above).'
  from affected
  returning recipient_id
)
insert into public.data_breach_notifications (incident_id, user_id, channel)
select (select id from public.data_breach_incidents where reference = 'B-...'), recipient_id, 'in_app_push'
from sent;
```

**Email.** Get the addresses, then send the notice from Resend (Broadcasts, or one email per
person). Never put all affected users in To/CC together.

```sql
select u.id, u.email from auth.users u where u.id in (/* affected-user query */);
```

After sending, record it:

```sql
insert into public.data_breach_notifications (incident_id, user_id, channel)
select (select id from public.data_breach_incidents where reference = 'B-...'), u.id, 'email'
from auth.users u where u.id in (/* affected-user query */);

update public.data_breach_incidents set users_notified_at = now() where reference = 'B-...';
```

## 7. Notify the Data Protection Board of India

File through the Board's online platform (look up the current submission route on the Board's
official website at the time).

**Initial intimation, without delay:** a description of the breach, including its nature, extent,
timing and location, and its likely impact.

**Detailed report, within 72 hours of becoming aware** (or a longer period if the Board allows on
request):

1. Updated facts: the events, circumstances and reasons leading to the breach.
2. Measures taken or proposed to mitigate the risk.
3. Any findings about the person who caused it.
4. Remedial measures taken to prevent it from happening again.
5. A report on the notices given to affected users. Pull the counts from
   `data_breach_notifications`.

Record each filing:

```sql
update public.data_breach_incidents set board_intimated_at = now() where reference = 'B-...';
update public.data_breach_incidents set board_report_submitted_at = now() where reference = 'B-...';
```

## 8. Report to CERT-In (within 6 hours)

Email `incident@cert-in.org.in` using CERT-In's incident reporting form (on cert-in.org.in).
Include what you know at that point; you can follow up with more. Then:

```sql
update public.data_breach_incidents set cert_in_reported_at = now() where reference = 'B-...';
```

## 9. Close out

- Fix the root cause in code, with a test or migration that prevents it recurring.
- Write down what happened and what changed (`remedial_actions`, `notes`), then
  `status = 'closed', closed_at = now()`.
- Answer every grievance that references the incident within 90 days (Privacy Policy §11).
- Keep the incident and notification records. They're your evidence if the Board inquires.

## 10. Practise

Once a year, run a tabletop drill. Pick a scenario (e.g. "the service-role key was committed to
GitHub"), walk through §3–§8 with a test incident row and **no real notifications**, then delete
the test row. Fix anything in this document that turned out to be wrong or unclear.

---

Related: [`DATA_SECURITY.md`](DATA_SECURITY.md) (what data exists and where),
[`SECURITY.md`](SECURITY.md), [`THREAT_MODEL.md`](THREAT_MODEL.md).
