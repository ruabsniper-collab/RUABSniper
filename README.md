# RU Course Sniper

A personal Rutgers registration helper: search the Schedule of Classes by name/subject/core code, see
best-effort RateMyProfessors ratings and filter by them, filter out sections that conflict with a schedule
you already have, get a push notification the moment a full section opens a seat, and jump straight into
WebReg with the index number already filled in.

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

### 2. GitHub Actions secrets — the always-on poller

In this repo's GitHub Settings → Secrets and variables → Actions, add:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

That's it — [`poll-and-notify.yml`](.github/workflows/poll-and-notify.yml) runs every 5 minutes,
[`ingest-courses.yml`](.github/workflows/ingest-courses.yml) every 6 hours, and
[`match-professors.yml`](.github/workflows/match-professors.yml) nightly, all for free on GitHub's
scheduled Actions minutes.

### 3. Apple Developer Program — $99/year, unavoidable

Needed for real push notifications past a few days of testing and for installing the app on your phone
long-term / TestFlight. Enroll at [developer.apple.com](https://developer.apple.com/programs/). EAS (below)
manages the actual signing certificates for you once you're enrolled — you don't need to touch Xcode.

### 4. Expo/EAS account (free) — builds the iOS app without a Mac

1. `npx expo login` (or sign up at expo.dev) from inside `mobile/`.
2. `npx eas build:configure` — this will replace the placeholder `bundleIdentifier` in
   [`app.json`](mobile/app.json) with one tied to your Apple account.
3. `npx eas build --platform ios` to produce a real installable build in the cloud.

## Running it day-to-day

```bash
cd backend && npm install       # once
cd mobile && npm install        # once

cd mobile && npx expo start     # scan the QR code with your iPhone camera — no Xcode needed
```

Backend scripts can also be run by hand while developing (they need `backend/.env` filled in):

```bash
cd backend
npm run ingest-courses      # pull the current SOC catalog into Supabase
npm run match-professors    # fuzzy-match instructors against RateMyProfessors
npm run poll-and-notify     # check watched sections and push notify on openings
```

## Known limitations (see the plan for why)

- **Notification latency**: GitHub Actions' cron floor is 5 minutes and can slip further under load — this
  is "notify me it opened," not sub-minute sniping.
- **RateMyProfessors matching is best-effort**: no official API exists; matches carry a confidence score
  and low-confidence ones are labeled "unrated" rather than guessed at.
- **WebReg index auto-fill is best-effort**: WebReg's page isn't documented and this project has never been
  able to inspect its authenticated DOM directly. If the auto-fill doesn't find the box, the Register screen
  falls back to a one-tap "copy index" button.
