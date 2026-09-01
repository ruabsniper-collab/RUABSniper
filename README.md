# RU Course Sniper

A personal Rutgers registration helper: search the Schedule of Classes by name/subject/core code, see
best-effort RateMyProfessors ratings and filter by them, filter out sections that conflict with a schedule
you already have (added by hand or imported from a screenshot), get emailed the moment a full section opens
a seat, and jump straight into WebReg with the index number already filled in.

**No paid Apple account anywhere.** Real APNs push notifications and EAS/App Store builds both require the
$99/yr Apple Developer Program, so this project avoids both: notifications go out by email instead (your
phone's Mail app still gives you a real push alert for the email itself), and the app is distributed as an
unsigned `.ipa` you sideload with [SideStore](https://sidestore.io) using your own free Apple ID.

**Not included, on purpose:** full NetID auto-registration. No Rutgers password ever touches this app or
its backend — see [`RegisterScreen`](mobile/src/screens/RegisterScreen.tsx), which opens the real WebReg
site in an in-app browser and lets you log in yourself.

Full design rationale lives in the plan this was built from (ask if you want it re-shown).

## Layout

```
mobile/    Expo (React Native) iOS app
backend/   Node/TypeScript scripts: SOC ingest, RMP matching, the open-seat poller
.github/workflows/  Scheduled GitHub Actions that run the backend scripts for free
```

## One-time setup you need to do (I can't do these for you)

### 1. Supabase (free) — the database

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run [`backend/supabase/migrations/0001_init.sql`](backend/supabase/migrations/0001_init.sql).
3. From **Project Settings → API**, grab:
   - `Project URL`
   - `anon` `public` key → put in `mobile/.env` (copy from `mobile/.env.example`)
   - `service_role` key → put in `backend/.env` (copy from `backend/.env.example`) — **never** put this one
     in the mobile app.

### 2. Resend (free) — the notification email

1. Sign up at [resend.com](https://resend.com) — no credit card. Use the email address you actually want
   notifications sent to (on the free tier, without verifying a custom domain, Resend can only send to the
   address your account is registered under — which is exactly what we want here).
2. Grab an API key from the dashboard.

### 3. OCR.space (free) — screenshot schedule import

1. Sign up for a free key at [ocr.space/ocrapi/freekey](https://ocr.space/ocrapi/freekey) — no credit card,
   25k requests/month.
2. Put it in `mobile/.env` as `EXPO_PUBLIC_OCR_SPACE_API_KEY` (copy from `mobile/.env.example`).

This only powers the "Import from screenshot" option on the My Schedule tab — skip it and that one button
shows an error, everything else in the app still works. Manually adding your existing classes (the other
option on that tab) needs no setup at all.

### 4. GitHub Actions secrets — the always-on poller

In this repo's GitHub Settings → Secrets and variables → Actions, add:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `NOTIFY_EMAIL_TO` (the same address your Resend account is registered under)

That's it — [`poll-and-notify.yml`](.github/workflows/poll-and-notify.yml) runs every 5 minutes,
[`ingest-courses.yml`](.github/workflows/ingest-courses.yml) every 6 hours, and
[`match-professors.yml`](.github/workflows/match-professors.yml) nightly, all for free on GitHub's
scheduled Actions minutes.

### 5. Installing the app on your iPhone — SideStore, no Apple account cost

1. Set up [SideStore](https://docs.sidestore.io) on your iPhone (one-time pairing with a computer — any OS
   works for this part, it doesn't need to be a Mac).
2. In this repo's GitHub Actions tab, manually run the **"Build unsigned iOS IPA (for SideStore)"** workflow
   ([`build-ipa.yml`](.github/workflows/build-ipa.yml)). It builds on GitHub's free macOS runner with code
   signing turned off and uploads `RUCourseSniper-unsigned.ipa` as a workflow artifact.
3. Download that artifact, open it in SideStore, and install. SideStore signs it with your own free Apple ID
   and re-signs it automatically in the background every 7 days — no computer needed after the first pairing.

This is the one part of the project I couldn't test myself (no Mac/Xcode here to run an actual Xcode
archive), so it's the most likely thing to need a debugging pass — if the workflow fails, paste me the
Actions log and I'll fix it.

## Running it day-to-day

```bash
cd backend && npm install       # once
cd mobile && npm install        # once

cd mobile && npx expo start     # scan the QR code with your iPhone camera — no Xcode needed
```

`expo start` (Expo Go) is the fast loop for day-to-day iteration. It's not the same install as the SideStore
`.ipa` — use Expo Go while you're actively changing things, and re-run the `build-ipa.yml` workflow when you
want a real standalone install to hand off or keep long-term.

Backend scripts can also be run by hand while developing (they need `backend/.env` filled in):

```bash
cd backend
npm run ingest-courses      # pull the current SOC catalog into Supabase
npm run match-professors    # fuzzy-match instructors against RateMyProfessors
npm run poll-and-notify     # check watched sections and email on openings
```

## Known limitations (see the plan for why)

- **No real push notifications**: that needs the paid Apple Developer Program, so this uses email instead
  (see [`backend/lib/resendEmail.ts`](backend/lib/resendEmail.ts)). Your phone still gets a real lock-screen
  alert via Mail's own push — it's just routed through email rather than Apple's push service directly.
- **Notification latency**: GitHub Actions' cron floor is 5 minutes and can slip further under load — this
  is "notify me it opened," not sub-minute sniping.
- **RateMyProfessors matching is best-effort**: no official API exists; matches carry a confidence score
  and low-confidence ones are labeled "unrated" rather than guessed at.
- **Screenshot schedule import is best-effort**: [`scheduleOcr.ts`](mobile/src/lib/scheduleOcr.ts) OCRs the
  image and pattern-matches "day + time" text, but every guess (label, day, start/end) shows up as an
  editable row — see [`ScreenshotImport.tsx`](mobile/src/components/ScreenshotImport.tsx) — so nothing gets
  saved to My Schedule without a look first. If nothing gets recognized, add the class manually instead.
- **WebReg index auto-fill is best-effort**: WebReg's page isn't documented and this project has never been
  able to inspect its authenticated DOM directly. If the auto-fill doesn't find the box, the Register screen
  falls back to a one-tap "copy index" button.
- **The unsigned-IPA build workflow is unverified**: I have no Mac/Xcode to test an actual Xcode archive
  run, so [`build-ipa.yml`](.github/workflows/build-ipa.yml) follows the standard documented recipe but
  hasn't been run end-to-end. Everything else in this repo was checked against live data.
- **Sideloaded apps need periodic re-signing**: a free Apple ID's signature expires every 7 days; SideStore
  automates the refresh, but it needs to run in the background occasionally to do it.
