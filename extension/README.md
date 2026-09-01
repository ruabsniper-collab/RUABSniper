# RUAB Sniper WebReg Autofill (browser extension)

A small, optional browser extension: when you tap **"Open WebReg →"** on RUAB Sniper's Register page, this
fills the course index into WebReg's own quick-add box for you automatically. It never clicks
"ADD COURSES" itself — actually registering is still a real, deliberate click you make yourself.

**Why this exists as a separate extension, not just part of the website:** a website has no way to script
a page on a different site that it opens (browsers block that, on purpose — otherwise any site could mess
with any other site you visit). A browser extension is different: you're explicitly granting it permission
to run on Rutgers' WebReg pages specifically (and nothing else — see `manifest.json`), which is what makes
this actually possible. See the design notes in `content-script.js` for exactly how it works and what was
verified live before building it.

**What it can't do, on purpose:** it never touches your NetID/password (it only ever runs after you're
already logged into WebReg yourself), never sees or stores anything about your account, and never submits
the "ADD COURSES" button on its own. It fills one text box and stops.

## Installing it (free, no Chrome Web Store account needed)

This isn't published to the Chrome Web Store (that costs a one-time developer fee and requires an ongoing
public listing to maintain) — instead, install it directly from this repo, in "developer mode." Takes
about a minute, works in Chrome, Edge, Brave, or any other Chromium-based browser.

1. Download this repo (or just the `extension/` folder) — if you don't already have it, go to
   [github.com/ruabsniper-collab/RUABSniper](https://github.com/ruabsniper-collab/RUABSniper), click the
   green **Code** button → **Download ZIP**, then unzip it somewhere you'll remember.
2. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Turn on **"Developer mode"** (a toggle, usually top-right of that page).
4. Click **"Load unpacked"**.
5. Select the `extension` folder from the unzipped download (the one containing `manifest.json`).
6. Done — you should see "RUAB Sniper WebReg Autofill" appear in your extensions list.

That's it. Nothing to configure. It only ever activates on `sims.rutgers.edu/webreg/*` pages, and only
does anything at all when you arrive there via a RUAB Sniper "Open WebReg" link.

**One thing to know:** browsers occasionally disable "developer mode" extensions after an update, or
require you to click "Keep" the first time — if autofill stops working, check your extensions page to make
sure it's still listed and enabled.
