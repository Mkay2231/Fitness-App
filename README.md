# Rep Ledger

A personal, mobile-first training and nutrition log for building muscle. It tells you what to train today, records your sets, logs your food (with sourced nutrition values), tracks body weight and measurements, and builds a weekly review with rule-based suggestions that you accept or reject.

All data stays in the browser on your device (IndexedDB). There is no server or account yet.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer (`node --version`).

```bash
npm install          # once, and after pulling changes that touch package.json
npm run dev          # open http://localhost:5173 on this computer
npm run dev:phone    # also reachable from your phone on the same Wi-Fi (URL is printed)
npm test             # run the rules engine tests
npm run build        # production build into dist/
```

Over Wi-Fi (`dev:phone`) the app works, but **offline mode only turns on over HTTPS** (or on `localhost`). To use it offline at the gym, it has to be deployed (see Roadmap). Netlify's free plan is enough.

> The project is in OneDrive. OneDrive syncing `node_modules` (thousands of files) can be slow or lock files. If `npm install` misbehaves, right-click `node_modules` → *Free up space*, or move the project out of OneDrive.

## How the pieces fit

```
src/
  rules/          Pure calculation logic, no UI, no database. Tested.
    nutrition.ts    Starting targets (Mifflin-St Jeor) and calorie adjustments
    progression.ts  Double progression, deloads, estimated 1RM
    trend.ts        7-day average weight and 14-day trend
    review.ts       Weekly review and recommendations
    volume.ts       Weekly sets per muscle
    *.test.ts       Tests: run with `npm test`
  db.ts           Database tables (Dexie/IndexedDB) and their types
  data.ts         Glue between the database and the rules
  seed/           Built-in exercises, programs and foods
  screens/        One file per screen (Today, Workout, Food, Progress, Review, Settings)
  ui.tsx          Small shared UI pieces
scripts/
  import-usda.mjs Builds src/seed/foods.ts from USDA FoodData Central
```

**To change a rule** (e.g. protein per kg, or when weight goes up), edit the constant or function in `src/rules/`, update or add a test next to it, and run `npm test`. The screens only display what the rules return.

## The rules

**Starting targets.** Resting energy from Mifflin-St Jeor × an activity factor, plus a surplus for your chosen gain rate (0.25–0.5% of body weight per week, at about 7,700 kcal per kg). Protein is 1.8 g/kg, fat about 25% of calories (at least 0.6 g/kg), and carbs fill the rest.

**Calorie adjustments (weekly review).** These run only when there are at least 8 weigh-ins spread over 10+ days, and at least 10 days in the last 14 marked "complete" for food:
- If your weight trend is within ±0.1 kg/week of the goal, nothing changes.
- If your average intake is more than 200 kcal off target, the advice is to hit the target first, not to change it.
- Otherwise it suggests a change proportional to the gap, capped at ±250 kcal per review.

**Progression (each exercise, each session).** This is double progression:
- Keep the weight and add reps until every set reaches the top of the rep range, then add your smallest jump (set per equipment type in *More*).
- One session with a set below the range: repeat the weight. Two sessions in a row: drop about 10%.
- Bodyweight exercises progress by reps, then a harder variation.

**Missing vs zero.** A day with no food entries is *not logged* and is left out of averages. Only days you mark complete count, and "I ate nothing" is a separate, explicit action. A planned training day with no workout shows as *not logged*, not as a rest day.

## Training plan (beginner)

The plan is full body, 3 days a week on non-consecutive days (default Mon/Wed/Fri), alternating sessions A and B, about 50–60 minutes each. There are gym and home (dumbbells + bench) versions; switch in *More*.

- Main lifts: 3 sets of 8–12 reps, 2–2.5 min rest. Small muscles: 2 sets of 10–15, 60–90 s rest.
- Stop each set with about 2 reps in reserve (RIR). The app explains RIR on the workout screen.
- First session: pick conservative weights. The app adjusts from what you log.

## Food data

Every food records where its numbers came from:

- **Reference:** USDA FoodData Central, with the FDC ID and a link.
- **Label:** from the packet.
- **User:** your own estimate.

Household measures (cups, spoons, wraps) store their gram weight and how it was obtained. Weigh a portion once to calibrate it.

```bash
npm run foods:import   # rebuilds src/seed/foods.ts from USDA
```

This uses USDA's shared demo key, which is often rate-limited. Get a free personal key at <https://fdc.nal.usda.gov/api-key-signup> and run:

```powershell
$env:FDC_API_KEY = "your-key"; npm run foods:import
```

USDA covers ingredients (rice, yam, beans, eggs, fish, oils…) but not composed Nigerian dishes. Those are planned from the FAO/INFOODS *West African Food Composition Table (2019)*.

## Backups

*More → Export backup* downloads all your data as JSON, and *Restore* loads it back. Data lives only in this browser until cloud sync exists, so export regularly.

## Roadmap

1. Deploy to Netlify (free) so the app is installable and works offline on your phone.
2. Fill the food library from USDA and the West African table, and add your usual meals.
3. Claude explanations for the weekly review, via a small server function. The API key stays on the server, and costs are confirmed before enabling.
4. Optional cloud sync and login (Supabase) for backup and multiple devices, and later for paying users.
