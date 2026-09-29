# Corner: Logging & Nutrition Lookup Addendum

Paste everything below into Claude Code. Save it in the project root as `SPEC-logging.md` next to `SPEC.md`.

---

## What this changes

This addendum replaces the **Log** parts of `SPEC.md` (planned-meal actions and "Add meal/snack") and adds nutrition lookup. Update `SPEC.md` to match:

- **Out of scope:** remove "Food databases or barcode scanning" and "AI features". Replace them with: "Only the lookups defined in SPEC-logging.md. No AI anywhere else in the app."
- **Rule 6** becomes: "Health data stays on-device. The only outbound calls are food lookups (the food text or barcode only; never weight, logs, targets, or check-ins)."
- **Everything else in `SPEC.md` still stands.** In particular, the app never changes the plan or targets and never suggests what to eat.

Migrate any existing log data to the new model below without losing entries.

## 1. Planned meal cards (Today screen)

Each planned meal card gets:

- **✓ Ate it**: the big primary button. One tap logs the planned meal with the bundle's nutrition, then shows an "Undo" toast for 5 seconds.
- **Ate something else**: opens the Food Entry sheet (section 3). The entry replaces that planned meal. The planned meal stops counting toward the day's totals, and the replacement counts instead.
- A **"More" menu** with:
  - **Portion**: ½× / 1.5× / 2×
  - **Swapped**: pick from the recipe's bundle swaps, which already carry nutrition
  - **Skipped**

## 2. "+ Add meal or snack" button

- A large, always-visible button on the Today and Log screens (a floating action button or a pinned bar). From any screen, it's at most one tap away.
- It opens the same Food Entry sheet. It defaults to today and the current time, with a **Meal / Snack** toggle.
- It isn't tied to any planned meal, and it's logged as **unplanned**.
- The date and time are editable, so a forgotten snack can be logged later.

## 3. Food Entry sheet

This is one screen with one text box at the top, plus a barcode button. Sources are layered from fastest and most reliable to slowest:

**Tier 1: Local (offline, instant)**
- As I type, show matches from my saved foods, my recent entries, and every bundle recipe, variant, and swap (these already have nutrition).
- One tap adds a match.

**Tier 2: "Describe it" (online, AI estimate)**
- Below the local matches, show a button: **Estimate "‹what I typed›"**.
- I type plain English, such as "2 slices pepperoni pizza and a Diet Coke" or "Chipotle bowl, chicken, white rice, black beans, cheese, guac".
- It calls the Anthropic Messages API and gets back an item-by-item breakdown (details in section 4).
- The results show each item with its portion and nutrition, plus the model's assumptions and a confidence level.
- I can change each item's multiplier (½× / 1× / 1.5× / 2×), delete items, or edit numbers, then **Save**.

**Tier 3: Database lookup (online)**
- **Search USDA** button: queries USDA FoodData Central for generic and branded foods.
- **Barcode** button: scans a packaged food with the camera and looks it up in Open Food Facts.
  - Use the `BarcodeDetector` API where supported (Chrome on Android).
  - Otherwise use a JS library such as ZXing (needed for iPad Safari).
- Default to **servings, not grams**: show 1 serving with multipliers. When a source only gives per-100 g values, use its household serving if one is provided; otherwise offer simple presets. Grams live under a "More" toggle.

**Tier 4: Offline fallback**
- Show this automatically when there's no connection, and always as a manual option:
  - **Hand-portion quick-add**, using the bundle's `portion_guide`
  - **Manual numbers**
- If I type a description while offline, save it with the quick-add or manual numbers and flag it `needs_refine`.
- When the connection returns, show a small badge ("2 entries to refine"). Tapping it runs Tier 2 on each saved description. I confirm before any numbers get replaced.

**After any save**, offer **"Save as favorite"** so it's a Tier 1 result next time. Cache every USDA and Open Food Facts result locally so repeat foods work offline.

## 4. AI estimate details

**API key**
- I paste my own Anthropic API key in Settings.
- Store it only in IndexedDB on this device, and **never include it in backups or exports**.
- Add a "Test key" button.

**Calling the API**
- Call the Messages API directly from the browser. Check the current Anthropic API docs for the header required for direct browser access and for current model names.
- Default to the fastest, lowest-cost current model (Haiku-class), and make the model a setting.
- Keep `max_tokens` modest (about 800).

**System prompt**
Use something close to this:

```
You estimate nutrition for a food log. The user describes what they ate in plain English.
Return ONLY a JSON object, no prose, no code fences, matching:
{"items":[{"name":string,"portion":string,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number}],
 "assumptions":[string],"confidence":"low"|"medium"|"high"}
Rules: one item per distinct food or drink. Use the portions the user states; otherwise assume typical US portions and say so in assumptions.
For chain restaurants, use their published nutrition when you know it. Zero-calorie drinks are still items (kcal 0).
Round kcal to the nearest 5 and grams to whole numbers. Do not give advice, judgments, or suggestions.
```

**Handling the response**
- Strip code fences, parse the JSON, and validate the numbers (non-negative, kcal within about 15% of 4P + 4C + 9F).
- If parsing fails, show a plain error and drop me into manual entry with my text preserved.

**Limits on AI**
- The AI is used **only** here. It never comments on choices, suggests foods, or touches the plan.
- If no key is set, or AI estimates are toggled off in Settings, hide the Estimate button. Tiers 1, 3, and 4 still work.

## 5. USDA and Open Food Facts details

- **USDA FoodData Central:** a free API key from api.data.gov, entered in Settings. If no key is set, fall back to `DEMO_KEY`, with a note that it's rate-limited.
- **Open Food Facts:** no key needed. Use per-serving nutrition when it's available.
- Show the source on every result ("USDA", "Open Food Facts", "AI estimate · medium").

## 6. Log entry data model

```json
{
  "id": "uuid",
  "date": "2026-09-28",
  "time": "13:10",
  "kind": "planned | unplanned",
  "planned_ref": { "date": "2026-09-28", "slot": "lunch" },
  "status": "as_planned | portion | swapped | replaced | skipped | unplanned",
  "meal_type": "meal | snack",
  "description": "raw text I typed, if any",
  "items": [
    {
      "name": "Pepperoni pizza",
      "portion": "2 slices, 14-inch",
      "multiplier": 1,
      "kcal": 620, "protein_g": 26, "carbs_g": 68, "fat_g": 26, "fiber_g": 4,
      "source": "plan | swap | saved | ai | usda | off | portion | manual",
      "source_ref": "recipe id, USDA fdcId, barcode, or null",
      "confidence": "low | medium | high | null"
    }
  ],
  "totals": { "kcal": 620, "protein_g": 26, "carbs_g": 68, "fat_g": 26, "fiber_g": 4 },
  "needs_refine": false,
  "note": ""
}
```

`planned_ref` is null for unplanned entries. Totals are always computed from the items.

## 7. Check-in export additions

Add these lines to the CHECK-IN → NUTRITION block:

```
- Planned meals: as planned <x>% | portion-adjusted <n> | swapped <n> | replaced <n> | skipped <n>
- Unplanned entries: <n>, total <kcal> kcal
    <day> <time> <name> — <kcal> kcal / <protein> g P (<source>, <confidence>)
- Entries still flagged needs_refine: <n>
```

## 8. UX rules

- **✓ Ate it** is one tap. A repeat food takes 3 taps or fewer from the + button.
- Nothing ever requires grams.
- After saving, the only feedback is "Logged." No warnings, comparisons, or colors that judge the choice.
- Every entry can be edited or deleted later.
- The Food Entry sheet works one-handed on the phone, with large targets.

## 9. Settings additions

- **API keys:** Anthropic and USDA, each labeled "Stored on this device only", with a Test button.
- **AI estimates:** on/off toggle and model choice.
- **Favorites:** a list where I can edit or delete saved foods.

## Build order

1. Card actions, the "+ Add meal or snack" button, and the Food Entry sheet with Tier 1 (local search) and Tier 4 (quick-add and manual), plus the data model migration.
2. Tier 2: AI "Describe it".
3. Tier 3: USDA search and barcode scanning.
4. The offline refine queue, favorites management, and the check-in export changes.

After each phase, tell me exactly what to test on my Android phone.
