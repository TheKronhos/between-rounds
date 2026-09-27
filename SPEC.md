# Build Prompt: "Fuel", a Nutrition Companion App

## What we're building

A personal nutrition companion app for one user, a beginner boxer on a weight-loss plan. It runs on an Android phone (primary: logging, grocery store) and an iPad (kitchen: recipes, cook mode). It must work fully offline once installed.

The app is a display and logging tool, not a decision-maker. All nutrition decisions (targets, meals, recipes, grocery list, prep schedule, reminders) are made by my nutritionist in a separate Claude chat. They reach the app as a JSON plan bundle that I import. My logs leave the app as a check-in export that I paste back to the nutritionist. That round trip is the whole architecture.

## Non-negotiable rules

1. Never change the plan automatically. No auto-adjusting calories, no "smart" suggestions, no recomputing targets. Display exactly what the bundle says.
2. Offline-first. Every feature except the initial install works with no signal.
3. Validate every import. Check the schema and every cross-reference (recipe_id, section names, dates). On any error, reject the whole bundle, keep the current plan, and show a plain-English list of what's wrong.
4. Neutral, non-judgmental design. No red "over budget" numbers, no streaks, no guilt copy, no daily weigh-in nags. Weight is shown as a 7-day and weekly average; the single daily number is visually de-emphasized.
5. Kitchen-proof UI. Large tap targets (min 48px), big readable text, dark mode, and landscape two-pane on iPad.
6. Health data stays on-device. No analytics, no accounts, no third-party calls.
7. Ask me before adding anything not in this spec. Propose it; don't build it.

## Tech approach

- Progressive Web App: one codebase, installable to the home screen on both Android (Chrome) and iPad (Safari → Share → Add to Home Screen).
- Suggested stack: Vite + React + TypeScript, IndexedDB via Dexie for storage, vite-plugin-pwa for the service worker and offline caching. Push back if you have a better offline-first option that installs on both devices without an app store.
- Host as a static site on a free HTTPS host (GitHub Pages, Netlify, or Cloudflare Pages); installation requires HTTPS. Walk me through deploying.
- No backend and no sync. Each device keeps its own data. The phone is the logging device. The iPad only needs the plan bundle (recipes, grocery, prep). Provide full backup export/import (JSON) so I can move data if needed.
- Reminders: PWAs can't reliably fire scheduled notifications when closed, so:
  - (a) show reminders on the Today screen, and
  - (b) generate a `.ics` calendar file of the week's reminders with alarms (VALARM) that I import into Google Calendar or iPad Calendar. Those alarms fire reliably with the app closed.
  - Also use the Notification API for reminders while the app is open.
- Use the Screen Wake Lock API in cook mode where supported; fail silently where not.
- US units throughout (oz, lb, cups, °F). 12-hour clock in the UI; 24-hour in the data.
- Print-friendly CSS for the grocery list and recipes.

## Screens

### 1. Today (home)

- A timeline of the day, with the day type shown at top ("Hard day", "Moderate day", "Recovery day").
- Reminders from the bundle for today (thaw, prep, shop, supplement), each with a checkbox.
- Planned meals at their times. Each has one-tap actions:
  - Ate as planned
  - Portion: ½× / 1× / 1.5×
  - Swapped: pick from that recipe's swaps list, or enter a custom item
  - Skipped
- A "Tomorrow needs" card showing tomorrow's reminders, so thaw tasks are visible the night before.
- A training marker at the training time from settings (display only).
- Water: +8 oz / +16 oz buttons, with a progress bar toward the day's target.
- Daily totals vs the day-type target: kcal, protein, carbs (fat and fiber secondary). Neutral colors.

### 2. Week

- A 7-day grid of the plan: day type, each meal, and the planned kcal/protein per day.
- Tapping a meal opens its recipe.

### 3. Recipes and Cook Mode

- A recipe list (search, filter by tag).
- Recipe detail:
  - ingredients with a checklist
  - servings scaler
  - portion notes for "Me" and "Son"
  - swaps
  - storage/keeps info
  - per-serving nutrition
- Cook mode:
  - one step at a time in huge text, with swipe or large next/back buttons
  - tap-to-start timers on any step with `timer_sec`; multiple timers can run at once, with an audible alarm and labels
  - wake lock on
- Instant Pot times in the data are already altitude-adjusted. Display them as given; don't recalculate.

### 4. Grocery

- The bundle's list, grouped by store section in a fixed order: Produce, Meat & Seafood, Dairy & Eggs, Frozen, Pantry, Bakery, Supplements, Other.
- Item actions:
  - check off each item
  - an "already have it" toggle
  - add my own items
- View options:
  - "hide checked"
  - a reset button for the next shopping trip
- Must be fast and fully offline in a store with bad signal.

### 5. Prep

- This week's prep sessions (date, time, tasks, active minutes, how long each item keeps), with checklists.
- Each task links to its recipe.

### 6. Log and Progress

- Add meal/snack, three ways:
  1. Saved foods: my favorites library, one tap to log.
  2. Hand-portion quick-add: steppers for palms of protein, fists of veg, cupped hands of carbs, thumbs of fat. The estimate uses the `portion_guide` factors from the bundle (never hardcoded).
  3. Manual entry: name, kcal, protein, carbs, fat (optional), with an option to save as a favorite.
- Edit or delete any log entry.
- Weight:
  - optional morning entry
  - shows the 7-day rolling average and weekly averages as a simple line chart; the daily number stays small
- Weekly check-in form (1–5 scales plus a note for each): energy, hunger, sleep, how training felt.

### 7. Settings

- Plan: import bundle (file picker and paste-JSON box), with a summary of the current plan and its version.
- Data: full backup export and restore.
- Reminders: export this week's reminders as `.ics`.
- Personal: training time, water target override (defaults to the bundle).

## Check-in export (critical)

A "Copy check-in for nutritionist" button produces this plain-text block for the selected week and copies it to the clipboard:

```
CHECK-IN → NUTRITION
- Week: <start date> to <end date>
- Weekly avg weight: <this week> (prior weeks: <w-1>, <w-2>, <w-3>)
- Weigh-ins logged: <n>/7
- Avg daily intake by day type:
    Hard: <kcal> kcal / <protein> g P / <carbs> g C (target <kcal>/<protein>)
    Moderate: ...
    Recovery: ...
- Planned meals eaten as planned: <x>% | swapped: <n> | skipped: <n>
- Off-plan items: <list of custom/added items with kcal>
- Avg water: <oz>/day
- Energy <1-5> | Hunger <1-5> | Sleep <1-5> | Training <1-5>
- Notes: <free text from the check-in form>
```

Also offer a JSON export of the same data.

## Plan bundle schema (import)

Validate strictly against this. Also build a small sample bundle for testing; the real one will come from my nutritionist.

```json
{
  "bundle_type": "nutrition_plan",
  "data_version": "1.0",
  "plan_id": "week-2026-09-27",
  "valid_from": "2026-09-27",
  "valid_to": "2026-10-03",
  "targets": {
    "day_types": {
      "hard":     { "label": "Hard day",     "kcal": 2600, "protein_g": 190, "carbs_g": [250, 290], "fat_g": [65, 85], "fiber_g": 35 },
      "moderate": { "label": "Moderate day", "kcal": 2350, "protein_g": 190, "carbs_g": [180, 220], "fat_g": [65, 85], "fiber_g": 35 },
      "recovery": { "label": "Recovery day", "kcal": 2150, "protein_g": 190, "carbs_g": [150, 180], "fat_g": [65, 85], "fiber_g": 35 }
    },
    "hydration_oz": { "base": [100, 120], "training_add": [20, 30] },
    "portion_guide": {
      "palm_protein":    { "kcal": 150, "protein_g": 28, "carbs_g": 0,  "fat_g": 5 },
      "fist_veg":        { "kcal": 25,  "protein_g": 1,  "carbs_g": 5,  "fat_g": 0 },
      "cupped_hand_carb":{ "kcal": 120, "protein_g": 3,  "carbs_g": 25, "fat_g": 1 },
      "thumb_fat":       { "kcal": 100, "protein_g": 0,  "carbs_g": 0,  "fat_g": 11 }
    }
  },
  "days": [
    {
      "date": "2026-09-27",
      "day_type": "moderate",
      "training": true,
      "meals": [
        {
          "slot": "lunch",
          "time": "11:00",
          "recipe_id": "turkey-club-wraps",
          "variant": null,
          "servings": 1,
          "kcal": 850, "protein_g": 75, "carbs_g": 35, "fat_g": 45,
          "son_plate": null,
          "notes": ""
        }
      ]
    }
  ],
  "recipes": [
    {
      "id": "ip-salsa-chicken",
      "name": "IP Salsa Chicken",
      "tags": ["instant-pot", "batch", "family"],
      "yield_servings": 7,
      "active_min": 10,
      "total_min": 45,
      "ingredients": [
        { "item": "Boneless skinless chicken thighs", "qty": 3, "unit": "lb", "section": "Meat & Seafood" }
      ],
      "steps": [
        { "text": "High pressure 19 min (altitude-adjusted).", "timer_sec": 1140 }
      ],
      "variants": [
        { "id": "hard", "label": "Hard day", "changes": "…", "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 }
      ],
      "per_serving": { "kcal": 330, "protein_g": 50, "carbs_g": 3, "fat_g": 13 },
      "portion_notes": { "me": "2 palms", "son": "1 palm in a quesadilla" },
      "swaps": [
        { "label": "Ground turkey taco meat", "kcal": 330, "protein_g": 45, "carbs_g": 3, "fat_g": 15 }
      ],
      "storage": "Fridge 4 days. Freeze up to 3 months."
    }
  ],
  "grocery": [
    { "item": "Chicken thighs, boneless skinless", "qty": 5, "unit": "lb", "section": "Meat & Seafood", "recipe_ids": ["ip-salsa-chicken"], "optional": false, "note": "family pack" }
  ],
  "prep": [
    {
      "date": "2026-09-27", "time": "12:30", "title": "Sunday batch prep",
      "tasks": [
        { "text": "IP salsa chicken", "recipe_id": "ip-salsa-chicken", "active_min": 10, "keeps": "Fridge 4 days; freeze extras" }
      ]
    }
  ],
  "reminders": [
    { "date": "2026-10-03", "time": "20:00", "type": "thaw", "title": "Thaw salsa chicken", "body": "Move 2 portions from freezer to fridge for Monday." }
  ],
  "notes": "Free text from the nutritionist, shown on the Week screen."
}
```

Validation rules:

- Every `recipe_id` in `days`, `grocery`, and `prep` must exist in `recipes`.
- Every `day_type` must exist in `targets.day_types`.
- `section` must be one of the fixed grocery sections.
- `type` must be one of: `thaw`, `prep`, `shop`, `supplement`, `hydrate`, `other`.
- Dates are ISO, times are 24-hour `HH:MM`, and all dates fall within `valid_from`–`valid_to`.
- Numbers must be non-negative.
- Unknown fields: warn, don't fail.

Import behavior: A new bundle replaces the active plan. Keep previous bundles in history (read-only) so past logs still show their targets. Logs are never deleted by an import.

## Build order

1. Data layer, bundle validation and import, sample bundle, and the Week screen.
2. Recipes and cook mode (timers, wake lock), plus Grocery.
3. Today screen, logging (all three add methods), water, and weight.
4. Check-in export, backup/restore, `.ics` reminder export, and in-app notifications.
5. PWA install and offline test on both devices, then deploy.

After each phase, tell me what to test on my phone and iPad before moving on.

## Out of scope for v1 (don't build unless I ask)

Food databases or barcode scanning, cloud sync, accounts, AI features, automatic target changes, and integration with my training app.
