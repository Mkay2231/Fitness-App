---
version: 1
slug: "src-screens-workout-tsx"
primary_target: "src/screens/Workout.tsx"
related_targets: ["src/screens/Today.tsx"]
---

Scope: Today and active workout screens first, then Train, Food, Progress, Review, Settings in the same system. Mode: Operate.

Audience/task: beginner lifter logging sets one-handed between sets, often offline; checks today's plan and food/weight status at a glance.

## Direction contract

THESIS: A calm training journal where the next action is always obvious. Refuses the dark neon gym-tracker look and the card-grid dashboard.

OWN-WORLD (user-pinned): warm off-white #F6F5F1 ground, charcoal #202420 ink, forest green #245C45 as the only accent. White panels with 1px warm borders, near-zero shadow. Inter, tabular numerals for every number. List rows for repeated records, panels only for meaningful groups. Authored 1.75px-stroke SVG icons.

STORY: open the app, see today's session and what to lift versus last time, start it, log each set in one tap, rest, finish. The day's food and weight status sits underneath as plain rows.

FIRST VIEWPORT: Today shows the date and a session heading, the exercise list with today's target beside last time, and one full-width green Start/Resume button. The workout screen has a sticky header (name, elapsed time, sets done, save status) and per-exercise set rows: set number, previous, large kg and reps inputs, a check button. A bottom dock holds the rest timer or the Finish button.

FORM: brief-pinned direction (user supplied the full visual system); no concept roll, code-led, no image generation available.

SIGNATURE: completing a set. The check fills, the row settles into a logged state with a brief green wash, and the rest timer rises into the dock. Reduced motion removes the movement.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
