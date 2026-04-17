import { renderApp } from "./ui.js";
import { FootballTurnGame } from "./game.js";
import {
  chooseAiBounce,
  chooseAiKeeperDive,
  chooseAiShotSector,
  executeAiAction,
  pickAiDraftCard,
  pickAiPlacement,
  planAiMatchStep,
  shouldAiUseKeeperAbility,
} from "./ai.js";
import {
  animateBallTravel,
  animateBuy,
  animateClash,
  animateGoal,
  animateMove,
  animatePhase,
  animatePlacement,
  animateTurnStart,
} from "./animations.js";
import { audio } from "./audio.js";
import { Tutorial } from "./tutorial.js";

const root = document.querySelector("#app");
const game = new FootballTurnGame();
const tutorial = new Tutorial();
const AI_STEP_DELAY_MS = 420;

let aiTimerId = null;
let aiInProgress = false;
let fxInProgress = false;

function shouldAiAct() {
  return game.isAiControlledTeam(game.getDecisionTeamId());
}

function isTutorialBlocking() {
  return tutorial.hasOpenStep();
}

function syncTutorialState() {
  if (tutorial.isActive() && game.state.mode !== "ai") {
    game.setMode("ai");
  }
  tutorial.check(game.state);
}

function clearAiTimer() {
  if (aiTimerId !== null) {
    window.clearTimeout(aiTimerId);
    aiTimerId = null;
  }
}

function scheduleAiStep(delay = AI_STEP_DELAY_MS) {
  clearAiTimer();
  if (!shouldAiAct() || isTutorialBlocking()) {
    return;
  }
  aiTimerId = window.setTimeout(() => {
    void runAiStep();
  }, delay);
}

function render({ scheduleAi = true, aiDelay = AI_STEP_DELAY_MS } = {}) {
  syncTutorialState();
  renderApp(root, game, {
    aiThinking: aiInProgress || shouldAiAct() || fxInProgress,
    audioMuted: audio.isMuted(),
    tutorial,
  });
  if (scheduleAi) {
    scheduleAiStep(aiDelay);
  }
}

function normalizeResult(result) {
  if (result && typeof result === "object" && "ok" in result) {
    return Boolean(result.ok);
  }
  return Boolean(result);
}

function snapshotPendingChoice(pendingChoice) {
  if (!pendingChoice) {
    return null;
  }
  return {
    type: pendingChoice.type,
    playerId: pendingChoice.playerId ?? null,
    keeperId: pendingChoice.keeperId ?? null,
    sector: pendingChoice.sector ?? null,
    actorTeam: pendingChoice.actorTeam ?? null,
  };
}

function captureState() {
  return {
    phase: game.state.phase,
    turn: {
      activeTeam: game.state.turn.activeTeam,
      number: game.state.turn.number,
      dice: [...game.state.turn.dice],
    },
    pendingChoice: snapshotPendingChoice(game.state.pendingChoice),
    ball: { ...game.state.ball },
    scores: game.state.teams.map((team) => team.score),
    freeKick: game.state.freeKick ? { ...game.state.freeKick } : null,
    selectedPlayerId: game.state.selectedPlayerId,
    selectedAction: game.state.selectedAction,
    players: Object.fromEntries(
      Object.values(game.state.players).map((player) => [
        player.id,
        {
          x: player.x,
          y: player.y,
          hasBall: player.hasBall,
          suspended: player.suspended,
        },
      ]),
    ),
  };
}

function getSnapshotPlayerPosition(snapshot, playerId) {
  if (!playerId) {
    return null;
  }
  const player = snapshot.players[playerId];
  if (!player || player.x === null || player.y === null) {
    return null;
  }
  return { x: player.x, y: player.y };
}

function getLivePlayerPosition(playerId) {
  const player = game.getPlayer(playerId);
  if (!player || player.x === null || player.y === null) {
    return null;
  }
  return { x: player.x, y: player.y };
}

function didScoresChange(before, after) {
  return before.scores.some((score, index) => score !== after.scores[index]);
}

function didPhaseChange(before, after) {
  return before.phase !== after.phase;
}

function didTurnAdvance(before, after) {
  if (after.phase !== "match") {
    return false;
  }
  return (
    before.phase !== after.phase ||
    before.turn.activeTeam !== after.turn.activeTeam ||
    before.turn.number !== after.turn.number ||
    before.turn.dice[0] !== after.turn.dice[0] ||
    before.turn.dice[1] !== after.turn.dice[1]
  );
}

function getShotTargetCell(before) {
  const pendingChoice = before.pendingChoice;
  if (pendingChoice?.type !== "keeperDive") {
    return null;
  }

  const shooter = game.getPlayer(pendingChoice.playerId);
  if (!shooter) {
    return null;
  }

  const [vertical] = (pendingChoice.sector ?? "mid-center").split("-");
  const goalYBySector = {
    high: 1,
    mid: 4,
    low: 7,
  };

  return {
    x: shooter.teamId === 0 ? 14 : 0,
    y: goalYBySector[vertical] ?? 4,
  };
}

async function playFeedback(meta, before, after, success) {
  if (!success) {
    return 0;
  }

  let totalDuration = 0;

  if (meta.type === "buy") {
    audio.buy();
    totalDuration += await animateBuy(root);
  }

  if (meta.type === "placement" && meta.to) {
    totalDuration += await animatePlacement(root, meta.to);
  }

  if (meta.type === "move" && meta.from && meta.to) {
    audio.move();
    totalDuration += await animateMove(root, meta.from, meta.to);
  }

  if (meta.type === "pass" && meta.from && meta.to) {
    audio.pass();
    totalDuration += await animateBallTravel(root, meta.from, meta.to);
  }

  if ((meta.type === "tackle" || meta.type === "slide") && meta.from && meta.to) {
    const foul = Boolean(after.freeKick && !before.freeKick);
    totalDuration += await animateClash(root, [meta.from, meta.to], { foul });
    if (foul) {
      audio.foul();
    } else if (after.ball.carrierId === meta.actorId) {
      audio.tackleWon();
    } else {
      audio.tackleLost();
    }
  }

  if (meta.type === "dribble" && meta.from && meta.to) {
    totalDuration += await animateClash(root, [meta.from, meta.to]);
    if (after.ball.carrierId === meta.actorId) {
      audio.dribble();
      const nextPosition = getSnapshotPlayerPosition(after, meta.actorId);
      if (nextPosition) {
        totalDuration += await animateMove(root, meta.from, nextPosition);
      }
    } else {
      audio.tackleLost();
    }
  }

  if (meta.type === "keeperDive") {
    const from = getSnapshotPlayerPosition(before, before.pendingChoice?.playerId);
    const to = getShotTargetCell(before);
    audio.shot();
    if (from && to) {
      totalDuration += await animateBallTravel(root, from, to, { shot: true });
    }

    if (didScoresChange(before, after)) {
      audio.goal();
      totalDuration += await animateGoal(root);
      if (after.phase === "ended") {
        audio.matchEnd();
      }
    } else {
      audio.save();
    }
  }

  if (didPhaseChange(before, after)) {
    audio.phase();
    totalDuration += await animatePhase(root);
  }

  if (didTurnAdvance(before, after)) {
    audio.turnStart();
    totalDuration += await animateTurnStart(root);
  }

  return totalDuration;
}

async function applyMutation(meta, mutate, { scheduleAfter = true } = {}) {
  clearAiTimer();
  const before = captureState();
  const result = mutate();
  const success = normalizeResult(result);

  render({ scheduleAi: false });

  const after = captureState();
  let effectDelay = 0;

  if (success) {
    fxInProgress = true;
    effectDelay = await playFeedback(meta, before, after, success);
    fxInProgress = false;
  }

  render({
    scheduleAi: scheduleAfter,
    aiDelay: AI_STEP_DELAY_MS + effectDelay,
  });

  return success;
}

function isUiLocked() {
  return aiInProgress || shouldAiAct() || fxInProgress || isTutorialBlocking();
}

function buildCellActionMeta(x, y) {
  const action = game.state.selectedAction;
  const actorId = game.state.selectedPlayerId;
  const from = getLivePlayerPosition(actorId);

  if (game.state.phase === "placement") {
    return {
      type: "placement",
      actorId: game.state.placement.selectedPlayerId,
      to: { x, y },
    };
  }

  return {
    type: action ?? "select",
    actorId,
    from,
    to: { x, y },
  };
}

function buildAiActionMeta(action) {
  const actorId = action.playerId ?? game.state.selectedPlayerId;
  return {
    type: action.type,
    actorId,
    from: getLivePlayerPosition(actorId),
    to:
      action.x !== undefined && action.y !== undefined
        ? { x: action.x, y: action.y }
        : null,
  };
}

async function performAiDraft() {
  const cardId = pickAiDraftCard(game);
  if (!cardId) {
    return false;
  }
  return applyMutation(
    { type: "buy", cardId },
    () => game.buyCard(cardId),
    { scheduleAfter: false },
  );
}

async function performAiPlacement() {
  const placement = pickAiPlacement(game);
  if (!placement) {
    return false;
  }
  game.state.placement.selectedPlayerId = placement.playerId;
  return applyMutation(
    {
      type: "placement",
      actorId: placement.playerId,
      to: { x: placement.x, y: placement.y },
    },
    () => game.clickCell(placement.x, placement.y),
    { scheduleAfter: false },
  );
}

async function performAiMatchStep() {
  if (game.state.pendingChoice?.type === "shotAim") {
    return applyMutation(
      { type: "shotAim" },
      () => game.chooseShotAim(chooseAiShotSector(game)),
      { scheduleAfter: false },
    );
  }

  if (game.state.pendingChoice?.type === "keeperDive") {
    return applyMutation(
      { type: "keeperDive" },
      () =>
        game.resolveShotDive(
          chooseAiKeeperDive(game),
          shouldAiUseKeeperAbility(game),
        ),
      { scheduleAfter: false },
    );
  }

  if (game.state.pendingChoice?.type === "bounce") {
    const bounce = chooseAiBounce(game);
    if (!bounce) {
      return false;
    }
    return applyMutation(
      { type: "bounce", to: { x: bounce.x, y: bounce.y } },
      () => game.clickCell(bounce.x, bounce.y),
      { scheduleAfter: false },
    );
  }

  const actions = planAiMatchStep(game);
  let acted = false;

  for (const action of actions) {
    const success = await applyMutation(
      buildAiActionMeta(action),
      () => executeAiAction(game, action),
      { scheduleAfter: false },
    );
    acted = success || acted;
  }

  return acted;
}

async function runAiStep() {
  aiTimerId = null;
  if (!shouldAiAct() || isTutorialBlocking()) {
    return;
  }

  aiInProgress = true;
  render({ scheduleAi: false });

  if (game.state.phase === "draft") {
    await performAiDraft();
  } else if (game.state.phase === "placement") {
    await performAiPlacement();
  } else if (game.state.phase === "match") {
    await performAiMatchStep();
  }

  aiInProgress = false;
  render();
}

window.__footballDebug = {
  game,
  render,
  runAiStep,
  audio,
  tutorial,
};

root.addEventListener("click", async (event) => {
  await audio.unlock();

  const resetButton = event.target.closest("[data-reset]");
  if (resetButton) {
    clearAiTimer();
    game.reset();
    render();
    return;
  }

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

  const tutorialRestart = event.target.closest("[data-tutorial-restart]");
  if (tutorialRestart) {
    clearAiTimer();
    tutorial.restart();
    game.reset();
    render();
    return;
  }

  const muteButton = event.target.closest("[data-mute-toggle]");
  if (muteButton) {
    const muted = audio.toggleMuted();
    if (!muted) {
      await audio.unlock();
      audio.turnStart();
    }
    render({ scheduleAi: false });
    return;
  }

  const modeButton = event.target.closest("[data-mode-set]");
  if (modeButton) {
    clearAiTimer();
    game.setMode(modeButton.dataset.modeSet);
    render();
    return;
  }

  if (isUiLocked()) {
    return;
  }

  const buyCardButton = event.target.closest("[data-player-card]");
  if (buyCardButton && game.state.phase === "draft") {
    await applyMutation(
      { type: "buy", cardId: buyCardButton.dataset.playerCard },
      () => game.buyCard(buyCardButton.dataset.playerCard),
    );
    return;
  }

  const abilityToggle = event.target.closest("[data-ability-toggle]");
  if (abilityToggle) {
    game.toggleAbility(abilityToggle.dataset.abilityToggle);
    render();
    return;
  }

  const surgeToggle = event.target.closest("[data-surge-toggle]");
  if (surgeToggle) {
    game.toggleSurge();
    render();
    return;
  }

  const endTurn = event.target.closest("[data-end-turn]");
  if (endTurn) {
    await applyMutation(
      { type: "endTurn" },
      () => game.endTurn("Игрок добровольно завершает атаку."),
    );
    return;
  }

  const actionButton = event.target.closest("[data-action-set]");
  if (actionButton) {
    const action = actionButton.dataset.actionSet;
    if (game.state.selectedAction === action && game.state.pendingChoice?.type !== "keeperDive") {
      game.clearAction();
    } else {
      game.setAction(action);
    }
    render();
    return;
  }

  const shotSector = event.target.closest("[data-shot-sector]");
  if (shotSector) {
    if (game.state.pendingChoice?.type === "shotAim") {
      await applyMutation(
        { type: "shotAim" },
        () => game.chooseShotAim(shotSector.dataset.shotSector),
      );
    } else if (game.state.pendingChoice?.type === "keeperDive") {
      const keeper = game.getPlayer(game.state.pendingChoice.keeperId);
      await applyMutation(
        { type: "keeperDive" },
        () =>
          game.resolveShotDive(
            shotSector.dataset.shotSector,
            keeper?.abilityArmed && !keeper?.abilityUsed,
          ),
      );
    }
    return;
  }

  const cell = event.target.closest("[data-cell]");
  if (cell) {
    const [x, y] = cell.dataset.cell.split(":").map(Number);
    await applyMutation(buildCellActionMeta(x, y), () => game.clickCell(x, y));
    return;
  }

  const rosterCard = event.target.closest("[data-player-card]");
  if (rosterCard) {
    game.selectPlayer(rosterCard.dataset.playerCard);
    render();
  }
});

render();
