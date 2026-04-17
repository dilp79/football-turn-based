import { GOALS } from "./data.js";
import { manhattanDistance } from "./utils.js";

const SHOT_SECTORS = [
  "high-left",
  "high-center",
  "high-right",
  "mid-left",
  "mid-center",
  "mid-right",
  "low-left",
  "low-center",
  "low-right",
];

const AI_TEAM_ID = 1;
const ROLE_HOME_X = {
  0: { GK: 0, DEF: 2, MID: 4, FWD: 6 },
  1: { GK: 14, DEF: 12, MID: 10, FWD: 8 },
};

const PLACEMENT_PATTERNS = {
  1: {
    DEF: [
      { x: 12, y: 2 },
      { x: 12, y: 6 },
      { x: 13, y: 4 },
      { x: 11, y: 4 },
    ],
    MID: [
      { x: 10, y: 2 },
      { x: 10, y: 6 },
      { x: 9, y: 4 },
      { x: 11, y: 4 },
    ],
    FWD: [
      { x: 8, y: 4 },
      { x: 9, y: 2 },
      { x: 9, y: 6 },
      { x: 10, y: 4 },
    ],
  },
  2: {
    DEF: [
      { x: 12, y: 3 },
      { x: 12, y: 5 },
      { x: 13, y: 4 },
      { x: 11, y: 4 },
    ],
    MID: [
      { x: 10, y: 4 },
      { x: 10, y: 2 },
      { x: 10, y: 6 },
      { x: 11, y: 4 },
    ],
    FWD: [
      { x: 9, y: 4 },
      { x: 8, y: 3 },
      { x: 8, y: 5 },
      { x: 10, y: 4 },
    ],
  },
  3: {
    DEF: [
      { x: 12, y: 4 },
      { x: 12, y: 2 },
      { x: 12, y: 6 },
      { x: 13, y: 4 },
    ],
    MID: [
      { x: 10, y: 3 },
      { x: 10, y: 5 },
      { x: 9, y: 4 },
      { x: 11, y: 4 },
    ],
    FWD: [
      { x: 8, y: 4 },
      { x: 8, y: 2 },
      { x: 8, y: 6 },
      { x: 9, y: 4 },
    ],
  },
};

function random(game) {
  return typeof game?.rng === "function" ? game.rng() : Math.random();
}

function randomInt(game, max) {
  return Math.floor(random(game) * max);
}

function chooseRandom(game, items) {
  if (!items.length) {
    return null;
  }
  return items[randomInt(game, items.length)];
}

function shuffle(game, items) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(game, index + 1);
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function getTargetGoal(teamId) {
  return GOALS[teamId === 0 ? 1 : 0];
}

function progressToGoal(teamId, fromX, toX) {
  const goalX = getTargetGoal(teamId).x;
  return Math.abs(goalX - fromX) - Math.abs(goalX - toX);
}

function ownGoalDanger(teamId, x) {
  return 14 - Math.abs(GOALS[teamId].x - x);
}

function getRoleHomeX(teamId, position) {
  return ROLE_HOME_X[teamId]?.[position] ?? 7;
}

function getTacticalAnchor(game, player) {
  const formation = game.state.placement?.formation?.[player.id];
  const roleHomeX = getRoleHomeX(player.teamId, player.position);
  return {
    x: formation ? Math.round((formation.x + roleHomeX) / 2) : roleHomeX,
    y: formation?.y ?? 4,
  };
}

function scoreShapeDiscipline(game, player, cell, { possessionTeamId = null } = {}) {
  const anchor = getTacticalAnchor(game, player);
  const currentAnchorDistance = manhattanDistance(player, anchor);
  const futureAnchorDistance = manhattanDistance(cell, anchor);
  const forwardProgress = progressToGoal(player.teamId, player.x, cell.x);
  let score = (currentAnchorDistance - futureAnchorDistance) * 3;

  if (player.position === "DEF") {
    score -= Math.max(0, forwardProgress) * 2.5;
  } else if (player.position === "MID") {
    score += forwardProgress;
  } else if (player.position === "FWD") {
    score += Math.max(0, forwardProgress) * 2.5;
  }

  if (possessionTeamId !== null && possessionTeamId !== player.teamId) {
    if (player.position === "DEF") {
      score += (currentAnchorDistance - futureAnchorDistance) * 2;
    } else if (player.position === "MID") {
      score += (currentAnchorDistance - futureAnchorDistance) * 1.2;
    } else if (futureAnchorDistance > currentAnchorDistance) {
      score -= 2;
    }
  }

  return score;
}

function scoreSupportSpacing(game, player, cell) {
  const carrier = game.state.ball.carrierId ? game.getPlayer(game.state.ball.carrierId) : null;
  if (!carrier || carrier.teamId !== player.teamId || carrier.id === player.id) {
    return 0;
  }

  const idealDistanceByRole = {
    DEF: 4,
    MID: 3,
    FWD: 2,
  };
  const idealDistance = idealDistanceByRole[player.position] ?? 3;
  const currentDelta = Math.abs(manhattanDistance(player, carrier) - idealDistance);
  const futureDelta = Math.abs(manhattanDistance(cell, carrier) - idealDistance);
  return (currentDelta - futureDelta) * 2.5;
}

function statTotal(card) {
  return (
    card.shot +
    card.pass +
    card.dribble +
    card.speed +
    card.tackle +
    card.intercept +
    card.goalkeeping
  );
}

function getLegalDraftCards(game, teamId = game.state.draft.activeTeam) {
  return game.state.marketIds.filter((cardId) => game.canBuyCard(cardId, teamId).ok);
}

function scoreDraftCard(game, card) {
  const teamId = game.state.draft.activeTeam;
  const counts = game.getRosterCounts(teamId);
  const slotsLeft = 5 - counts.roster.length;
  let score = statTotal(card) / Math.max(card.cost, 1);

  if (card.abilityId) {
    score += 0.7;
  }
  if (counts.goalkeepers === 0 && card.position === "GK") {
    score += slotsLeft <= 2 ? 6 : 2.5;
  }
  if (card.position !== "GK" && counts.fieldPlayers < 4) {
    score += 1.2;
  }

  const humanKeeper = game
    .getTeam(0)
    .rosterIds.map((playerId) => game.getPlayer(playerId))
    .find((player) => player?.position === "GK");
  if (game.state.aiLevel >= 3 && humanKeeper?.goalkeeping >= 6 && card.abilityId === "longShot") {
    score += 2.5;
  }

  return score;
}

export function pickAiDraftCard(game) {
  const legalCards = getLegalDraftCards(game, AI_TEAM_ID);
  if (!legalCards.length) {
    return null;
  }

  if (game.state.aiLevel <= 1) {
    return chooseRandom(game, legalCards);
  }

  const ranked = legalCards
    .map((cardId) => ({ cardId, score: scoreDraftCard(game, game.getCard(cardId)) }))
    .sort((left, right) => right.score - left.score);

  if (game.state.aiLevel === 2) {
    return chooseRandom(game, ranked.slice(0, Math.min(3, ranked.length))).cardId;
  }

  return ranked[0].cardId;
}

function mirrorCellForTeam(teamId, cell) {
  if (teamId === 1) {
    return cell;
  }
  return { x: 14 - cell.x, y: cell.y };
}

function getPreferredPlacementCells(teamId, position, level) {
  if (position === "GK") {
    return [GOALS[teamId]];
  }

  const pattern = PLACEMENT_PATTERNS[level] ?? PLACEMENT_PATTERNS[1];
  const preferred = pattern[position] ?? [
    { x: 10, y: 4 },
    { x: 9, y: 2 },
    { x: 9, y: 6 },
    { x: 8, y: 4 },
  ];
  return preferred.map((cell) => mirrorCellForTeam(teamId, cell));
}

export function pickAiPlacement(game) {
  const teamId = game.getPlacementTeamId();
  if (teamId !== AI_TEAM_ID) {
    return null;
  }

  const player = game.getPlayer(game.state.placement.selectedPlayerId);
  if (!player) {
    return null;
  }

  const candidates = getPreferredPlacementCells(teamId, player.position, game.state.aiLevel);
  for (const cell of candidates) {
    if (game.canPlacePlayer(player, cell.x, cell.y)) {
      return { playerId: player.id, x: cell.x, y: cell.y };
    }
  }

  for (let y = 0; y < 9; y += 1) {
    for (let x = 8; x <= 14; x += 1) {
      if (game.canPlacePlayer(player, x, y)) {
        return { playerId: player.id, x, y };
      }
    }
  }

  return null;
}

function getAvailableActionsForPlayer(game, player) {
  const availability = game.getActionAvailability(player.id);
  const actions = [];

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
      actions.push({
        type: "dribble",
        x: target.x,
        y: target.y,
        cost: target.cost,
        landing: target.landing,
      });
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
    const sortedMoves = game
      .getMoveTargets(player)
      .sort((left, right) => {
        const rightProgress = progressToGoal(player.teamId, player.x, right.x);
        const leftProgress = progressToGoal(player.teamId, player.x, left.x);
        return rightProgress - leftProgress || left.cost - right.cost;
      })
      .slice(0, 8);
    for (const target of sortedMoves) {
      actions.push({ type: "move", x: target.x, y: target.y, cost: target.cost });
    }
  }

  return actions;
}

function hasReusableAbility(player) {
  return Boolean(player.abilityId && !player.abilityUsed);
}

function shouldUseAbility(player, action) {
  if (!hasReusableAbility(player)) {
    return false;
  }

  switch (player.abilityId) {
    case "threadPass":
      return action.type === "pass";
    case "ironWall":
      return action.type === "tackle" || action.type === "slide";
    case "untouchable":
      return action.type === "dribble";
    case "longShot":
      return action.type === "shoot";
    default:
      return false;
  }
}

function shouldUseSurge(game, player, action) {
  if (!game.canUseSurge()) {
    return false;
  }

  if (action.type === "shoot") {
    return true;
  }
  if (game.state.aiLevel >= 3 && (action.type === "tackle" || action.type === "dribble")) {
    return true;
  }
  if (player.hasBall && action.type === "move" && progressToGoal(player.teamId, player.x, action.x) >= 2) {
    return true;
  }

  return false;
}

function scoreShotAction(game, player) {
  const opponentKeeper = game.getGoalkeeper(player.teamId === 0 ? 1 : 0);
  const shot = game.getShotCost(player);
  const goalDistance = Math.abs(getTargetGoal(player.teamId).x - player.x);
  const attackBias = player.shot * 3 + (15 - goalDistance) * 2;
  const keeperBias = opponentKeeper ? opponentKeeper.goalkeeping * 1.5 : 0;
  const abilityBonus = player.abilityId === "longShot" && !player.abilityUsed ? 6 : 0;
  return 42 + attackBias + abilityBonus - keeperBias - shot.cost * 2;
}

function scorePassAction(game, player, action) {
  const receiverId = game.state.board[action.y][action.x];
  const interceptor = game.getPassInterceptor(player, action);
  const interceptPenalty = interceptor ? 9 - interceptor.intercept : 0;

  if (receiverId) {
    const receiver = game.getPlayer(receiverId);
    const forwardProgress = progressToGoal(player.teamId, player.x, action.x);
    const shotThreat = receiver.shot + (receiver.position === "FWD" ? 3 : 0);
    const anchor = getTacticalAnchor(game, receiver);
    const roleSpacing = Math.max(0, 5 - manhattanDistance(receiver, anchor)) * 1.5;
    const roleBonus =
      receiver.position === "FWD" ? 5 : receiver.position === "MID" ? 3 : 0;
    return (
      20 +
      forwardProgress * 6 +
      shotThreat +
      roleSpacing +
      roleBonus -
      action.cost * 2 -
      interceptPenalty
    );
  }

  const zoneProgress = progressToGoal(player.teamId, player.x, action.x);
  return 10 + zoneProgress * 4 - action.cost * 2 - interceptPenalty - 2;
}

function scoreMoveAction(game, player, action) {
  let score = 8 - action.cost;
  const carrier = game.state.ball.carrierId ? game.getPlayer(game.state.ball.carrierId) : null;

  if (!game.state.ball.carrierId && game.state.ball.x === action.x && game.state.ball.y === action.y) {
    score += 22;
  }

  if (player.hasBall) {
    const moveProgress = progressToGoal(player.teamId, player.x, action.x);
    score += 12 + moveProgress * 7;
    score += scoreShapeDiscipline(game, player, { x: action.x, y: action.y }, {
      possessionTeamId: player.teamId,
    });
  } else if (!game.state.ball.carrierId) {
    const currentBallDistance = manhattanDistance(player, game.state.ball);
    const futureBallDistance = manhattanDistance({ x: action.x, y: action.y }, game.state.ball);
    score += (currentBallDistance - futureBallDistance) * 5;
    score += scoreShapeDiscipline(game, player, { x: action.x, y: action.y });
  } else {
    if (carrier?.teamId === player.teamId) {
      score += scoreSupportSpacing(game, player, { x: action.x, y: action.y });
      score += scoreShapeDiscipline(game, player, { x: action.x, y: action.y }, {
        possessionTeamId: player.teamId,
      });
    } else {
      const currentCarrierDistance = manhattanDistance(player, carrier);
      const futureCarrierDistance = manhattanDistance({ x: action.x, y: action.y }, carrier);
      const chaseWeight =
        player.position === "DEF" ? 5 : player.position === "MID" ? 3.5 : 1.5;
      score += (currentCarrierDistance - futureCarrierDistance) * chaseWeight;
      score += ownGoalDanger(player.teamId, carrier.x);
      score += scoreShapeDiscipline(game, player, { x: action.x, y: action.y }, {
        possessionTeamId: carrier.teamId,
      });
    }
  }

  return score;
}

function scoreTackleAction(game, player, action, type) {
  const targetId = game.state.board[action.y][action.x];
  const carrier = game.getPlayer(targetId);
  if (!carrier) {
    return -Infinity;
  }

  const base = type === "slide" ? 18 : 24;
  const tackleAdvantage = player.tackle - carrier.dribble;
  const danger = ownGoalDanger(player.teamId, carrier.x);
  return base + tackleAdvantage * 4 + danger - action.cost;
}

function scoreDribbleAction(game, player, action) {
  const targetId = game.state.board[action.y][action.x];
  const defender = game.getPlayer(targetId);
  const tackleRisk = defender ? defender.tackle : 0;
  const moveProgress = progressToGoal(player.teamId, player.x, action.landing.x);
  return 24 + moveProgress * 7 + player.dribble * 2 - tackleRisk * 1.5;
}

function scoreAction(game, player, action) {
  let score = 0;
  if (action.type === "shoot") {
    score = scoreShotAction(game, player);
  } else if (action.type === "pass") {
    score = scorePassAction(game, player, action);
  } else if (action.type === "move") {
    score = scoreMoveAction(game, player, action);
  } else if (action.type === "tackle") {
    score = scoreTackleAction(game, player, action, "tackle");
  } else if (action.type === "slide") {
    score = scoreTackleAction(game, player, action, "slide");
  } else if (action.type === "dribble") {
    score = scoreDribbleAction(game, player, action);
  }

  if (shouldUseAbility(player, action)) {
    score += 4;
  }
  if (shouldUseSurge(game, player, action)) {
    score += Math.min(game.state.turn.surge, 6);
  }

  const noise = game.state.aiLevel === 1 ? random(game) * 8 : game.state.aiLevel === 2 ? random(game) * 3 : random(game);
  return score + noise;
}

export function planAiMatchStep(game) {
  if (game.state.phase !== "match" || game.state.turn.activeTeam !== AI_TEAM_ID) {
    return [{ type: "endTurn" }];
  }

  let best = null;

  for (const playerId of game.getTeam(AI_TEAM_ID).rosterIds) {
    const player = game.getPlayer(playerId);
    if (!player || player.x === null || player.y === null) {
      continue;
    }

    const actions = getAvailableActionsForPlayer(game, player);
    for (const action of actions) {
      const score = scoreAction(game, player, action);
      if (!best || score > best.score) {
        best = {
          score,
          playerId: player.id,
          action,
          useAbility: shouldUseAbility(player, action),
          useSurge: shouldUseSurge(game, player, action),
        };
      }
    }
  }

  if (!best) {
    const carrier = game.getActiveBallCarrier?.();
    if (
      carrier &&
      carrier.teamId === AI_TEAM_ID &&
      carrier.position === "GK" &&
      carrier.hasBall
    ) {
      const forcedPass =
        game.getPassTargets(carrier).find((target) => game.state.board[target.y][target.x]) ??
        game.getPassTargets(carrier)[0] ??
        null;

      if (forcedPass) {
        return [
          { type: "selectPlayer", playerId: carrier.id },
          { type: "pass", x: forcedPass.x, y: forcedPass.y, cost: forcedPass.cost },
        ];
      }
    }

    return [{ type: "endTurn" }];
  }

  const steps = [{ type: "selectPlayer", playerId: best.playerId }];
  if (best.useAbility) {
    steps.push({ type: "armAbility", playerId: best.playerId });
  }
  if (best.useSurge) {
    steps.push({ type: "armSurge" });
  }
  steps.push(best.action);
  return steps;
}

export function chooseAiShotSector(game) {
  if (game.state.aiLevel >= 3) {
    return chooseRandom(game, ["high-left", "high-right", "low-left", "low-right"]);
  }
  if (game.state.aiLevel === 2) {
    return chooseRandom(game, ["high-left", "high-right", "mid-left", "mid-right", "low-left", "low-right"]);
  }
  return chooseRandom(game, SHOT_SECTORS);
}

export function chooseAiKeeperDive(game) {
  if (game.state.aiLevel >= 3) {
    return chooseRandom(game, ["high-left", "mid-center", "high-right", "low-left", "low-right"]);
  }
  return chooseRandom(game, SHOT_SECTORS);
}

function getNearestTeamDistance(game, teamId, cell) {
  let bestDistance = Infinity;
  for (const playerId of game.getTeam(teamId).rosterIds) {
    const player = game.getPlayer(playerId);
    if (!player || player.x === null || player.y === null) {
      continue;
    }
    bestDistance = Math.min(bestDistance, manhattanDistance(player, cell));
  }
  return bestDistance;
}

export function chooseAiBounce(game) {
  const pending = game.state.pendingChoice;
  if (pending?.type !== "bounce" || pending.actorTeam !== AI_TEAM_ID) {
    return null;
  }

  const scored = pending.options
    .map((cell) => {
      const ownDistance = getNearestTeamDistance(game, AI_TEAM_ID, cell);
      const enemyDistance = getNearestTeamDistance(game, 0, cell);
      const fieldBias = progressToGoal(AI_TEAM_ID, 7, cell.x);
      return {
        ...cell,
        score: fieldBias * 4 + (enemyDistance - ownDistance) * 3,
      };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0] ?? null;
}

export function shouldAiUseKeeperAbility(game) {
  const pending = game.state.pendingChoice;
  if (pending?.type !== "keeperDive") {
    return false;
  }

  const keeper = game.getPlayer(pending.keeperId);
  if (!keeper || keeper.teamId !== AI_TEAM_ID) {
    return false;
  }
  if (keeper.abilityId !== "catReflexes" || keeper.abilityUsed) {
    return false;
  }

  return game.state.aiLevel >= 2 || pending.distance <= 4;
}

export function executeAiAction(game, action) {
  switch (action.type) {
    case "selectPlayer":
      return game.selectPlayer(action.playerId);
    case "armAbility":
      return game.toggleAbility(action.playerId);
    case "armSurge":
      return game.toggleSurge();
    case "move":
      return game.setAction("move") && game.clickCell(action.x, action.y);
    case "pass":
      return game.setAction("pass") && game.clickCell(action.x, action.y);
    case "tackle":
      return game.setAction("tackle") && game.clickCell(action.x, action.y);
    case "slide":
      return game.setAction("slide") && game.clickCell(action.x, action.y);
    case "dribble":
      return game.setAction("dribble") && game.clickCell(action.x, action.y);
    case "shoot":
      return game.setAction("shoot");
    case "endTurn":
      return game.endTurn("ИИ завершает ход.");
    default:
      return false;
  }
}

export { AI_TEAM_ID };
