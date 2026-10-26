# Rep Ledger

A personal, mobile-first training and nutrition log for building muscle. It tells you what to train today, records your sets, logs your food (with sourced nutrition values), tracks body weight and measurements, and builds a weekly review with rule-based suggestions that you accept or reject.

All data stays in the browser on your device (IndexedDB). There is no server and no account.

## What works

- **Setup and profile:** goal, units, body details, experience, equipment, days, session length, limitations and foods you avoid. Each answer changes something specific, and edits that would change your programme or targets are shown for review first.
- **Today:** the session for today with targets beside last time, a body-weight entry, an optional check-in, food status, and the week so far.
- **Workouts:**
  - An editable programme.
  - Logging weight, reps and optional reps in reserve, plus editing, adding and deleting sets.
  - A rest timer, exercise swaps, and resuming after a reload or with no signal.
- **Progression:** transparent rules, covering first sessions, missed weeks, weight jumps and exercise changes.
- **Food:** 40 Nigerian staples from the FAO West African table (each food cites its source), your own foods, household measures, saved meals, and days marked complete or partial.
- **Progress:** weight trend (labelled as scale weight), measurements, workout completion and lift history.
- **Weekly review:** a summary, planned versus completed sessions, lift comparisons, and nutrition averages from complete days only. It also lists missing data and conflicting signals, and makes at most 3 suggestions, each with its evidence and rule. You accept, reject or note each one, and the history is dated.
- **Your data:** JSON backup and restore, CSV exports, and delete-all.
- **Phone install and offline use:** works over HTTPS; the offline check passes.

## Set up and run

You need [Node.js](https://nodejs.org) 22 or newer (`node --version`) and Git.

```bash
git clone https://github.com/Mkay2231/Fitness-App.git
cd Fitness-App
npm install
npm run dev          # http://localhost:5173 on this computer
npm run dev:phone    # also reachable from a phone on the same Wi-Fi (no offline mode over plain http)
```

Checks before you deploy:

```bash
npm test             # 137 unit tests: rules, storage, backups, contrast
npm run typecheck
npm run build        # production build into dist/
npm run dev          # leave running, then in a second terminal:
npm run check:all    # browser checks in the Edge already on Windows (BROWSER=chrome for Chrome)
npm run preview      # serves dist/; then in a second terminal:
npm run check:offline
```

`check:all` runs four checks:
- **`check:audit`:** 360 px layout, touch targets, keyboard-only use, dialog focus, export, failed restore, delete-all.
- **`check:profile`:** setup, reloads and profile edits.
- **`check:workout`:** a full session, edits, interruption, a swap, progression and the programme editor.
- **`check:review`:** seeded records, suggestions, decisions and check-ins.

> The project is in OneDrive. OneDrive syncing `node_modules` (thousands of files) can be slow or lock files. If `npm install` misbehaves, right-click `node_modules` → *Free up space*, or move the project out of OneDrive.

## How the pieces fit

```
src/
  rules/            Pure calculation logic, no UI or database, all tested
    nutrition.ts      Starting targets and calorie adjustments
    progression.ts    Double progression, missed-session rules, estimated 1RM
    program.ts        Builds your programme from your profile
    library.ts        Exercise substitutions and programme validation
    performance.ts    Compares a lift with its previous session
    review.ts         Weekly review, gaps, conflicts, suggestions, summary
    trend.ts, units.ts, foodPrefs.ts, volume.ts, dates.ts
  db.ts             Database tables (Dexie/IndexedDB) and upgrades
  data.ts           Database ↔ rules glue, backup, CSV export, delete-all
  seed/             Built-in exercises, programme templates, foods (generated)
  screens/          One file per screen
scripts/            Food importers and the browser checks (check:*)
public/_headers     Cache and security headers for Netlify or Cloudflare Pages
```

**To change a rule** (e.g. protein per kg, or when weight goes up), edit the constant or function in `src/rules/`, update or add a test next to it, and run `npm test`. The screens only display what the rules return.

## The rules

**Starting targets.** Resting energy from Mifflin-St Jeor × an activity factor, plus a surplus for your chosen gain rate (0.25–0.5% of body weight per week, at about 7,700 kcal per kg). Protein is 1.8 g/kg, fat about 25% of calories (at least 0.6 g/kg), and carbs fill the rest.

**Calorie adjustments (weekly review).** These run only when there are at least 8 weigh-ins spread over 10+ days, and at least 10 days in the last 14 marked "complete" for food:
- If your weight trend is within ±0.1 kg/week of the goal, nothing changes.
- If your average intake is more than 200 kcal off target, the advice is to hit the target first, not to change it.
- Otherwise it suggests a change proportional to the gap, capped at ±250 kcal per review.

**Progression (each exercise, each session).** This is double progression:
- Keep the weight and add reps until every set reaches the top of the rep range, then add your smallest jump (set per equipment type in *Settings*).
- One session with a set below the range: repeat the weight. Two sessions in a row: drop about 10%.
- Bodyweight exercises progress by reps, then a harder variation.
- **First time on an exercise:** no weight is suggested. You pick one for the rep range, and later targets come from what you log.
- **Missed sessions:** if your last session of an exercise was 14+ days ago, the weight holds instead of going up. After 28+ days, it starts about 10% lighter (rounded down to your weight jump).
- **Only finished workouts count.** An unfinished session in progress doesn't affect the targets.
- **Exercise changes:** every exercise keeps its own history. A swap, or a new exercise in the programme, starts from its own record and never borrows another exercise's numbers.
- **Weight jumps:** they come from Settings, per equipment type (dumbbell, barbell, machine, cable), in kg or lb.
- **Effort (RIR) is optional:** progression uses reps against the rep range, so sets logged without reps in reserve count fully.

The rules live in `src/rules/progression.ts`, with tests in `progression.test.ts`. Each suggestion carries its reasons, shown under "Why this target".

**Missing vs zero.** A day with no food entries is *not logged* and is left out of averages. Only days you mark complete count, and "I ate nothing" is a separate, explicit action. A planned training day with no workout shows as *not logged*, not as a rest day.

## Your profile: what each answer changes

Setup asks only for what the app uses. You can edit everything in **Settings → Profile**. If an edit would change your program or targets, the app lists the changes and waits for you to accept or keep the current version.

| Answer | What it changes |
|---|---|
| Goal (lean / steady / faster gain, recomposition) | Calorie surplus and the weight trend the weekly review aims for (0.25 / 0.4 / 0.5 / 0% of body weight a week) |
| Sex, age, height, weight, activity | Starting calories (Mifflin-St Jeor) and protein. Weight is asked once; after that, weigh-ins are used |
| Experience | New: every set stops 3 reps short. A year or more: main lifts get an extra set |
| Where you train | Gym or home program |
| Training days | Which days Today shows a session, and what the review counts as planned |
| Session length (30–75 min) | Accessory exercises are dropped first, then sets come off the lift with the most, never below 2 |
| Limitations (knees, lower back, shoulders, wrists) | Swaps exercises that commonly aggravate them, and the workout says why. Not medical advice |
| Foods you don't eat | Hidden from food search (with a "Show all" option) and from meal ideas |
| Units (kg/lb, cm/in) | Every weight and length shown and typed. Data is always stored in kg and cm |

The program builder (`src/rules/program.ts`), unit conversion (`src/rules/units.ts`) and food preferences (`src/rules/foodPrefs.ts`) are pure functions with tests.

```bash
npm run dev
npm run check:profile   # second terminal: setup → reload → edit → reload, in headless Edge
```

## Storage, accounts and privacy

- **Where data lives:** everything is in this browser's IndexedDB on your device. It survives reloads, restarts and going offline, and `check:profile` and `check:offline` verify that.
- **No accounts or server:** for one person on one phone an account adds nothing. The app has no server, no account and no secrets. The USDA key is used only by a script on your computer.
- **Limits of local storage:** data does not sync between devices. Clearing the browser's site data, or uninstalling the installed app, deletes it. The app asks the browser to keep its storage and offers JSON export and restore.
- **When accounts become worth it:** multiple devices, automatic backup, or paying users. The plan then is Supabase: Postgres with row-level security so each user can read only their own rows, plus a server function holding any API keys. The free tier covers one person; Pro is about $25/month. Costs get confirmed before it's set up.

## Workouts and the programme

- **Your programme:** your profile builds it. **Train → Edit programme** lets you rename sessions, add or remove sessions (1–7) and exercises, reorder them, and set sets, rep range, rest and how many reps to stop short. It also offers "Start from the recommended programme" to reset. Edits are validated: each exercise appears once per session, and rep ranges run low to high. Later profile changes warn before replacing your edits.
- **During a workout:**
  - Each exercise shows its prescription, today's target beside last time, and each set's previous numbers.
  - You log weight, reps and optional reps in reserve. Logged sets can be edited or deleted, and extra sets added.
  - The rest timer starts when you log a set.
- **Swap exercise:** offers exercises for the same main muscle with your equipment. Use it for today only, or to update your programme. A swap is blocked once you've logged sets of that exercise, so its history stays accurate.
- **Unfinished sessions:** saved as you go. Unlogged numbers you've typed and a running rest timer survive a reload, and Today and Train offer Resume.
- **Exercise instructions:** none are shipped. Unsourced how-to text is not shown, and each exercise says instructions are unavailable until cited steps are added (`instructions: { steps, source, url }` in `src/seed/exercises.ts`). There are no demonstration images or videos.

```bash
npm run check:workout   # with `npm run dev` running: full session, edits, reload/resume, swap, progression, programme editor
```

## Progress and the weekly review

**Progress** covers:
- **Body weight:** a 7-day average and 14-day trend, labelled as scale weight, with a note that it can't show muscle gain on its own.
- **Measurements:** optional.
- **Workout completion:** planned versus finished for the last 4 weeks.
- **Exercise performance:** each lift's sessions and estimated 1-rep max.

**Review** (one week at a time) builds everything from saved records with fixed rules (`src/rules/review.ts`, `performance.ts`):

| Section | What it shows | Rule |
|---|---|---|
| This week in brief | 4–6 plain sentences | Each one is generated from a number below; no AI |
| Suggested next steps | At most 3, plan changes first | Each lists its evidence ("Based on") and the rule behind it |
| Training | Planned vs finished, missed days, sets per muscle | A planned day without a finished workout is missed; today isn't missed until it's over |
| Lifts | Each exercise vs its previous session | Estimated 1RM (best-set reps for bodyweight); under 2% change counts as about the same; never compared across different exercises |
| Body | 7-day average, 14-day trend, measurements | Trend needs 8 weigh-ins over 10+ days |
| Nutrition | Averages of complete days | Shown only with 4+ complete days; partial days left out; complete days under 40% of target are flagged |
| Recovery | Sleep, energy, soreness averages | From optional check-ins on Today; blanks are ignored |
| Missing data and uncertainty | What's missing, and signals that don't agree | For example, weight rising faster than planned while lifts don't improve |

How suggestions work:
- **Plan changes** (calories, protein) are applied only when you press Accept. Keep current records a rejection.
- **Actions** (keep logging, protect training days, prioritise recovery) are marked Noted.
- **Too little data** leads to "Keep your plan as it is and keep logging", never a guess.
- **Every decision is dated**, together with the evidence it was based on, under *Decision history*.
- **AI summaries are off.** If they are added later, they will only rephrase these records, and the rule-based summary stays as the fallback.

```bash
npm run check:review   # with `npm run dev` running: seeds two weeks of records, checks Progress, the review, decisions and check-ins
```

## Training plan (beginner)

The plan is full body, 3 days a week on non-consecutive days (default Mon/Wed/Fri), alternating sessions A and B, about 45–50 minutes each. There are gym and home (dumbbells + bench) versions; switch in *Settings → Profile*, or edit it in *Train → Edit programme*.

- Main lifts: 3 sets of 8–12 reps, 2–2.5 min rest. Small muscles: 2 sets of 10–15, 60–90 s rest.
- Stop each set with about 2 reps in reserve (3 if you chose "New to lifting"). Logging reps in reserve is optional.
- First session: the app suggests no weight. Pick a conservative one, and later targets come from what you log.

## Food data

Every food records where its numbers came from:

- **Reference:** USDA FoodData Central, with the FDC ID and a link.
- **Label:** from the packet.
- **User:** your own estimate.

Household measures (cups, spoons, wraps) store their gram weight and how it was obtained. Weigh a portion once to calibrate it.

The built-in library comes from two cited sources. Each one is generated by a script, and no values are typed by hand.

**Nigerian staples (40 foods): FAO/INFOODS West African Food Composition Table (2019).** This covers rice, yam, gari, fufu, ogi, plantain, beans, egusi, efo, ewedu, okra, iru, crayfish, meats, fish, eggs and oils. Each food cites its WAFCT code and FAO's exact food name. It also notes when FAO calculated cooked values from the raw food, or when a value is lower quality in the source. The table has no egusi soup, moi moi or akara as dishes, so log their ingredients, or (planned) build them as recipes. For **eba / garri**, log the *dry* garri you used: the water adds weight but no energy.

```bash
# once: download WAFCT_2019.xlsx (3.06 MB) from FAO into data/wafct/ (git-ignored)
curl -L -o data/wafct/WAFCT_2019.xlsx https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx
npm run foods:wafct    # rebuilds src/seed/foods-wafct.ts
```

> **Licence:** FAO allows use in **non-commercial** products, with credit to FAO. Before charging users, request permission at <https://www.fao.org/contact-us/licence-request>, or replace these foods with another source.

To add a food, find its code with `node scripts/inspect-wafct.mjs data/wafct/WAFCT_2019.xlsx "search words"`, add it to the list in `scripts/import-wafct.mjs`, and re-run the import. `npm test` checks every built-in food: unique ID, citation present, and energy consistent with its macros.

**Other foods: USDA FoodData Central (public domain).** This covers only what the FAO table lacks: milk powder, evaporated milk, spaghetti, banana and roasted groundnuts.

```bash
npm run foods:import   # rebuilds src/seed/foods-usda.ts
```

Without a key it uses USDA's shared demo key, which is often rate-limited. To use your own free key:

1. Sign up at <https://fdc.nal.usda.gov/api-key-signup> (name and email). The key arrives by email.
2. Copy `.env.example` to `.env.local` in the project folder and paste the key after `FDC_API_KEY=`.
3. Run `npm run foods:import`. It prints "Using your FDC_API_KEY from .env.local."

`.env.local` is git-ignored, so the key never reaches GitHub. It is only used on your computer to build the food list, never inside the app or on Netlify.

Every household measure records how its grams are known: a USDA portion weight, *weighed by me*, or *my estimate, not weighed*. Add your own (serving spoon, cooking spoon, wrap, cup) from any food's portion screen.
## Your data: export and deletion

Data lives only in the browser where you use the app. *Settings → Your data* offers:

- **Export full backup (JSON):** everything, restorable with *Restore from a backup*. A restore replaces all data in one step: if the file is broken, from another app, from a newer version or missing a profile, it's refused and nothing changes. Backups from before the profile update are upgraded on restore.
- **Export for a spreadsheet (CSV):** workout sets, weigh-ins, measurements, food log (with sources) and check-ins, in kg and cm. These can't be restored.
- **Delete all data:** removes every record on this device, including unfinished-workout drafts, and returns to setup.

There are no accounts, so there are no other users' records to protect against. Anyone who can unlock your phone can open the app, just as with your other apps.

## Deploy

The app is a static site: `npm run build` produces `dist/` (about 0.8 MB). It needs no server, database or secrets.

**Live now on Vercel:** <https://rep-ledger-ten.vercel.app> (project `rep-ledger`, Hobby plan). Settings and headers are in `vercel.json`.

- **Automatic updates:** the project is connected to the GitHub repository, so every push to `main` deploys to production and other branches get preview URLs.
- **Deploy from this computer:** `npx.cmd vercel deploy --prod` (use `npx.cmd`, because Windows blocks the `npx.ps1` script in PowerShell). `.vercelignore` keeps `.env.local`, `data/` and `node_modules` out of the upload.
- **Check the live site:** set `APP_URL` to the live address (for example, in PowerShell, `$env:APP_URL = "https://rep-ledger-ten.vercel.app/"`), then run `npm run check:offline`, `check:audit`, `check:workout` and `check:profile`. `check:review` needs the dev server.

**Other hosts** also work: `netlify.toml` and `public/_headers` for Netlify, and `_headers` plus `NODE_VERSION=24` for Cloudflare Pages. A Netlify site `rep-ledger-wmom` exists but never published; its free credits were used up.

**After deploying**, open the site on your phone. On Android Chrome, use **Install app** (also in Settings). On iPhone, use Safari → Share → **Add to Home Screen**. Installing matters on iPhone: Safari can clear the storage of sites that aren't on the Home Screen after weeks without use.

What becomes public: the app's code and the built-in food and exercise data. Your records never leave your phone. The GitHub repository is public, so its code and commit history (including the commit email) are already visible.

## Environment variables

| Variable | Where | Required | Purpose |
|---|---|---|---|
| none | Deployed app | – | The app runs entirely in the browser and holds no secrets |
| `NODE_VERSION` | Host build settings | Set in `netlify.toml`; add manually on Cloudflare; Vercel uses its default | Node version for the build |
| `VERCEL_OIDC_TOKEN` | `.env.local` (written by `vercel link`; git-ignored, never uploaded) | No | Vercel CLI's short-lived token. Not used by the app; never commit it |
| `FDC_API_KEY` | `.env.local` on your computer (git-ignored; template in `.env.example`) | Optional | Your free USDA key for `npm run foods:import`. Never set it on the host |
| `APP_URL`, `BROWSER` | Your terminal | Optional | Point the browser checks at another URL, or use `chrome` instead of Edge |

## Recurring costs

| Item | Cost now | Assumptions |
|---|---|---|
| Hosting (Vercel Hobby) | ₦0 | One user, a 0.8 MB static app, no server functions. Hobby is free but for **personal, non-commercial** use only, so charging users would mean a paid plan (Pro has been about $20 per member a month; check Vercel's pricing page). The Netlify free credits on this account were used up, and the deploy there was skipped without a charge |
| Web address | ₦0 | The free `rep-ledger-ten.vercel.app` address. A custom domain is optional, with yearly registrar pricing |
| Database, accounts, sync | ₦0 | None used |
| AI summaries | ₦0 | Off. Costs will be quoted before enabling |
| Food data | ₦0 | USDA is public domain. FAO data is free for non-commercial use; a paid version needs FAO permission or another source |
| If you later add accounts and sync | about $25/month | Estimate for a managed Postgres plan (e.g. Supabase Pro) once past a free tier. To be confirmed when needed |

## Known limitations

- **One device:** no sync and no automatic backup. Clearing site data deletes everything, so export a backup regularly.
- **Not yet on a real phone:** checks ran in headless Edge at 360–390 px against both the local build and the live site. iPhone Safari behaviour, including install and storage, is untested.
- **Timer limits:** the rest timer only counts while the app is open. Vibration works on Android, not on iPhone.
- **No instructions or demonstrations:** no cited source has been chosen yet, so exercises show "unavailable" rather than unsourced tips.
- **Food gaps:** there are no composed Nigerian dishes (egusi soup, moi moi) and no recipe builder yet, and the USDA extras aren't imported until a key is set.
- **Calorie evidence stays in kg:** the calorie-adjustment evidence text (weight trend vs goal) is written in kg even when lb is selected. Everything else follows your units.
- **Fixed swap list:** limitation swaps cover the built-in exercises only and are not a substitute for a physiotherapist.
- **Food preferences go by name:** a food you create named, say, "Mama's special" isn't recognised as beef.
- **Units mid-workout:** numbers already typed into an unlogged set keep their unit if you switch units during a workout.
- **Dev-only advisories:** `npm audit` reports 2 moderate issues in `exceljs`. It's a development-only tool used to import the FAO table and isn't part of the app (`npm audit --omit=dev` finds 0).

## Roadmap

1. Install the live app on your phone and use it for a week; fix what real use turns up.
2. Add your usual meals, and a recipe builder for home-cooked dishes (jollof, egusi soup, moi moi) from cited ingredients.
3. Cited exercise instructions from a source you approve.
4. Claude explanations for the weekly review, via a small server function. The API key stays on the server, and costs are confirmed before enabling.
5. Optional cloud sync and login (Supabase) for backup and multiple devices, and later for paying users.
