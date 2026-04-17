# Game Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add adaptive AI opponent, animations, sound effects, match stats screen, interactive tutorial, feint ability, and free kicks after fouls.

**Architecture:** 4 new modules (`ai.js`, `animations.js`, `audio.js`, `tutorial.js`) plus modifications to existing `game.js`, `data.js`, `ui.js`, `main.js`, `styles.css`, and `index.html`. Each new module is independent and testable. Game state gains `mode`, `aiLevel`, `stats`, `freeKick`, and `feintActive` fields.

**Tech Stack:** Vanilla JS (ES6 modules), Web Audio API, CSS transitions/keyframes, HTML5.

---

### Task 1: Data layer — feint ability + Stinger stat rework

**Files:**
- Modify: `src/data.js`

- [ ] **Step 1: Add feint ability to ABILITIES registry**

In `src/data.js`, add after the `longShot` entry in `ABILITIES`:

```javascript
feint: {
  id: "feint",
  label: "Финт",
  description: "После успешного дриблинга: +3 к следующему удару в этом ходу.",
  contexts: ["dribbleSuccess"],
},
```

- [ ] **Step 2: Update Stinger's stats and ability**

In `src/data.js`, change the `fwd-sergey-stinger` entry:
- `shot: 7` → `shot: 6`
- `abilityId: "longShot"` → `abilityId: "feint"`

- [ ] **Step 3: Run smoke test**

Run: `node scripts/smoke-test.mjs`
Expected: PASS (smoke test doesn't use Stinger)

- [ ] **Step 4: Commit**

```bash
git add src/data.js
git commit -m "feat: add feint ability, rework Stinger to use it instead of longShot"
```

---

### Task 2: Game state — stats tracking, free kicks, feint mechanic, game mode

**Files:**
- Modify: `src/game.js`

- [ ] **Step 1: Add stats initialization to reset()**

In `src/game.js`, inside `reset()`, add to `this.state`:

```javascript
mode: "hotseat", // "hotseat" or "ai"
aiLevel: 1,
stats: {
  turns: [0, 0],
  turnsWithBall: [0, 0],
  shots: [0, 0],
  shotsOnTarget: [0, 0],
  goals: [0, 0],
  passAttempts: [0, 0],
  passCompletions: [0, 0],
  tacklesWon: [0, 0],
  tacklesLost: [0, 0],
  dribblesWon: [0, 0],
  dribblesLost: [0, 0],
  fouls: [0, 0],
  assists: [[], []], // player IDs
},
```

- [ ] **Step 2: Track stats in startTurn**

In `startTurn()`, after setting `this.state.turn`, add:

```javascript
this.state.stats.turns[teamId] += 1;
const carrier = Object.values(this.state.players).find(p => p.hasBall);
if (carrier) {
  this.state.stats.turnsWithBall[carrier.teamId] += 1;
}
```

- [ ] **Step 3: Track stats in resolvePassTo**

In `resolvePassTo()`:
- After `this.spendActionPoints(targetData.cost)` add: `this.state.stats.passAttempts[passer.teamId] += 1;`
- After `this.giveBallToPlayer(receiver)` (successful reception) add: `this.state.stats.passCompletions[passer.teamId] += 1;`
- After `this.moveBallToCell(targetData.x, targetData.y)` (pass to empty cell) add: `this.state.stats.passCompletions[passer.teamId] += 1;`

- [ ] **Step 4: Track stats in resolveTackleAgainst**

In `resolveTackleAgainst()`:
- After `this.giveBallToPlayer(tackler)` (tackle won) add: `this.state.stats.tacklesWon[tackler.teamId] += 1; this.state.stats.tacklesLost[carrier.teamId] += 1;`
- In the else branch (tackle lost) add: `this.state.stats.tacklesLost[tackler.teamId] += 1; this.state.stats.tacklesWon[carrier.teamId] += 1;`

- [ ] **Step 5: Track stats in resolveDribbleAgainst and add feint mechanic**

In `resolveDribbleAgainst()`:
- After `attack > defense` branch (dribble won): add `this.state.stats.dribblesWon[dribbler.teamId] += 1; this.state.stats.dribblesLost[defender.teamId] += 1;`
- In the else branch (dribble lost): add `this.state.stats.dribblesLost[dribbler.teamId] += 1; this.state.stats.dribblesWon[defender.teamId] += 1;`
- After a successful dribble, add feint activation:

```javascript
if (dribbler.abilityId === "feint" && dribbler.abilityArmed && !dribbler.abilityUsed) {
  dribbler.feintActive = true;
  this.pushLog(`${dribbler.name} активирует финт — следующий удар усилен.`);
}
```

- [ ] **Step 6: Add feint bonus to shot resolution and track shot stats**

In `resolveShotDive()`:
- After `const longShotBonus = ...` line, add:

```javascript
const feintBonus = shooter.feintActive ? 3 : 0;
```

- Modify the attack calculation to include feint:

```javascript
const attack = shooter.shot + shotRoll + surge + longShotBonus + feintBonus;
```

- After calculating attack, add feint consumption:

```javascript
if (feintBonus > 0) {
  shooter.feintActive = false;
  this.consumeAbility(shooter);
}
```

- After `this.spendActionPoints(pending.cost)` add: `this.state.stats.shots[shooter.teamId] += 1; this.state.stats.shotsOnTarget[shooter.teamId] += 1;`
- After `scoringTeam.score += 1` add: `this.state.stats.goals[shooter.teamId] += 1;`

- [ ] **Step 7: Track assists**

In `resolveShotDive()`, before the goal check, track who last passed to the shooter. Add a `lastPasserTo` field. Actually, simpler approach — track in `resolvePassTo()`. After successful pass to a receiver, set:

```javascript
receiver.lastPasserId = passer.id;
```

Then in `resolveShotDive()`, after `scoringTeam.score += 1`:

```javascript
if (shooter.lastPasserId) {
  const assister = this.getPlayer(shooter.lastPasserId);
  if (assister && assister.teamId === shooter.teamId) {
    this.state.stats.assists[shooter.teamId].push(assister.id);
  }
}
```

- [ ] **Step 8: Clear feintActive at end of turn**

In `endTurn()`, before calling `this.startTurn()`:

```javascript
for (const player of Object.values(this.state.players)) {
  player.feintActive = false;
}
```

- [ ] **Step 9: Implement free kicks after fouls**

In `resolveSlideAgainst()`, replace the foul block (where `roll === 1`):

```javascript
if (roll === 1) {
  this.state.stats.fouls[tackler.teamId] += 1;
  this.state.selectedAction = null;
  this.pushLog(`${tackler.name} фолит в подкате! Штрафной удар для ${this.getTeam(carrier.teamId).shortName}.`);

  // Mark fouling player as suspended
  tackler.suspended = true;

  // Give ball to closest opponent to foul location
  const foulX = carrier.x;
  const foulY = carrier.y;
  const opponentTeam = this.getTeam(carrier.teamId);
  const closestOpponent = opponentTeam.rosterIds
    .map(id => this.getPlayer(id))
    .filter(p => p.x !== null)
    .sort((a, b) => manhattanDistance(a, {x: foulX, y: foulY}) - manhattanDistance(b, {x: foulX, y: foulY}))[0];

  if (closestOpponent) {
    this.giveBallToPlayer(closestOpponent);
  } else {
    this.moveBallToCell(foulX, foulY);
  }

  // Start free kick turn for opposing team
  this.startTurn(carrier.teamId, "Штрафной удар");
  return true;
}
```

- [ ] **Step 10: Clear suspended flag**

In `startTurn()`, at the beginning:

```javascript
for (const player of Object.values(this.state.players)) {
  player.suspended = false;
}
```

- [ ] **Step 11: Prevent suspended player from being selected**

In `selectPlayer()`, in the match phase section, after checking `player.teamId !== this.state.turn.activeTeam`, add:

```javascript
if (player.suspended) {
  return false;
}
```

- [ ] **Step 12: Add setMode method**

Add a new method to the class:

```javascript
setMode(mode) {
  this.state.mode = mode;
}
```

- [ ] **Step 13: Add AI level adjustment after goals**

In `resolveShotDive()`:
- After a goal is scored, add adaptive AI level logic:

```javascript
if (this.state.mode === "ai") {
  if (shooter.teamId === 0) {
    // Human scored, AI gets harder
    this.state.aiLevel = Math.min(3, this.state.aiLevel + 1);
  } else {
    // AI scored, AI gets easier
    this.state.aiLevel = Math.max(1, this.state.aiLevel - 1);
  }
}
```

- [ ] **Step 14: Add getMVP method**

```javascript
getMVP(teamId) {
  const team = this.getTeam(teamId);
  let best = null;
  let bestScore = -1;
  for (const id of team.rosterIds) {
    const goals = this.state.stats.goals[teamId]; // total for team
    const assists = this.state.stats.assists[teamId].filter(aid => aid === id).length;
    const tackles = this.state.stats.tacklesWon[teamId]; // approximate
    // Simple scoring: count player-specific stats from log
    const score = assists;
    if (score > bestScore) {
      bestScore = score;
      best = this.getPlayer(id);
    }
  }
  return best;
}
```

Actually, per-player stats tracking is cleaner. Add to `makeRuntimePlayer`:

```javascript
playerStats: { goals: 0, assists: 0, tacklesWon: 0, dribbles: 0 },
```

Then track individually:
- In `resolveShotDive()` goal: `shooter.playerStats.goals += 1;`
- In assists: `assister.playerStats.assists += 1;`
- In tackle won: `tackler.playerStats.tacklesWon += 1;`
- In dribble won: `dribbler.playerStats.dribbles += 1;`

Then `getMVP`:

```javascript
getMVP(teamId) {
  const team = this.getTeam(teamId);
  return team.rosterIds
    .map(id => this.getPlayer(id))
    .sort((a, b) => {
      const scoreA = a.playerStats.goals * 3 + a.playerStats.assists * 2 + a.playerStats.tacklesWon + a.playerStats.dribbles;
      const scoreB = b.playerStats.goals * 3 + b.playerStats.assists * 2 + b.playerStats.tacklesWon + b.playerStats.dribbles;
      return scoreB - scoreA;
    })[0] ?? null;
}
```

- [ ] **Step 15: Export SHOT_SECTORS (already exported), export opposingTeam**

Add `export` to `opposingTeam` function so AI module can use it:

```javascript
export function opposingTeam(teamId) {
  return teamId === 0 ? 1 : 0;
}
```

Also export `goalForTeam`:

```javascript
export function goalForTeam(teamId) {
  return GOALS[teamId];
}
```

- [ ] **Step 16: Run smoke test**

Run: `node scripts/smoke-test.mjs`
Expected: PASS

- [ ] **Step 17: Commit**

```bash
git add src/game.js
git commit -m "feat: add stats tracking, free kicks, feint mechanic, game mode support"
```

---

### Task 3: Audio module

**Files:**
- Create: `src/audio.js`

- [ ] **Step 1: Create audio.js with Web Audio API synthesizer**

```javascript
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ctx = null;
let muted = localStorage.getItem("footballMuted") === "true";

function ensureContext() {
  if (!ctx) {
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
}

function playTone(freq, duration, type = "sine", volume = 0.3) {
  if (muted) return;
  const c = ensureContext();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

function playNoise(duration, volume = 0.15) {
  if (muted) return;
  const c = ensureContext();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  source.connect(gain).connect(c.destination);
  source.start();
}

export const SFX = {
  diceRoll() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => playTone(800 + Math.random() * 400, 0.05, "square", 0.1), i * 60);
    }
    setTimeout(() => playTone(600, 0.12, "square", 0.2), 320);
  },

  move() {
    playTone(220, 0.08, "sine", 0.1);
  },

  pass() {
    playNoise(0.15, 0.12);
  },

  shot() {
    playTone(80, 0.25, "triangle", 0.4);
  },

  goal() {
    playTone(523, 0.2, "sine", 0.3);
    setTimeout(() => playTone(659, 0.2, "sine", 0.3), 150);
    setTimeout(() => playTone(784, 0.35, "sine", 0.35), 300);
    setTimeout(() => playNoise(0.5, 0.2), 450);
  },

  save() {
    playTone(180, 0.2, "triangle", 0.25);
    setTimeout(() => playTone(900, 0.3, "sine", 0.15), 100);
  },

  tackleWon() {
    playTone(300, 0.08, "sawtooth", 0.2);
  },

  tackleLost() {
    playTone(150, 0.15, "triangle", 0.15);
  },

  foul() {
    playTone(880, 0.15, "sine", 0.25);
    setTimeout(() => playTone(660, 0.3, "sine", 0.2), 150);
  },

  dribble() {
    playTone(400, 0.05, "sine", 0.15);
    setTimeout(() => playTone(500, 0.05, "sine", 0.15), 60);
  },

  buy() {
    playTone(1200, 0.08, "sine", 0.15);
    setTimeout(() => playTone(1600, 0.06, "sine", 0.12), 80);
  },

  turnStart() {
    playTone(440, 0.12, "sine", 0.08);
  },

  victory() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.3, "sine", 0.25), i * 180);
    });
  },
};

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem("footballMuted", muted);
  return muted;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/audio.js
git commit -m "feat: add procedural audio module with Web Audio API"
```

---

### Task 4: Animations module

**Files:**
- Create: `src/animations.js`

- [ ] **Step 1: Create animations.js**

```javascript
const ANIM_SPEED = 1; // multiplier for all durations

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms * ANIM_SPEED));
}

function getTokenElement(playerId) {
  const cell = document.querySelector(`[data-cell] .token[title]`);
  // More reliable: find by player position on board
  return null; // Will use CSS class approach instead
}

export async function animateDiceRoll(dieElements, finalValues) {
  if (!dieElements || dieElements.length < 2) return;
  const faces = [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 8; i++) {
    for (const die of dieElements) {
      die.textContent = faces[Math.floor(Math.random() * 6)];
      die.classList.add("die--rolling");
    }
    await wait(70);
  }
  dieElements[0].textContent = finalValues[0];
  dieElements[1].textContent = finalValues[1];
  for (const die of dieElements) {
    die.classList.remove("die--rolling");
    die.classList.add("die--landed");
  }
  await wait(200);
  for (const die of dieElements) {
    die.classList.remove("die--landed");
  }
}

export async function animateGoal() {
  const app = document.querySelector(".app-shell");
  if (!app) return;
  for (let i = 0; i < 3; i++) {
    app.classList.add("goal-flash");
    await wait(150);
    app.classList.remove("goal-flash");
    await wait(100);
  }
}

export async function animateTackle(cellElement) {
  if (!cellElement) return;
  cellElement.classList.add("cell--clash");
  await wait(200);
  cellElement.classList.remove("cell--clash");
}

export async function animateSlide(cellElement) {
  if (!cellElement) return;
  cellElement.classList.add("cell--slide-anim");
  await wait(250);
  cellElement.classList.remove("cell--slide-anim");
}

export async function animatePhaseTransition() {
  const app = document.querySelector("#app");
  if (!app) return;
  app.classList.add("phase-fade");
  await wait(300);
  app.classList.remove("phase-fade");
}

export async function animateBallFlight(fromCell, toCell) {
  // Create a temporary ball element for flight animation
  const pitchGrid = document.querySelector(".pitch-grid");
  if (!pitchGrid || !fromCell || !toCell) return;

  const fromRect = fromCell.getBoundingClientRect();
  const toRect = toCell.getBoundingClientRect();
  const gridRect = pitchGrid.getBoundingClientRect();

  const ball = document.createElement("div");
  ball.className = "ball-flight";
  ball.style.cssText = `
    position: absolute;
    width: 10px;
    height: 10px;
    background: #f8f5ed;
    border-radius: 50%;
    border: 1px solid #111820;
    z-index: 100;
    pointer-events: none;
    left: ${fromRect.left - gridRect.left + fromRect.width / 2 - 5}px;
    top: ${fromRect.top - gridRect.top + fromRect.height / 2 - 5}px;
    transition: left 0.3s ease-out, top 0.3s ease-out;
  `;
  pitchGrid.style.position = "relative";
  pitchGrid.appendChild(ball);

  // Trigger transition
  requestAnimationFrame(() => {
    ball.style.left = `${toRect.left - gridRect.left + toRect.width / 2 - 5}px`;
    ball.style.top = `${toRect.top - gridRect.top + toRect.height / 2 - 5}px`;
  });

  await wait(320);
  ball.remove();
}

export function aiDelay() {
  return wait(500 + Math.random() * 300);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/animations.js
git commit -m "feat: add animations module with dice, goal, tackle, and ball flight effects"
```

---

### Task 5: Animation CSS

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add animation keyframes and classes**

Append to `styles.css`:

```css
/* === Animations === */

.die--rolling {
  animation: dieShake 0.07s steps(2) infinite;
  background: linear-gradient(180deg, rgba(255,255,255,0.2), transparent 65%), #e8dfc9;
}

.die--landed {
  animation: dieLand 0.2s ease-out;
}

@keyframes dieShake {
  0% { transform: rotate(-5deg) scale(1.05); }
  100% { transform: rotate(5deg) scale(0.95); }
}

@keyframes dieLand {
  0% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.goal-flash {
  box-shadow: inset 0 0 0 4px var(--gold), 0 0 60px rgba(255, 212, 104, 0.3);
}

.cell--clash {
  animation: cellShake 0.2s ease-out;
}

.cell--slide-anim {
  animation: cellSlide 0.25s ease-out;
}

@keyframes cellShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}

@keyframes cellSlide {
  0% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
  100% { transform: translateY(0); }
}

.phase-fade {
  animation: fadeTransition 0.3s ease;
}

@keyframes fadeTransition {
  0% { opacity: 0.4; }
  100% { opacity: 1; }
}

/* Mute button */
.mute-btn {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 100;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--line);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 1.1rem;
}

.mute-btn:hover {
  border-color: var(--line-strong);
}

/* Tutorial overlay */
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  pointer-events: auto;
}

.tutorial-tooltip {
  max-width: 420px;
  padding: 20px 24px;
  border-radius: 18px;
  border: 2px solid rgba(255, 212, 104, 0.4);
  background: linear-gradient(135deg, rgba(255, 212, 104, 0.08), transparent 48%), rgba(9, 16, 24, 0.96);
  box-shadow: var(--shadow);
  color: var(--text);
}

.tutorial-tooltip h3 {
  margin: 0 0 8px;
  color: var(--gold);
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tutorial-tooltip p {
  margin: 0 0 16px;
  color: var(--muted);
  line-height: 1.5;
}

.tutorial-tooltip__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* Stats screen */
.stats-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(0, 0, 0, 0.7);
  display: grid;
  place-items: center;
  overflow-y: auto;
  padding: 20px;
}

.stats-panel {
  width: min(680px, 100%);
  padding: 24px;
  border-radius: 20px;
  border: 2px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 60%), var(--panel);
  box-shadow: var(--shadow);
}

.stats-panel h2 {
  text-align: center;
  margin: 0 0 20px;
}

.stats-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}

.stats-row__label {
  text-align: center;
  color: var(--muted);
  font-size: 0.82rem;
}

.stats-row__val {
  font-weight: 700;
  font-size: 1.1rem;
}

.stats-row__val--left {
  text-align: right;
}

.stats-row__val--right {
  text-align: left;
}

.stats-mvp {
  margin-top: 18px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 212, 104, 0.08);
  border: 1px solid rgba(255, 212, 104, 0.24);
  text-align: center;
}

.stats-mvp__title {
  color: var(--gold);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Mode selection */
.mode-select {
  display: grid;
  gap: 16px;
  max-width: 400px;
  margin: 0 auto;
  padding: 40px 20px;
  text-align: center;
}

.mode-select h2 {
  margin: 0 0 8px;
}

.mode-select p {
  margin: 0 0 24px;
  color: var(--muted);
}

.mode-btn {
  padding: 18px 24px;
  border-radius: 16px;
  border: 2px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 60%), var(--panel);
  color: var(--text);
  cursor: pointer;
  font-size: 1rem;
  text-align: center;
  box-shadow: var(--shadow);
}

.mode-btn:hover {
  border-color: var(--gold);
  transform: translateY(-2px);
}

.mode-btn__title {
  font-weight: 700;
  font-size: 1.15rem;
}

.mode-btn__desc {
  color: var(--muted);
  font-size: 0.84rem;
  margin-top: 6px;
}

/* Mobile responsive additions */
@media (max-width: 768px) {
  .hero-bar {
    padding: 14px 16px;
  }

  .hero-bar h1 {
    font-size: 1.1rem;
  }

  .match-sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--panel);
    border-top: 2px solid var(--line);
    border-radius: 18px 18px 0 0;
    padding: 12px;
    max-height: 45vh;
    overflow-y: auto;
    transform: translateY(calc(100% - 56px));
    transition: transform 0.3s ease;
  }

  .match-sidebar.drawer-open {
    transform: translateY(0);
  }

  .drawer-handle {
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--line-strong);
    margin: 0 auto 10px;
    cursor: pointer;
  }

  .turn-bar__metrics {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .turn-metric {
    padding: 6px 4px;
  }

  .turn-metric strong {
    font-size: 1rem;
  }

  .action-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .action-btn {
    padding: 8px 6px;
    font-size: 0.72rem;
  }

  .pitch-grid {
    padding: 4px;
    gap: 1px;
  }

  .player-card__stats li {
    font-size: 0.72rem;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add CSS for animations, stats screen, tutorial, mobile layout, mode select"
```

---

### Task 6: Tutorial module

**Files:**
- Create: `src/tutorial.js`

- [ ] **Step 1: Create tutorial.js**

```javascript
const TUTORIAL_STEPS = [
  {
    id: "draft-intro",
    trigger: (state) => state.phase === "draft" && !state.teams[0].rosterIds.length,
    title: "Драфт",
    message: "Добро пожаловать! Наберите 5 игроков в команду. Бюджет — 100 монет. Нужен ровно 1 вратарь и 4 полевых игрока. Нажмите на карточку, чтобы купить.",
  },
  {
    id: "first-buy",
    trigger: (state) => state.phase === "draft" && state.teams[0].rosterIds.length === 1 && state.draft.activeTeam === 1,
    title: "Хороший выбор!",
    message: "Теперь ходит соперник (AI подберёт карту автоматически). Драфт идёт по очереди, пока оба не наберут по 5 игроков.",
  },
  {
    id: "placement-intro",
    trigger: (state) => state.phase === "placement" && state.placement.index === 0,
    title: "Расстановка",
    message: "Расставьте игроков на своей половине поля. Вратарь ставится только в створ ворот (подсвеченная клетка). Нажмите на игрока в списке, затем на клетку.",
  },
  {
    id: "dice-intro",
    trigger: (state) => state.phase === "match" && state.turn.number === 1 && state.turn.activeTeam === 0 && !state.selectedPlayerId,
    title: "Бросок кубиков",
    message: "Каждый ход вы бросаете 2 кубика. Их сумма — ваши очки действий (ОД). Больший кубик — бонус рывка, который можно использовать один раз за ход для усиления действия.",
  },
  {
    id: "move-intro",
    trigger: (state) => state.phase === "match" && state.selectedAction === "move" && !state._tutorialShown?.move,
    title: "Перемещение",
    message: "Подсвеченные клетки показывают куда можно двигаться. Число в углу — стоимость в ОД. С мячом движение дороже (1 ОД за клетку).",
    onShow: (state) => { state._tutorialShown = state._tutorialShown || {}; state._tutorialShown.move = true; },
  },
  {
    id: "pass-intro",
    trigger: (state) => state.phase === "match" && state.selectedAction === "pass" && !state._tutorialShown?.pass,
    title: "Пас",
    message: "Выберите партнёра для передачи. Дальность зависит от стата Пас. Соперники на линии паса могут перехватить мяч.",
    onShow: (state) => { state._tutorialShown = state._tutorialShown || {}; state._tutorialShown.pass = true; },
  },
  {
    id: "tackle-intro",
    trigger: (state) => state.phase === "match" && state.selectedAction === "tackle" && !state._tutorialShown?.tackle,
    title: "Отбор",
    message: "Отбор стоит 2 ОД. Ваш стат Отбор + рывок против Дриблинга соперника + бросок кубика. Подкат — рискованнее, но не зависит от статов.",
    onShow: (state) => { state._tutorialShown = state._tutorialShown || {}; state._tutorialShown.tackle = true; },
  },
  {
    id: "shoot-intro",
    trigger: (state) => state.pendingChoice?.type === "shotAim" && !state._tutorialShown?.shoot,
    title: "Удар по воротам",
    message: "Выберите сектор: 9 зон (верх/центр/низ x лево/центр/право). Вратарь соперника выберет свой прыжок. Чем ближе к воротам — тем дешевле удар.",
    onShow: (state) => { state._tutorialShown = state._tutorialShown || {}; state._tutorialShown.shoot = true; },
  },
  {
    id: "goal-scored",
    trigger: (state) => state.phase === "match" && (state.teams[0].score === 1 || state.teams[1].score === 1) && !state._tutorialShown?.goal,
    title: "Гол!",
    message: "Отлично! Первый до 3 голов побеждает. После гола игроки возвращаются на стартовые позиции, пропустившая команда разводит мяч.",
    onShow: (state) => { state._tutorialShown = state._tutorialShown || {}; state._tutorialShown.goal = true; },
  },
];

export class Tutorial {
  constructor() {
    this.active = !localStorage.getItem("tutorialComplete");
    this.currentStep = null;
    this.dismissedIds = new Set();
  }

  isActive() {
    return this.active;
  }

  complete() {
    this.active = false;
    this.currentStep = null;
    localStorage.setItem("tutorialComplete", "true");
  }

  skip() {
    this.complete();
  }

  dismiss() {
    if (this.currentStep) {
      this.dismissedIds.add(this.currentStep.id);
      if (this.currentStep.onShow) {
        // onShow is called with game state from render
      }
      this.currentStep = null;
    }
  }

  check(gameState) {
    if (!this.active) return null;
    if (this.currentStep) return this.currentStep;

    for (const step of TUTORIAL_STEPS) {
      if (this.dismissedIds.has(step.id)) continue;
      try {
        if (step.trigger(gameState)) {
          this.currentStep = step;
          if (step.onShow) {
            step.onShow(gameState);
          }
          return step;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  renderOverlay() {
    if (!this.currentStep) return "";
    const step = this.currentStep;
    return `
      <div class="tutorial-overlay" data-tutorial-overlay>
        <div class="tutorial-tooltip">
          <h3>${step.title}</h3>
          <p>${step.message}</p>
          <div class="tutorial-tooltip__actions">
            <button class="chip" data-tutorial-skip>Пропустить обучение</button>
            <button class="chip chip--active" data-tutorial-dismiss>Понял</button>
          </div>
        </div>
      </div>
    `;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tutorial.js
git commit -m "feat: add interactive tutorial with step-by-step walkthrough"
```

---

### Task 7: AI module

**Files:**
- Create: `src/ai.js`

- [ ] **Step 1: Create ai.js with adaptive AI engine**

```javascript
import { PLAYER_CATALOG, FIELD_WIDTH, GOALS } from "./data.js";
import { manhattanDistance } from "./utils.js";

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// === DRAFT AI ===

function draftLevel1(game) {
  const teamId = game.state.draft.activeTeam;
  const legal = game.state.marketIds.filter(id => game.canBuyCard(id, teamId).ok);
  if (!legal.length) return null;
  return legal[Math.floor(Math.random() * legal.length)];
}

function statTotal(card) {
  return card.shot + card.pass + card.dribble + card.speed + card.tackle + card.goalkeeping;
}

function draftLevel2(game) {
  const teamId = game.state.draft.activeTeam;
  const legal = game.state.marketIds.filter(id => game.canBuyCard(id, teamId).ok);
  if (!legal.length) return null;
  // Pick best stat/cost ratio
  const scored = legal.map(id => {
    const card = game.getCard(id);
    return { id, score: statTotal(card) / card.cost };
  });
  scored.sort((a, b) => b.score - a.score);
  // Small randomness: pick from top 3
  const top = scored.slice(0, Math.min(3, scored.length));
  return top[Math.floor(Math.random() * top.length)].id;
}

function draftLevel3(game) {
  const teamId = game.state.draft.activeTeam;
  const legal = game.state.marketIds.filter(id => game.canBuyCard(id, teamId).ok);
  if (!legal.length) return null;

  const humanTeam = game.getTeam(0);
  const humanGK = humanTeam.rosterIds.map(id => game.getPlayer(id)).find(p => p?.position === "GK");
  const humanHasStrongGK = humanGK && humanGK.goalkeeping >= 6;

  const scored = legal.map(id => {
    const card = game.getCard(id);
    let score = statTotal(card) / card.cost;
    // Counter-draft: if human has strong GK, prefer longShot forwards
    if (humanHasStrongGK && card.abilityId === "longShot") {
      score *= 1.5;
    }
    // Prefer abilities
    if (card.abilityId) {
      score *= 1.2;
    }
    return { id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}

export function aiDraft(game) {
  const level = game.state.aiLevel;
  if (level <= 1) return draftLevel1(game);
  if (level === 2) return draftLevel2(game);
  return draftLevel3(game);
}

// === PLACEMENT AI ===

const FORMATIONS = {
  1: [ // spread
    { pos: "GK", x: 14, y: 4 },
    { pos: "DEF", x: 10, y: 2 },
    { pos: "DEF", x: 10, y: 6 },
    { pos: "MID", x: 9, y: 4 },
    { pos: "FWD", x: 8, y: 4 },
  ],
  2: [ // balanced
    { pos: "GK", x: 14, y: 4 },
    { pos: "DEF", x: 12, y: 3 },
    { pos: "DEF", x: 12, y: 5 },
    { pos: "MID", x: 10, y: 4 },
    { pos: "FWD", x: 9, y: 4 },
  ],
  3: [ // attack-optimized
    { pos: "GK", x: 14, y: 4 },
    { pos: "DEF", x: 12, y: 4 },
    { pos: "MID", x: 10, y: 3 },
    { pos: "MID", x: 10, y: 5 },
    { pos: "FWD", x: 8, y: 4 },
  ],
};

export function aiPlacement(game) {
  const teamId = game.state.draft.activeTeam ?? 1;
  const level = game.state.aiLevel;
  const formation = FORMATIONS[level] || FORMATIONS[1];
  const unplaced = game.getUnplacedPlayers(teamId);
  if (!unplaced.length) return null;

  const player = unplaced[0];
  // Find matching formation slot
  const slot = formation.find(f => f.pos === player.position);
  if (slot && game.canPlacePlayer(player, slot.x, slot.y)) {
    return { playerId: player.id, x: slot.x, y: slot.y };
  }

  // Fallback: find any valid cell
  for (let y = 0; y < 9; y++) {
    for (let x = 8; x <= 14; x++) {
      if (game.canPlacePlayer(player, x, y)) {
        return { playerId: player.id, x, y };
      }
    }
  }
  return null;
}

// === MATCH AI ===

function scoreAction(game, action, player, level) {
  const noise = level === 1 ? Math.random() * 8 : level === 2 ? Math.random() * 3 : Math.random() * 1;
  const goalX = GOALS[0].x; // AI attacks toward team 0's goal
  const distToGoal = Math.abs(goalX - player.x);

  switch (action.type) {
    case "shoot":
      return 20 + (14 - distToGoal) + player.shot + noise;

    case "pass": {
      const receiver = game.getPlayer(game.state.board[action.y]?.[action.x]);
      if (!receiver) return 5 + noise; // pass to empty
      const recvDist = Math.abs(goalX - action.x);
      const forwardBonus = recvDist < distToGoal ? 6 : 0;
      return 10 + forwardBonus + noise;
    }

    case "dribble": {
      const landing = action.landing;
      if (!landing) return 7 + noise;
      const landingDist = Math.abs(goalX - landing.x);
      return 12 + (distToGoal - landingDist) * 2 + player.dribble + noise;
    }

    case "tackle":
    case "slide":
      return 15 + player.tackle + noise;

    case "move": {
      const moveDist = Math.abs(goalX - action.x);
      const progressBonus = (distToGoal - moveDist) * 2;
      if (player.hasBall) return 8 + progressBonus + noise;
      // Move toward ball
      const ballDist = manhattanDistance(player, game.state.ball);
      const newBallDist = manhattanDistance({ x: action.x, y: action.y }, game.state.ball);
      return 4 + (ballDist - newBallDist) * 2 + noise;
    }

    default:
      return noise;
  }
}

function getAllActions(game, player) {
  const actions = [];
  const availability = game.getActionAvailability(player.id);

  if (availability.shoot) {
    actions.push({ type: "shoot" });
  }
  if (availability.pass) {
    for (const target of game.getPassTargets(player)) {
      actions.push({ type: "pass", x: target.x, y: target.y, cost: target.cost });
    }
  }
  if (availability.dribble) {
    for (const target of game.getDribbleTargets(player)) {
      actions.push({ type: "dribble", x: target.x, y: target.y, cost: target.cost, landing: target.landing });
    }
  }
  if (availability.tackle) {
    for (const target of game.getTackleTargets(player)) {
      actions.push({ type: "tackle", x: target.x, y: target.y, cost: target.cost });
    }
  }
  if (availability.slide) {
    for (const target of game.getSlideTargets(player)) {
      actions.push({ type: "slide", x: target.x, y: target.y, cost: target.cost });
    }
  }
  if (availability.move) {
    const moveTargets = game.getMoveTargets(player);
    // Limit to best 5 moves to avoid overwhelming
    const sortedMoves = moveTargets
      .map(t => ({ ...t, type: "move", score: Math.abs(GOALS[0].x - t.x) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
    actions.push(...sortedMoves);
  }

  return actions;
}

function pickShotSector(level) {
  const sectors = [
    "high-left", "high-center", "high-right",
    "mid-left", "mid-center", "mid-right",
    "low-left", "low-center", "low-right",
  ];
  if (level >= 3) {
    // Prefer corners (harder to save)
    const corners = ["high-left", "high-right", "low-left", "low-right"];
    return corners[Math.floor(Math.random() * corners.length)];
  }
  return sectors[Math.floor(Math.random() * sectors.length)];
}

function pickKeeperDive(level) {
  const sectors = [
    "high-left", "high-center", "high-right",
    "mid-left", "mid-center", "mid-right",
    "low-left", "low-center", "low-right",
  ];
  return sectors[Math.floor(Math.random() * sectors.length)];
}

export function aiChooseShotSector(game) {
  return pickShotSector(game.state.aiLevel);
}

export function aiChooseKeeperDive(game) {
  return pickKeeperDive(game.state.aiLevel);
}

export function aiChooseBounce(game) {
  const pending = game.state.pendingChoice;
  if (!pending || pending.type !== "bounce") return null;
  // Pick bounce cell farthest from AI's goal
  const options = pending.options;
  if (!options.length) return null;
  const sorted = [...options].sort((a, b) =>
    Math.abs(GOALS[0].x - b.x) - Math.abs(GOALS[0].x - a.x)
  );
  return sorted[0];
}

export function aiTurn(game) {
  // Returns a sequence of actions to execute with delays
  const teamId = 1; // AI is always team 1
  const level = game.state.aiLevel;
  const team = game.getTeam(teamId);
  const actions = [];

  // Level 3: arm surge for shooting/tackling
  if (level >= 3 && game.canUseSurge()) {
    actions.push({ type: "armSurge" });
  }

  // Level 3: arm abilities
  if (level >= 3) {
    for (const id of team.rosterIds) {
      const p = game.getPlayer(id);
      if (p.abilityId && !p.abilityUsed && !p.abilityArmed) {
        actions.push({ type: "armAbility", playerId: id });
      }
    }
  }

  // Select best player to act with
  let bestAction = null;
  let bestScore = -Infinity;
  let bestPlayer = null;

  for (const id of team.rosterIds) {
    const player = game.getPlayer(id);
    if (!player || player.x === null || player.suspended) continue;

    const playerActions = getAllActions(game, player);
    for (const action of playerActions) {
      const score = scoreAction(game, action, player, level);
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
        bestPlayer = player;
      }
    }
  }

  if (!bestPlayer || !bestAction) {
    return [{ type: "endTurn" }];
  }

  actions.push({ type: "selectPlayer", playerId: bestPlayer.id });
  actions.push(bestAction);

  // If still have AP after action, try one more action (simple)
  // For simplicity, just do one action per AI "step", then re-evaluate
  return actions;
}

export function executeAiAction(game, action) {
  switch (action.type) {
    case "selectPlayer":
      return game.selectPlayer(action.playerId);
    case "armSurge":
      return game.toggleSurge();
    case "armAbility":
      return game.toggleAbility(action.playerId);
    case "move":
      game.setAction("move");
      return game.clickCell(action.x, action.y);
    case "pass":
      game.setAction("pass");
      return game.clickCell(action.x, action.y);
    case "tackle":
      game.setAction("tackle");
      return game.clickCell(action.x, action.y);
    case "slide":
      game.setAction("slide");
      return game.clickCell(action.x, action.y);
    case "dribble":
      game.setAction("dribble");
      return game.clickCell(action.x, action.y);
    case "shoot":
      game.setAction("shoot");
      return true; // Shot aim will be handled by pending choice
    case "endTurn":
      return game.endTurn("AI завершает ход.");
    default:
      return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ai.js
git commit -m "feat: add adaptive AI with 3-level difficulty and draft/placement/match logic"
```

---

### Task 8: UI updates — mode select, stats screen, tutorial, mute button, mobile drawer

**Files:**
- Modify: `src/ui.js`

- [ ] **Step 1: Add imports**

At the top of `ui.js`, add:

```javascript
import { isMuted } from "./audio.js";
```

- [ ] **Step 2: Add mode selection screen renderer**

Add function before `renderDraftLayout`:

```javascript
function renderModeSelect() {
  return `
    <main class="mode-select">
      <h2>Пошаговый футбол</h2>
      <p>Выберите режим игры</p>
      <button class="mode-btn" data-mode="ai">
        <div class="mode-btn__title">Против AI</div>
        <div class="mode-btn__desc">Адаптивный соперник — становится сильнее, если вы ведёте в счёте</div>
      </button>
      <button class="mode-btn" data-mode="hotseat">
        <div class="mode-btn__title">Вдвоём на одном экране</div>
        <div class="mode-btn__desc">Классический hot-seat — передавайте ход по очереди</div>
      </button>
    </main>
  `;
}
```

- [ ] **Step 3: Add stats screen renderer**

Add function:

```javascript
function renderStatsScreen(game) {
  const stats = game.state.stats;
  const t0 = game.getTeam(0);
  const t1 = game.getTeam(1);
  const totalTurns = stats.turns[0] + stats.turns[1];
  const poss0 = totalTurns ? Math.round((stats.turnsWithBall[0] / totalTurns) * 100) : 50;
  const poss1 = 100 - poss0;
  const passAcc0 = stats.passAttempts[0] ? Math.round((stats.passCompletions[0] / stats.passAttempts[0]) * 100) : 0;
  const passAcc1 = stats.passAttempts[1] ? Math.round((stats.passCompletions[1] / stats.passAttempts[1]) * 100) : 0;
  const mvp0 = game.getMVP(0);
  const mvp1 = game.getMVP(1);

  function row(label, v0, v1) {
    return \`
      <div class="stats-row">
        <div class="stats-row__val stats-row__val--left">\${v0}</div>
        <div class="stats-row__label">\${label}</div>
        <div class="stats-row__val stats-row__val--right">\${v1}</div>
      </div>
    \`;
  }

  return \`
    <div class="stats-overlay" data-stats-overlay>
      <div class="stats-panel">
        <div class="panel-card__eyebrow" style="text-align:center">Статистика матча</div>
        <h2>\${t0.score} : \${t1.score}</h2>
        <p style="text-align:center;color:var(--muted);margin:0 0 16px">\${escapeHtml(t0.name)} — \${escapeHtml(t1.name)}</p>
        \${row("Владение %", poss0 + "%", poss1 + "%")}
        \${row("Удары", stats.shots[0], stats.shots[1])}
        \${row("В створ", stats.shotsOnTarget[0], stats.shotsOnTarget[1])}
        \${row("Голы", stats.goals[0], stats.goals[1])}
        \${row("Передачи", stats.passCompletions[0] + "/" + stats.passAttempts[0], stats.passCompletions[1] + "/" + stats.passAttempts[1])}
        \${row("Точность пасов", passAcc0 + "%", passAcc1 + "%")}
        \${row("Отборы", stats.tacklesWon[0], stats.tacklesWon[1])}
        \${row("Дриблинг", stats.dribblesWon[0], stats.dribblesWon[1])}
        \${row("Фолы", stats.fouls[0], stats.fouls[1])}
        <div class="stats-mvp">
          <div class="stats-mvp__title">MVP</div>
          <p>\${escapeHtml(t0.shortName)}: \${mvp0 ? escapeHtml(mvp0.name) : "—"} | \${escapeHtml(t1.shortName)}: \${mvp1 ? escapeHtml(mvp1.name) : "—"}</p>
        </div>
        <div style="text-align:center;margin-top:18px">
          <button class="chip chip--active" data-reset>Новый матч</button>
        </div>
      </div>
    </div>
  \`;
}
```

- [ ] **Step 4: Add mute button renderer**

Add function:

```javascript
function renderMuteButton() {
  return \`<button class="mute-btn" data-mute-toggle title="Звук">\${isMuted() ? "🔇" : "🔊"}</button>\`;
}
```

- [ ] **Step 5: Update renderApp to include mode select, stats, mute, tutorial**

Modify the `renderApp` export function:

```javascript
export function renderApp(root, game, { tutorial = null } = {}) {
  // Mode selection screen
  if (game.state.phase === "modeSelect") {
    root.innerHTML = renderModeSelect();
    return;
  }

  const tutorialHtml = tutorial?.renderOverlay() ?? "";
  const statsHtml = game.state.phase === "ended" ? renderStatsScreen(game) : "";

  root.innerHTML = \`
    \${renderMuteButton()}
    <div class="app-shell app-shell--\${game.state.phase}">
      \${renderHeroBar(game)}
      \${renderTeamStrip(game)}
      \${renderLayoutByPhase(game)}
    </div>
    \${statsHtml}
    \${tutorialHtml}
  \`;
}
```

- [ ] **Step 6: Add mobile drawer handle to match sidebar**

In `renderMatchLayout`, add drawer handle for mobile at the start of the aside:

```javascript
<aside class="match-sidebar">
  <div class="drawer-handle" data-drawer-toggle></div>
  ${renderSelectedPanel(game)}
  ${game.state.phase === "match" ? renderActionPanel(game) : renderEndSummary(game)}
</aside>
```

- [ ] **Step 7: Commit**

```bash
git add src/ui.js
git commit -m "feat: update UI with mode select, stats screen, tutorial overlay, mute button, mobile drawer"
```

---

### Task 9: Main.js — wire everything together

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Rewrite main.js to integrate all modules**

```javascript
import { renderApp } from "./ui.js";
import { FootballTurnGame } from "./game.js";
import { SFX, toggleMute } from "./audio.js";
import { animateDiceRoll, animateGoal, animateTackle, animatePhaseTransition, aiDelay } from "./animations.js";
import { Tutorial } from "./tutorial.js";
import { aiDraft, aiPlacement, aiTurn, executeAiAction, aiChooseShotSector, aiChooseKeeperDive, aiChooseBounce } from "./ai.js";

const root = document.querySelector("#app");
const game = new FootballTurnGame();
const tutorial = new Tutorial();
let aiRunning = false;

// Start with mode selection
game.state.phase = "modeSelect";

function render() {
  renderApp(root, game, { tutorial });
}

window.__footballDebug = {
  game,
  render,
  tutorial,
};

async function runAiDraft() {
  if (game.state.mode !== "ai" || game.state.draft.activeTeam !== 1) return;
  if (game.state.phase !== "draft") return;
  aiRunning = true;

  await aiDelay();
  const cardId = aiDraft(game);
  if (cardId) {
    SFX.buy();
    game.buyCard(cardId);
  }

  aiRunning = false;
  render();

  // If still AI's turn (shouldn't be normally due to alternation, but check)
  if (game.state.phase === "draft" && game.state.draft.activeTeam === 1) {
    runAiDraft();
  }
  // If draft finished, check if AI needs to place
  if (game.state.phase === "placement") {
    await animatePhaseTransition();
    render();
    checkAiPlacement();
  }
}

async function checkAiPlacement() {
  const teamId = game.state.placement.teamOrder[game.state.placement.index];
  if (game.state.mode !== "ai" || teamId !== 1) return;
  if (game.state.phase !== "placement") return;

  aiRunning = true;
  while (game.state.phase === "placement") {
    const currentTeam = game.state.placement.teamOrder[game.state.placement.index];
    if (currentTeam !== 1) break;

    await aiDelay();
    const placement = aiPlacement(game);
    if (placement) {
      game.state.placement.selectedPlayerId = placement.playerId;
      game.clickCell(placement.x, placement.y);
      render();
    } else {
      break;
    }
  }
  aiRunning = false;

  if (game.state.phase === "match") {
    await animatePhaseTransition();
    SFX.turnStart();
  }
  render();
  checkAiTurn();
}

async function checkAiTurn() {
  if (game.state.mode !== "ai" || game.state.turn.activeTeam !== 1) return;
  if (game.state.phase !== "match") return;

  aiRunning = true;
  let actionCount = 0;
  const maxActions = 8; // safety limit

  while (game.state.phase === "match" && game.state.turn.activeTeam === 1 && actionCount < maxActions) {
    // Handle pending choices first
    if (game.state.pendingChoice?.type === "shotAim") {
      await aiDelay();
      const sector = aiChooseShotSector(game);
      game.chooseShotAim(sector);
      render();
      continue;
    }
    if (game.state.pendingChoice?.type === "keeperDive") {
      await aiDelay();
      const sector = aiChooseKeeperDive(game);
      const keeper = game.getPlayer(game.state.pendingChoice.keeperId);
      const useAbility = keeper?.abilityId === "catReflexes" && !keeper?.abilityUsed;
      const prevScore0 = game.getTeam(0).score;
      const prevScore1 = game.getTeam(1).score;
      game.resolveShotDive(sector, useAbility);
      render();

      if (game.getTeam(0).score > prevScore0 || game.getTeam(1).score > prevScore1) {
        SFX.goal();
        await animateGoal();
        render();
      }
      continue;
    }
    if (game.state.pendingChoice?.type === "bounce") {
      await aiDelay();
      const bounce = aiChooseBounce(game);
      if (bounce) {
        game.clickCell(bounce.x, bounce.y);
      }
      render();
      continue;
    }

    // Get AI actions
    const actions = aiTurn(game);
    if (!actions.length || (actions.length === 1 && actions[0].type === "endTurn")) {
      await aiDelay();
      game.endTurn("AI завершает ход.");
      SFX.turnStart();
      render();
      break;
    }

    for (const action of actions) {
      await aiDelay();

      const prevScore0 = game.getTeam(0).score;
      const prevScore1 = game.getTeam(1).score;

      if (action.type === "tackle" || action.type === "slide") {
        executeAiAction(game, action);
        SFX.tackleWon();
      } else if (action.type === "pass") {
        executeAiAction(game, action);
        SFX.pass();
      } else if (action.type === "move") {
        executeAiAction(game, action);
        SFX.move();
      } else if (action.type === "dribble") {
        executeAiAction(game, action);
        SFX.dribble();
      } else {
        executeAiAction(game, action);
      }
      render();

      // Check for goal after any action
      if (game.getTeam(0).score > prevScore0 || game.getTeam(1).score > prevScore1) {
        SFX.goal();
        await animateGoal();
        render();
      }

      actionCount++;
    }

    // If no AP left, end turn
    if (game.state.turn.actionPoints <= 0 && game.state.turn.activeTeam === 1) {
      await aiDelay();
      game.endTurn("AI завершает ход.");
      SFX.turnStart();
      render();
      break;
    }
  }

  aiRunning = false;
  render();
}

// Human keeper dive when AI shoots
function handleHumanKeeperDive(sector) {
  if (game.state.pendingChoice?.type !== "keeperDive") return;
  const keeper = game.getPlayer(game.state.pendingChoice.keeperId);
  const useAbility = keeper?.abilityArmed && !keeper?.abilityUsed;
  const prevScore0 = game.getTeam(0).score;
  const prevScore1 = game.getTeam(1).score;
  game.resolveShotDive(sector, useAbility);
  render();

  if (game.getTeam(0).score > prevScore0 || game.getTeam(1).score > prevScore1) {
    SFX.goal();
    animateGoal().then(() => render());
  }

  // After human keeper action, AI continues
  if (game.state.turn.activeTeam === 1 && game.state.mode === "ai") {
    setTimeout(() => checkAiTurn(), 600);
  }
}

root.addEventListener("click", (event) => {
  // Prevent interaction during AI turn
  if (aiRunning) return;

  // Mode selection
  const modeBtn = event.target.closest("[data-mode]");
  if (modeBtn) {
    const mode = modeBtn.dataset.mode;
    game.state.phase = "draft";
    game.state.mode = mode;
    if (mode === "ai" && tutorial.isActive()) {
      // Tutorial forces AI mode
    }
    SFX.turnStart();
    render();
    return;
  }

  // Mute toggle
  const muteBtn = event.target.closest("[data-mute-toggle]");
  if (muteBtn) {
    toggleMute();
    render();
    return;
  }

  // Tutorial handlers
  const tutorialDismiss = event.target.closest("[data-tutorial-dismiss]");
  if (tutorialDismiss) {
    tutorial.dismiss();
    render();
    return;
  }
  const tutorialSkip = event.target.closest("[data-tutorial-skip]");
  if (tutorialSkip) {
    tutorial.skip();
    render();
    return;
  }

  // Mobile drawer toggle
  const drawerToggle = event.target.closest("[data-drawer-toggle]");
  if (drawerToggle) {
    const sidebar = document.querySelector(".match-sidebar");
    if (sidebar) {
      sidebar.classList.toggle("drawer-open");
    }
    return;
  }

  // Stats overlay close on background click
  const statsOverlay = event.target.closest("[data-stats-overlay]");
  if (statsOverlay && event.target === statsOverlay) {
    statsOverlay.remove();
    return;
  }

  // Reset
  const resetButton = event.target.closest("[data-reset]");
  if (resetButton) {
    game.reset();
    game.state.phase = "modeSelect";
    render();
    return;
  }

  // Draft buy
  const buyCardButton = event.target.closest("[data-player-card]");
  if (buyCardButton && game.state.phase === "draft") {
    SFX.buy();
    game.buyCard(buyCardButton.dataset.playerCard);
    render();

    // After human buys, check if AI needs to draft
    if (game.state.phase === "draft" && game.state.draft.activeTeam === 1 && game.state.mode === "ai") {
      setTimeout(() => runAiDraft(), 300);
    }
    // If draft finished
    if (game.state.phase === "placement") {
      animatePhaseTransition();
      render();
      setTimeout(() => checkAiPlacement(), 300);
    }
    return;
  }

  // Ability toggle
  const abilityToggle = event.target.closest("[data-ability-toggle]");
  if (abilityToggle) {
    game.toggleAbility(abilityToggle.dataset.abilityToggle);
    render();
    return;
  }

  // Surge toggle
  const surgeToggle = event.target.closest("[data-surge-toggle]");
  if (surgeToggle) {
    game.toggleSurge();
    render();
    return;
  }

  // End turn
  const endTurn = event.target.closest("[data-end-turn]");
  if (endTurn) {
    game.endTurn("Игрок добровольно завершает атаку.");
    SFX.turnStart();
    render();
    // Trigger AI turn
    if (game.state.mode === "ai" && game.state.turn.activeTeam === 1) {
      setTimeout(() => checkAiTurn(), 400);
    }
    return;
  }

  // Action buttons
  const actionButton = event.target.closest("[data-action-set]");
  if (actionButton) {
    const action = actionButton.dataset.actionSet;
    if (game.state.selectedAction === action && game.state.pendingChoice?.type !== "keeperDive") {
      game.clearAction();
    } else {
      game.setAction(action);
      if (action === "shoot") SFX.shot();
    }
    render();
    return;
  }

  // Shot sector
  const shotSector = event.target.closest("[data-shot-sector]");
  if (shotSector) {
    if (game.state.pendingChoice?.type === "shotAim") {
      game.chooseShotAim(shotSector.dataset.shotSector);
      render();

      // If AI needs to dive (human shot at AI keeper)
      if (game.state.mode === "ai" && game.state.pendingChoice?.type === "keeperDive" && game.getPlayer(game.state.pendingChoice.keeperId)?.teamId === 1) {
        setTimeout(async () => {
          const sector = aiChooseKeeperDive(game);
          const keeper = game.getPlayer(game.state.pendingChoice.keeperId);
          const useAbility = keeper?.abilityId === "catReflexes" && !keeper?.abilityUsed;
          const prevScore0 = game.getTeam(0).score;
          game.resolveShotDive(sector, useAbility);
          render();
          if (game.getTeam(0).score > prevScore0) {
            SFX.goal();
            await animateGoal();
            render();
          } else {
            SFX.save();
          }
          // After save, AI starts counter
          if (game.state.turn.activeTeam === 1 && game.state.mode === "ai") {
            setTimeout(() => checkAiTurn(), 600);
          }
        }, 800);
      }
    } else if (game.state.pendingChoice?.type === "keeperDive") {
      // Human keeper diving against AI shot
      handleHumanKeeperDive(shotSector.dataset.shotSector);
    }
    return;
  }

  // Cell clicks
  const cell = event.target.closest("[data-cell]");
  if (cell) {
    const [x, y] = cell.dataset.cell.split(":").map(Number);
    const prevPhase = game.state.phase;
    const prevAction = game.state.selectedAction;
    const prevScore0 = game.getTeam(0).score;
    const prevScore1 = game.getTeam(1).score;

    game.clickCell(x, y);

    // Play sounds based on action
    if (prevAction === "move") SFX.move();
    if (prevAction === "pass") SFX.pass();
    if (prevAction === "tackle") SFX.tackleWon();
    if (prevAction === "slide") SFX.tackleWon();
    if (prevAction === "dribble") SFX.dribble();

    render();

    // Check phase transition
    if (game.state.phase !== prevPhase && game.state.phase === "match") {
      animatePhaseTransition();
      SFX.turnStart();
      render();
    }

    // Check placement for AI
    if (game.state.phase === "placement" && game.state.mode === "ai") {
      const teamId = game.state.placement.teamOrder[game.state.placement.index];
      if (teamId === 1) {
        setTimeout(() => checkAiPlacement(), 300);
      }
    }

    // AI turn after match start
    if (game.state.phase === "match" && game.state.mode === "ai" && game.state.turn.activeTeam === 1) {
      setTimeout(() => checkAiTurn(), 400);
    }

    return;
  }

  // Roster card selection (placement / match)
  const rosterCard = event.target.closest("[data-player-card]");
  if (rosterCard) {
    game.selectPlayer(rosterCard.dataset.playerCard);
    render();
  }
});

// Check tutorial on each render
const originalRender = render;

render();
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: wire AI, audio, animations, tutorial into main game loop"
```

---

### Task 10: Update index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: No changes needed**

The current `index.html` is already minimal and correct. The mute button and tutorial overlay are rendered dynamically by `ui.js`. No structural HTML changes required.

- [ ] **Step 2: Commit (skip — no changes)**

---

### Task 11: Update smoke test

**Files:**
- Modify: `scripts/smoke-test.mjs`

- [ ] **Step 1: Add tests for new features**

Add to the end of `scripts/smoke-test.mjs`, before the final `console.log`:

```javascript
// --- Test stats tracking ---
assert.ok(game.state.stats, "Stats object should exist");
assert.equal(game.state.stats.goals[0], 1, "Team 0 should have 1 goal in stats");
assert.ok(game.state.stats.shots[0] >= 1, "Team 0 should have at least 1 shot");
assert.ok(game.state.stats.passAttempts[0] >= 1, "Team 0 should have at least 1 pass attempt");

// --- Test feint ability exists ---
import { ABILITIES } from "../src/data.js";
assert.ok(ABILITIES.feint, "Feint ability should exist in registry");
assert.equal(ABILITIES.feint.label, "Финт", "Feint label should be correct");

// --- Test Stinger has feint ---
import { PLAYER_CATALOG } from "../src/data.js";
const stinger = PLAYER_CATALOG.find(p => p.id === "fwd-sergey-stinger");
assert.equal(stinger.abilityId, "feint", "Stinger should have feint ability");
assert.equal(stinger.shot, 6, "Stinger shot should be 6 after nerf");

// --- Test free kick (foul in slide) ---
const game2 = new FootballTurnGame();
// Quick draft
const draft2 = [
  "gk-denis-barierov", "mid-yaroslav-dirizher", "mid-timur-tempo",
  "fwd-viktor-obvod", "def-kirill-polev", "def-maksim-zubov",
  "fwd-anton-vyvorot", "gk-semyon-shchitov", "def-egor-hardov", "mid-lev-ritmov",
];
game2.setDebugRollQueue([6, 4, 6, 6, 6]);
for (const cardId of draft2) game2.buyCard(cardId);

// Place all
const placements2 = [[0,4],[5,4],[3,2],[6,4],[2,6],[9,4],[10,2],[11,6],[14,4],[8,5]];
for (const [x, y] of placements2) game2.clickCell(x, y);

// Set up slide foul scenario
const tackler2 = game2.getPlayer("def-maksim-zubov");
const carrier2 = game2.getPlayer("fwd-anton-vyvorot");
game2.giveBallToPlayer(carrier2);
game2.placeOnBoard(tackler2, 7, 4);
game2.placeOnBoard(carrier2, 8, 4);
game2.state.selectedPlayerId = tackler2.id;
game2.state.turn.activeTeam = tackler2.teamId;
game2.state.turn.actionPoints = 10;

// Force foul roll
game2.setDebugRollQueue([1]);
game2.setAction("slide");
game2.clickCell(8, 4);

// After foul: turn should switch, tackler should be suspended
assert.equal(tackler2.suspended, false, "Suspended should be cleared by startTurn");
// The turn should have switched to the carrier's team
assert.equal(game2.state.stats.fouls[tackler2.teamId], 1, "Foul should be tracked in stats");

// --- Test mode field ---
assert.equal(game2.state.mode, "hotseat", "Default mode should be hotseat");

// --- Test MVP ---
const mvp = game2.getMVP(0);
assert.ok(mvp, "MVP should return a player");

console.log("  new features: ok");
```

- [ ] **Step 2: Run the updated smoke test**

Run: `node scripts/smoke-test.mjs`
Expected: PASS with both "smoke-test: ok" and "new features: ok"

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-test.mjs
git commit -m "test: add tests for stats, feint ability, free kicks, and MVP"
```

---

### Task 12: Integration test — play a full AI game via Playwright

**Files:**
- Modify: `scripts/layout-snapshots.mjs` (or add a new test)

- [ ] **Step 1: Verify the game loads and mode select works**

Start the dev server and open in browser to manually verify:
- Mode select screen shows on load
- "Против AI" button starts draft
- AI drafts its team
- Placement works for both teams
- Match plays with AI making moves
- Stats screen shows after game ends
- Sound effects play
- Tutorial tooltips appear on first game
- Mute button works

Run: `python3 -m http.server 8080 --directory /home/dilp79/apps/2Games/FootballTurnBased &` then visit `http://localhost:8080`

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "feat: complete game upgrade — AI opponent, sounds, stats, tutorial, feint, free kicks"
```
