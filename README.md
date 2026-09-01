# RU Course Sniper

A Rutgers registration helper, built to share: search the Schedule of Classes by name/subject/core code,
see best-effort RateMyProfessors ratings, filter and sort by them (or hide unrated professors entirely),
filter by campus/online/asynchronous, filter out sections that conflict with a schedule you already have
(added by hand or imported from a screenshot), get a real push notification the moment a full section
opens a seat, and jump straight into WebReg with the index number ready to paste in.

**A web app (PWA), not a native app — deliberately.** A real iOS app normally needs the $99/yr Apple
Developer Program (for push notifications and App Store/TestFlight distribution), which this project
avoids by not being a native app at all: it's a website you can "Add to Home Screen," using the standard
**Web Push API** for real notifications at zero cost. No signing, no sideloading, no re-signing every 7
days — just a URL, which is also what makes this easy to actually hand to friends.

**Not included, on purpose:** full NetID auto-registration. No Rutgers password ever touches this app or
its backend — see [`RegisterPage`](web/src/pages/RegisterPage.tsx), which sends you to the real WebReg
site in its own tab and lets you log in yourself.

Full design rationale lives in the plan this was built from (ask if you want it re-shown).

## Layout

```
web/       Vite + React (TypeScript) PWA — the frontend
backend/   Node/TypeScript scripts: SOC ingest, RMP matching, the open-seat poller
.github/workflows/  Scheduled GitHub Actions that run the backend scripts for free
```

## One-time setup you need to do (I can't do these for you)

### 1. Supabase (free) — the database

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run both files in [`backend/supabase/migrations/`](backend/supabase/migrations/),
   in order (`0001_init.sql`, then `0002_push_subscriptions.sql`).
3. From **Project Settings → API**, grab:
   - `Project URL`
   - `anon` `public` key → put in `web/.env` (copy from `web/.env.example`)
   - `service_role` key → put in `backend/.env` (copy from `backend/.env.example`) — **never** put this
     one in the web app.

### 2. Web Push (free) — real notifications, no account needed

1. Run `npx web-push generate-vapid-keys` (needs Node, no install required — `npx` fetches it
   temporarily). It prints a public and private key.
2. Public key → `web/.env` as `VITE_VAPID_PUBLIC_KEY`.
3. Both keys, plus a `VAPID_SUBJECT` (a `mailto:you@example.com` address — required by the spec, only
   used if a push service needs to contact you) → `backend/.env` (copy from `backend/.env.example`).

### 3. OCR.space (free) — screenshot schedule import

1. Sign up for a free key at [ocr.space/ocrapi/freekey](https://ocr.space/ocrapi/freekey) — no credit card,
   25k requests/month.
2. Put it in `web/.env` as `VITE_OCR_SPACE_API_KEY` (copy from `web/.env.example`).

This only powers the "Import from screenshot" option on the My Schedule tab — skip it and that one button
shows an error, everything else in the app still works. Manually adding your existing classes (the other
option on that tab) needs no setup at all.

### 4. GitHub Actions secrets — the always-on poller

In this repo's GitHub Settings → Secrets and variables → Actions, add:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

That's it — [`poll-and-notify.yml`](.github/workflows/poll-and-notify.yml) runs every 5 minutes,
[`ingest-courses.yml`](.github/workflows/ingest-courses.yml) every 6 hours, and
[`match-professors.yml`](.github/workflows/match-professors.yml) nightly, all for free on GitHub's
scheduled Actions minutes.

### 5. Putting it online for friends to use — any free static host

`web/` is a plain static site once built (`npm run build` → a `dist/` folder), so any free static host
works — [Vercel](https://vercel.com), [Cloudflare Pages](https://pages.cloudflare.com), and
[Netlify](https://www.netlify.com) all have a "connect a GitHub repo, deploy on push" free tier. Point it
at the `web/` directory as the project root, build command `npm run build`, output directory `dist`, and
add the same `VITE_*` values from `web/.env` as that host's environment variables.

Whoever you send the resulting URL to should open it and tap **"Add to Home Screen"** (Safari's Share
sheet on iPhone, Chrome's install prompt on Android) — that's what makes push notifications work on iOS,
and it's what turns the site into something that behaves like an app icon on their phone either way.

## Running it day-to-day

```bash
cd backend && npm install       # once
cd web && npm install           # once

cd web && npm run dev           # local dev server with hot reload
```

Backend scripts can also be run by hand while developing (they need `backend/.env` filled in):

```bash
cd backend
npm run ingest-courses      # pull the current SOC catalog into Supabase
npm run match-professors    # fuzzy-match instructors against RateMyProfessors
npm run poll-and-notify     # check watched sections and push-notify on openings
```

## Known limitations (see the plan for why)

- **Notification latency**: GitHub Actions' cron floor is 5 minutes and can slip further under load — this
  is "notify me it opened," not sub-minute sniping.
- **iOS push needs "Add to Home Screen" first**: a regular Safari tab can't receive push notifications on
  iPhone (iOS 16.4+) — installing the site as a home-screen app is what enables it. Every other feature
  works the same with or without that step.
- **RateMyProfessors matching is best-effort**: no official API exists; matches carry a confidence score
  and low-confidence ones are labeled "unrated" rather than guessed at.
- **Asynchronous-online detection is inferred, not an official SOC field**: Rutgers' Schedule of Classes has
  no "synchronous"/"asynchronous" flag, so [`courses.ts`](web/src/lib/courses.ts)'s "Asynchronous" filter
  treats an online meeting with no scheduled day/time as async and one with a real day/time as synchronous —
  verified against a live SOC pull, but still a heuristic.
- **Screenshot schedule import is best-effort**: [`scheduleOcr.ts`](web/src/lib/scheduleOcr.ts) OCRs the
  image and pattern-matches "day + time" text, but every guess (label, day, start/end) shows up as an
  editable row — see [`ScreenshotImport.tsx`](web/src/components/ScreenshotImport.tsx) — so nothing gets
  saved to My Schedule without a look first. If nothing gets recognized, add the class manually instead.
- **No one-tap WebReg autofill**: the old mobile app could inject a fill script into its own in-app
  browser; a website can't do that to a separate tab it opens (browsers block cross-origin scripting).
  [`RegisterPage`](web/src/pages/RegisterPage.tsx) copies the index number to your clipboard and opens
  WebReg in a new tab instead — paste it into the quick-add box yourself.
