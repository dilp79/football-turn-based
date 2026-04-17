# Football Turn-Based: Major Upgrade Spec

## Overview

Six feature additions to evolve the prototype into a polished, single-player-ready game with adaptive AI, animations, sound, tutorial, expanded abilities, and complete foul rules.

---

## 1. Adaptive AI Opponent

### Architecture

New `src/ai.js` module. Pure functions that read game state and return actions. No UI coupling. AI actions execute with 500-800ms delays between them so the human can follow.

### Adaptive Difficulty — 3 Internal Levels

| Level | When Active | Behavior |
|-------|------------|----------|
| 1 (start) | Default | Random valid actions, slight preference for advancing toward goal |
| 2 | After human scores 1 | Greedy heuristics: shoot > pass forward > dribble > move toward goal > tackle |
| 3 | After human scores 2 | Level 2 + surge timing, ability timing, pass→shoot chain evaluation |

### Scaling Rules

- AI starts at Level 1
- Each time human scores → AI level +1 (max 3)
- Each time AI scores → AI level -1 (min 1)
- Rubber-banding: smarter when losing, sloppier when winning

### Phase Behavior

**Draft:**
- Level 1: Random legal picks
- Level 2: Cost-efficient (best stat/coin ratio per position)
- Level 3: Counter-drafts (e.g., if human picks strong GK → AI prioritizes longShot FWD)

**Placement:**
- Level 1: Spread out formation
- Level 2: Balanced formation
- Level 3: Formation optimized for attack direction

**Match Turn:**
- Evaluates all available actions, scores each, picks top
- Small random factor at lower levels to feel human
- Action scoring heuristics:
  - Shoot: high score if close to goal + good shot stat
  - Pass forward: medium score, higher if receiver near goal
  - Dribble past defender: medium score if dribble stat advantage
  - Move toward goal with ball: base score
  - Tackle/slide carrier: high score if adjacent to ball carrier
  - Move toward ball: low score (positioning)

### Game Mode Selection

- Main menu adds "vs AI" and "vs Player" buttons
- "vs AI" assigns Team 1 to AI, Team 0 to human
- AI turn executes automatically with animation delays

---

## 2. Animations & Graphics Polish

### New Module: `src/animations.js`

Returns Promises so game logic can `await` them before proceeding.

### Animation Catalog

| Event | Animation | Duration |
|-------|-----------|----------|
| Player move | Glide cell-to-cell via CSS transform transition | 200ms per cell |
| Pass | Ball arcs along Bresenham path | 300ms total |
| Shot | Ball flies with slight curve toward goal | 400ms total |
| Dice roll | Cycling random faces before landing | 600ms |
| Tackle/dribble clash | Both players shake + impact flash | 50ms shake |
| Goal celebration | Screen border flashes gold 3x, score counter pulses | 800ms |
| Slide tackle | Player slides one cell in tackle direction | 250ms |
| Phase transition | Fade between draft/placement/match | 300ms |

### Mobile Layout (below 768px)

- Field goes full-width
- Action buttons → fixed bottom bar
- Team rosters → swipeable bottom drawer
- Draft cards → vertical scrollable list
- Shot sector picker → scales to fill width
- Minimum tap target: 44px

### Unchanged

- Procedural sprite generation style
- Dark sci-fi color scheme
- DOM-based field grid rendering

---

## 3. Sound Effects

### New Module: `src/audio.js`

Web Audio API with procedurally synthesized sounds. No audio files.

### Sound Palette

| Event | Sound Description |
|-------|------------------|
| Dice roll | Rapid clicking ticks, "clack" on land |
| Player move | Soft footstep tap per cell |
| Pass | Quick swoosh (filtered white noise) |
| Shot | Hard kick thump (low frequency burst) |
| Goal | Rising 3-note chime + crowd noise burst |
| Save | Dull thud + whistle |
| Tackle won | Sharp snap |
| Tackle lost | Muffled bump |
| Slide foul | Whistle blow (sine wave sweep) |
| Dribble success | Quick double-tap |
| Card buy (draft) | Coin clink |
| Turn start | Subtle chime |
| Match end | 4-note victory fanfare |

### Controls

- Mute toggle button in top corner
- Volume preference stored in `localStorage`
- Muted by default on mobile (browser autoplay policy)

---

## 4. Match Stats Screen

### Tracked Stats (per team)

| Stat | How Tracked |
|------|------------|
| Possession % | turns held ball / total turns |
| Shots total | incremented on every shot attempt |
| Shots on target | incremented when shot reaches keeper (not blocked by wall/intercept) |
| Pass attempts / completions | incremented in resolvePassTo |
| Tackles won / lost | incremented in resolveTackleAgainst |
| Dribbles won / lost | incremented in resolveDribbleAgainst |
| Fouls committed | incremented on slide roll = 1 |
| MVP | player with most goals + assists + tackles won |

### Implementation

- New `state.stats` object initialized at match start
- Each resolve function increments relevant counters
- Post-match overlay rendered by `ui.js` after `phase === "ended"`
- Shows both teams side-by-side with stat bars
- "Play Again" button below stats

---

## 5. Interactive Tutorial

### Trigger

First launch detected via `localStorage.getItem("tutorialComplete")`. If null, tutorial activates automatically on game start. Forces "vs AI" mode at Level 1.

### Step Structure

`src/tutorial.js` exports `TUTORIAL_STEPS` array:

```
{
  id: "draft-intro",
  trigger: (state) => state.phase === "draft" && state.draft.purchaseCount === 0,
  message: "Welcome! Buy 5 players for your team. You have 100 coins. Pick wisely — you need 1 goalkeeper and 4 field players.",
  highlightSelector: ".market-grid"
}
```

### Steps

1. **draft-intro** — Explains draft phase, budget, roster requirements
2. **first-buy** — After first card bought: "Good pick! Keep building your roster."
3. **placement-intro** — "Place your players on your half. Goalkeeper goes in the goal."
4. **placement-gk** — Highlights goal cell when GK is selected
5. **dice-intro** — "Roll result = your action points this turn. Higher die = surge bonus."
6. **move-intro** — "Select a player, then click Move. Highlighted cells show AP cost."
7. **pass-intro** — First time pass is available: "Pass to teammates or empty cells."
8. **tackle-intro** — First time tackle is available: "Tackle to steal the ball."
9. **shoot-intro** — First time shoot is available: "Pick a sector to aim at. Keeper will try to guess."
10. **goal-scored** — "Goal! First to 3 wins."

### UI

- Tooltip overlay positioned near the relevant UI element
- Semi-transparent backdrop dims everything except highlighted area
- "Got it" button dismisses current tip
- Skip tutorial link in corner
- After first match completes: `localStorage.setItem("tutorialComplete", "true")`

---

## 6. Ability Rework & Extensibility

### Стингер Rework

Remove `longShot` from Сергей Стингер. Replace with:

```javascript
feint: {
  id: "feint",
  label: "Финт",
  description: "После успешного дриблинга: +3 к следующему удару в этом ходу.",
  contexts: ["dribbleSuccess"],
  effect: { stat: "shot", bonus: 3, duration: "turn" }
}
```

**Stat adjustment:** Стингер's shot: 7 → 6 (feint combo gives effective 9, balanced against Шторм's raw 8 + longShot 5 = 13 but no setup required).

**Mechanic:** On successful dribble, if Стингер has `feint` armed and unused → set `player.feintActive = true`. On shot resolution → add +3 to attack if `feintActive`. Clear `feintActive` at end of turn. Consuming the shot bonus marks ability as used.

### Extensible Ability System

Refactor ABILITIES to be data-driven:

```javascript
{
  id: "longShot",
  label: "Удар с центра",
  description: "...",
  contexts: ["shoot"],        // when it can trigger
  effect: {
    stat: "shot",             // which stat to modify
    bonus: 5,                 // bonus amount
    duration: "action"        // "action" = this action, "turn" = until end of turn
  }
}
```

Resolution functions read `effect.stat` and `effect.bonus` instead of hardcoding ability IDs. New abilities for future packs only need a registry entry + players referencing them.

**Future-ready ability examples (not implemented now, just registry-compatible):**
- Header, Captain aura, Two-footed, Playmaker, etc.

---

## 7. Free Kicks After Fouls

### Trigger

Slide tackle rolls 1 (foul).

### Flow

1. Ball placed at foul location
2. Fouling player marked `suspended = true`
3. Opposing team gets a new turn starting with ball at foul spot
4. Closest opponent to foul location receives the ball automatically
5. Suspended player cannot be selected for any action during that turn
6. `suspended` flag clears when the free kick turn ends
7. Foul whistle sound plays, brief animation

### Stats Integration

- Fouls committed tracked per team in `state.stats`
- Displayed in post-match stats screen

---

## 8. Game Mode & Menu

### Main Menu

Before draft, show a simple mode selection screen:

- **"vs AI"** — Human is Team 0 (Алые Кометы), AI is Team 1 (Лазурные Волки)
- **"vs Player"** — Hot-seat mode (current behavior)

### State Changes

- `state.mode`: "ai" or "hotseat"
- `state.aiLevel`: 1-3 (adaptive)
- AI turn triggers automatically after human ends turn
- During AI turn, all action buttons disabled for human

---

## Module Map

| File | Changes |
|------|---------|
| `src/ai.js` | NEW — AI decision engine |
| `src/animations.js` | NEW — animation Promise system |
| `src/audio.js` | NEW — Web Audio synthesizer |
| `src/tutorial.js` | NEW — tutorial step definitions |
| `src/game.js` | Add stats tracking, free kick flow, feint ability, game mode, ability extensibility refactor |
| `src/ui.js` | Stats screen, tutorial overlays, mobile layout, mode selection, mute button |
| `src/main.js` | AI turn triggering, animation awaiting, audio hookup |
| `src/data.js` | Add feint ability, update Стингер stats/ability, extensible ability format |
| `styles.css` | Animation keyframes, mobile breakpoints, bottom bar, tutorial overlay styles |
| `index.html` | Mute button element, tutorial overlay container |
