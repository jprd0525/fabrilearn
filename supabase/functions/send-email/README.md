# `send-email` — deploy & wire

The Edge Function `chainServices.sendEmail` calls when you're ready to send for real. Provider-agnostic; the app's mocks stay in place until you deploy it.

## Deploy
```bash
supabase functions deploy send-email
supabase secrets set EMAIL_PROVIDER=resend
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set EMAIL_FROM="ForensiLearn <no-reply@yourlab.ca>"
```
(`SUPABASE_URL` / `SUPABASE_ANON_KEY` are injected automatically.)

## Wire it on (one line)
In `supabase-adapter.js`, uncomment the `sendEmail` line on `chainApi`:
```js
sendEmail: (payload) => supabase.functions.invoke("send-email", { body: payload }),
```
`chainServices.sendEmail` already prefers `chainApi.sendEmail` when present and falls back to the in-memory mock otherwise — so nothing else changes. The app keeps recording its own `comms` audit entry; this function does the actual delivery.

## What it does / doesn't trust
- **Input from the client:** only `{ channel, kind, eventId | contestId }`. Never recipients or copy.
- **Resolved server-side:** the event/contest title, the recipient list, and the rendered subject/body.
- **Auth:** the caller's JWT is forwarded, so DB reads are RLS-scoped to their tenant; sends are refused unless the caller is `manager`/`admin`.

## The one plug point
`lookupEmails()` is where person → email comes from. The demo mocks roster emails (`pEmail(name)`), so the default reads a `profiles` doc shaped `{ people: [{ id, email, name }] }`. Point it at your real identity source (auth users / a profiles table) when that exists.

## Swapping providers (incl. a GC mail relay)
Add a `Provider` implementation next to `resendProvider()` (an `smtp` case is stubbed) and set `EMAIL_PROVIDER`. For a government deployment that must route through a departmental relay, that's the only change — same payload, same templates, same auth.
