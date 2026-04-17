import {
  ABILITIES,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  GOALS,
  MAX_SCORE,
  PLAYER_CATALOG,
  TEAM_DEFS,
  TEAM_SIZE,
} from "./data.js";
import {
  bresenhamLine,
  cellKey,
  chebyshevDistance,
  createEmptyBoard,
  deepClone,
  inBounds,
  manhattanDistance,
  orthogonalNeighbors,
  reachableCells,
  rollDie,
} from "./utils.js";

const CARDS_BY_ID = new Map(PLAYER_CATALOG.map((card) => [card.id, card]));
const FIELD_PLAYER_COUNT = TEAM_SIZE - 1;
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

function cloneCard(cardId) {
  return deepClone(CARDS_BY_ID.get(cardId));
}

function createTeamState(definition) {
  return {
    ...definition,
    coins: 100,
    rosterIds: [],
    score: 0,
  };
}

function makeRuntimePlayer(card, teamId) {
  return {
    ...card,
    teamId,
    x: null,
    y: null,
    hasBall: false,
    abilityUsed: false,
    abilityArmed: false,
    suspended: false,
    lastPasserId: null,
    playerStats: {
      goals: 0,
      assists: 0,
      tacklesWon: 0,
      tacklesLost: 0,
      dribblesWon: 0,
      dribblesLost: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      shots: 0,
      shotsOnTarget: 0,
      fouls: 0,
      saves: 0,
    },
  };
}

function goalForTeam(teamId) {
  return GOALS[teamId];
}

function opposingTeam(teamId) {
  return teamId === 0 ? 1 : 0;
}

function teamHalf(teamId) {
  return teamId === 0 ? { minX: 0, maxX: 6 } : { minX: 8, maxX: 14 };
}

function isShotSectorValid(sector) {
  return SHOT_SECTORS.includes(sector);
}

function parseShotSector(sector) {
  const [vertical, horizontal] = sector.split("-");
  return { vertical, horizontal };
}

function createMatchStats() {
  return {
    turns: [0, 0],
    possessionTurns: [0, 0],
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
    saves: [0, 0],
    assists: [0, 0],
  };
}

export class FootballTurnGame {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.debugRollQueue = [];
    this.reset();
  }

  reset() {
    this.state = {
      mode: "hotseat",
      aiLevel: 2,
      phase: "draft",
      teams: TEAM_DEFS.map(createTeamState),
      marketIds: PLAYER_CATALOG.map((card) => card.id),
      players: {},
      board: createEmptyBoard(),
      ball: {
        x: 7,
        y: 4,
        carrierId: null,
      },
      draft: {
        activeTeam: 0,
      },
      placement: {
        teamOrder: [],
        index: 0,
        selectedPlayerId: null,
        formation: {},
      },
      turn: {
        activeTeam: null,
        number: 1,
        dice: [0, 0],
        actionPoints: 0,
        surge: 0,
        surgeArmed: false,
        surgeUsed: false,
      },
      stats: createMatchStats(),
      freeKick: null,
      kickoff: null,
      selectedPlayerId: null,
      selectedAction: null,
      pendingChoice: null,
      log: [],
    };

    this.pushLog("Драфт открыт. Игроки набирают составы на 100 монет.");
  }

  setMode(mode) {
    if (mode !== "hotseat" && mode !== "ai") {
      return false;
    }
    if (this.state.mode === mode) {
      return true;
    }
    this.state.mode = mode;
    this.pushLog(
      mode === "ai"
        ? "Режим матча изменён: игрок против ИИ."
        : "Режим матча изменён: hot-seat для двух игроков.",
    );
    return true;
  }

  setDebugRollQueue(values) {
    this.debugRollQueue = [...values];
  }

  rollD6() {
    if (this.debugRollQueue.length > 0) {
      return this.debugRollQueue.shift();
    }
    return rollDie(this.rng);
  }

  pushLog(message) {
    this.state.log.unshift({
      id: `${Date.now()}-${Math.random()}`,
      message,
    });
    this.state.log = this.state.log.slice(0, 18);
  }

  getCard(cardId) {
    return CARDS_BY_ID.get(cardId);
  }

  getPlayer(playerId) {
    return this.state.players[playerId] ?? null;
  }

  getTeam(teamId) {
    return this.state.teams[teamId];
  }

  getGoalkeeper(teamId) {
    const team = this.getTeam(teamId);
    return team.rosterIds
      .map((id) => this.getPlayer(id))
      .find((player) => player?.position === "GK");
  }

  getCurrentTeam() {
    if (this.state.phase === "draft") {
      return this.getTeam(this.state.draft.activeTeam);
    }
    if (this.state.phase === "placement") {
      const teamId = this.state.placement.teamOrder[this.state.placement.index];
      return this.getTeam(teamId);
    }
    if (this.state.phase === "match") {
      return this.getTeam(this.state.turn.activeTeam);
    }
    return null;
  }

  getActiveBallCarrier() {
    if (!this.state.ball.carrierId) {
      return null;
    }
    return this.getPlayer(this.state.ball.carrierId);
  }

  getEndTurnBlockReason() {
    if (this.state.phase !== "match" || this.state.pendingChoice) {
      return "";
    }

    const carrier = this.getActiveBallCarrier();
    if (
      carrier &&
      carrier.teamId === this.state.turn.activeTeam &&
      carrier.position === "GK" &&
      carrier.hasBall
    ) {
      return `${carrier.name} держит мяч в руках. Вратарь обязан ввести его в игру пасом.`;
    }

    return "";
  }

  canEndTurn() {
    return !this.getEndTurnBlockReason();
  }

  addTeamStat(stat, teamId, amount = 1) {
    const bucket = this.state.stats?.[stat];
    if (!bucket || bucket[teamId] === undefined) {
      return;
    }
    bucket[teamId] += amount;
  }

  addPlayerStat(player, stat, amount = 1) {
    if (!player?.playerStats || player.playerStats[stat] === undefined) {
      return;
    }
    player.playerStats[stat] += amount;
  }

  clearTransientMarks() {
    for (const player of Object.values(this.state.players)) {
      player.suspended = false;
    }
    this.state.freeKick = null;
  }

  getClosestPlayer(teamId, target) {
    const candidates = this.getTeam(teamId).rosterIds
      .map((playerId) => this.getPlayer(playerId))
      .filter((player) => player && player.x !== null && player.y !== null);

    candidates.sort(
      (left, right) =>
        manhattanDistance(left, target) - manhattanDistance(right, target) ||
        left.position.localeCompare(right.position),
    );

    return candidates[0] ?? null;
  }

  getPassAccuracy(teamId) {
    const attempts = this.state.stats.passAttempts[teamId];
    if (!attempts) {
      return 0;
    }
    return Math.round((this.state.stats.passCompletions[teamId] / attempts) * 100);
  }

  getPossessionShare(teamId) {
    const totalTurns = this.state.stats.possessionTurns[0] + this.state.stats.possessionTurns[1];
    if (!totalTurns) {
      return 50;
    }
    return Math.round((this.state.stats.possessionTurns[teamId] / totalTurns) * 100);
  }

  getMVP() {
    let best = null;
    let bestScore = -Infinity;

    for (const player of Object.values(this.state.players)) {
      const score =
        player.playerStats.goals * 5 +
        player.playerStats.assists * 3 +
        player.playerStats.tacklesWon * 2 +
        player.playerStats.dribblesWon +
        player.playerStats.saves * 2 -
        player.playerStats.fouls;

      if (score > bestScore) {
        best = player;
        bestScore = score;
      }
    }

    return bestScore > 0 ? best : null;
  }

  isAiControlledTeam(teamId) {
    return this.state.mode === "ai" && teamId === 1;
  }

  getDecisionTeamId() {
    if (this.state.phase === "draft") {
      return this.state.draft.activeTeam;
    }
    if (this.state.phase === "placement") {
      return this.getPlacementTeamId();
    }
    if (this.state.phase !== "match") {
      return null;
    }

    if (this.state.pendingChoice?.type === "bounce") {
      return this.state.pendingChoice.actorTeam;
    }
    if (this.state.pendingChoice?.type === "shotAim") {
      const shooter = this.getPlayer(this.state.pendingChoice.playerId);
      return shooter?.teamId ?? this.state.turn.activeTeam;
    }
    if (this.state.pendingChoice?.type === "keeperDive") {
      const keeper = this.getPlayer(this.state.pendingChoice.keeperId);
      return keeper?.teamId ?? null;
    }

    return this.state.turn.activeTeam;
  }

  clearBoard() {
    this.state.board = createEmptyBoard();
  }

  placeOnBoard(player, x, y) {
    if (player.x !== null && player.y !== null) {
      this.state.board[player.y][player.x] = null;
    }
    player.x = x;
    player.y = y;
    this.state.board[y][x] = player.id;
  }

  moveBallToCell(x, y) {
    const previousCarrier = this.state.ball.carrierId
      ? this.getPlayer(this.state.ball.carrierId)
      : null;
    if (previousCarrier) {
      previousCarrier.hasBall = false;
    }
    this.state.ball = {
      x,
      y,
      carrierId: null,
    };
  }

  giveBallToPlayer(player) {
    const previousCarrier = this.state.ball.carrierId
      ? this.getPlayer(this.state.ball.carrierId)
      : null;
    if (previousCarrier) {
      previousCarrier.hasBall = false;
    }
    player.hasBall = true;
    player.lastPasserId = null;
    this.state.ball = {
      x: player.x,
      y: player.y,
      carrierId: player.id,
    };
  }

  updateBallPosition() {
    if (this.state.ball.carrierId) {
      const carrier = this.getPlayer(this.state.ball.carrierId);
      if (carrier) {
        this.state.ball.x = carrier.x;
        this.state.ball.y = carrier.y;
      }
    }
  }

  spendActionPoints(cost) {
    this.state.turn.actionPoints = Math.max(0, this.state.turn.actionPoints - cost);
  }

  canUseSurge() {
    return (
      this.state.phase === "match" &&
      this.state.turn.surge > 0 &&
      !this.state.turn.surgeUsed
    );
  }

  toggleSurge() {
    if (!this.canUseSurge() || this.state.pendingChoice) {
      return false;
    }
    this.state.turn.surgeArmed = !this.state.turn.surgeArmed;
    return true;
  }

  consumeSurgeIfArmed() {
    if (!this.state.turn.surgeArmed || this.state.turn.surgeUsed) {
      return 0;
    }
    this.state.turn.surgeArmed = false;
    this.state.turn.surgeUsed = true;
    return this.state.turn.surge;
  }

  toggleAbility(playerId = this.state.selectedPlayerId) {
    const player = this.getPlayer(playerId);
    if (!player || !player.abilityId || player.abilityUsed) {
      return false;
    }

    if (this.state.phase !== "match") {
      return false;
    }

    const activeTeam = this.state.turn.activeTeam;
    if (
      player.teamId !== activeTeam &&
      !(this.state.pendingChoice?.type === "keeperDive" && player.position === "GK")
    ) {
      return false;
    }

    player.abilityArmed = !player.abilityArmed;
    return true;
  }

  consumeAbility(player) {
    player.abilityArmed = false;
    player.abilityUsed = true;
  }

  getAbility(player) {
    return player?.abilityId ? ABILITIES[player.abilityId] : null;
  }

  getRosterCounts(teamId) {
    const roster = this.getTeam(teamId).rosterIds.map((id) => this.getPlayer(id));
    const goalkeepers = roster.filter((player) => player.position === "GK").length;
    const fieldPlayers = roster.length - goalkeepers;
    return { roster, goalkeepers, fieldPlayers };
  }

  canTeamCompleteRoster(teamId, hypotheticalCardId = null) {
    const team = this.getTeam(teamId);
    const counts = this.getRosterCounts(teamId);
    const hypotheticalCard = hypotheticalCardId ? this.getCard(hypotheticalCardId) : null;
    const remainingCoins = team.coins - (hypotheticalCard?.cost ?? 0);
    const rosterCount = counts.roster.length + (hypotheticalCard ? 1 : 0);
    const goalkeeperCount =
      counts.goalkeepers + (hypotheticalCard?.position === "GK" ? 1 : 0);
    const fieldCount = counts.fieldPlayers + (hypotheticalCard?.position === "GK" ? 0 : 1);

    if (
      remainingCoins < 0 ||
      rosterCount > TEAM_SIZE ||
      goalkeeperCount > 1 ||
      fieldCount > FIELD_PLAYER_COUNT
    ) {
      return false;
    }

    const slotsLeft = TEAM_SIZE - rosterCount;
    const goalkeepersNeeded = 1 - goalkeeperCount;
    if (goalkeepersNeeded < 0 || goalkeepersNeeded > slotsLeft) {
      return false;
    }
    if (slotsLeft === 0) {
      return goalkeepersNeeded === 0;
    }

    const availableCards = this.state.marketIds
      .filter((cardId) => cardId !== hypotheticalCardId)
      .map((cardId) => this.getCard(cardId));

    function search(index, slots, keepersNeeded, coinsLeft) {
      if (slots === 0) {
        return keepersNeeded === 0;
      }
      if (index >= availableCards.length) {
        return false;
      }

      for (let i = index; i < availableCards.length; i += 1) {
        const candidate = availableCards[i];
        if (candidate.cost > coinsLeft) {
          continue;
        }
        const nextKeepersNeeded =
          keepersNeeded - (candidate.position === "GK" ? 1 : 0);
        const maxKeepersPossible = slots - 1;
        if (nextKeepersNeeded < 0 || nextKeepersNeeded > maxKeepersPossible) {
          continue;
        }
        if (search(i + 1, slots - 1, nextKeepersNeeded, coinsLeft - candidate.cost)) {
          return true;
        }
      }
      return false;
    }

    return search(0, slotsLeft, goalkeepersNeeded, remainingCoins);
  }

  canBuyCard(cardId, teamId = this.state.draft.activeTeam) {
    if (this.state.phase !== "draft") {
      return { ok: false, reason: "Матч уже начался." };
    }

    const card = this.getCard(cardId);
    const team = this.getTeam(teamId);
    if (!card || !this.state.marketIds.includes(cardId)) {
      return { ok: false, reason: "Карточка уже куплена." };
    }

    const counts = this.getRosterCounts(teamId);
    if (team.coins < card.cost) {
      return { ok: false, reason: "Не хватает монет." };
    }
    if (counts.roster.length >= TEAM_SIZE) {
      return { ok: false, reason: "Состав уже собран." };
    }
    if (card.position === "GK" && counts.goalkeepers >= 1) {
      return { ok: false, reason: "Можно взять только одного вратаря." };
    }
    if (card.position !== "GK" && counts.fieldPlayers >= FIELD_PLAYER_COUNT) {
      return { ok: false, reason: "Полевых игроков уже достаточно." };
    }
    if (!this.canTeamCompleteRoster(teamId, cardId)) {
      return {
        ok: false,
        reason: "Этот пик ломает будущую сборку состава по бюджету или позициям.",
      };
    }
    return { ok: true, reason: "" };
  }

  buyCard(cardId) {
    const teamId = this.state.draft.activeTeam;
    const validation = this.canBuyCard(cardId, teamId);
    if (!validation.ok) {
      return validation;
    }

    const team = this.getTeam(teamId);
    const card = cloneCard(cardId);
    const player = makeRuntimePlayer(card, teamId);
    this.state.players[player.id] = player;
    team.rosterIds.push(player.id);
    team.coins -= player.cost;
    this.state.marketIds = this.state.marketIds.filter((id) => id !== cardId);

    this.pushLog(`${team.name} покупают ${player.name} за ${player.cost} монет.`);

    const otherTeamId = opposingTeam(teamId);
    const otherRosterFull = this.getTeam(otherTeamId).rosterIds.length >= TEAM_SIZE;
    const currentRosterFull = team.rosterIds.length >= TEAM_SIZE;

    if (currentRosterFull && otherRosterFull) {
      this.finishDraft();
      return { ok: true };
    }

    this.state.draft.activeTeam =
      !otherRosterFull && this.getTeam(otherTeamId).rosterIds.length < TEAM_SIZE
        ? otherTeamId
        : teamId;

    return { ok: true };
  }

  finishDraft() {
    let a = this.rollD6();
    let b = this.rollD6();
    while (a === b) {
      a = this.rollD6();
      b = this.rollD6();
    }
    const winner = a > b ? 0 : 1;
    const loser = opposingTeam(winner);
    this.state.kickoff = { rolls: [a, b], winner };
    this.state.phase = "placement";
    this.state.placement = {
      teamOrder: [winner, loser],
      index: 0,
      selectedPlayerId: this.getGoalkeeper(winner)?.id ?? this.getTeam(winner).rosterIds[0],
      formation: {},
    };
    this.pushLog(
      `Стартовый бросок: ${this.getTeam(0).shortName} ${a} - ${b} ${this.getTeam(1).shortName}. Первыми расставляются ${this.getTeam(winner).name}.`,
    );
  }

  getPlacementTeamId() {
    return this.state.placement.teamOrder[this.state.placement.index];
  }

  getUnplacedPlayers(teamId) {
    return this.getTeam(teamId).rosterIds
      .map((id) => this.getPlayer(id))
      .filter((player) => player.x === null || player.y === null);
  }

  selectPlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) {
      this.state.selectedPlayerId = null;
      this.state.selectedAction = null;
      return false;
    }

    if (this.state.phase === "placement") {
      const teamId = this.getPlacementTeamId();
      if (player.teamId !== teamId || player.x !== null) {
        return false;
      }
      this.state.placement.selectedPlayerId = playerId;
      return true;
    }

    if (this.state.phase !== "match" || this.state.pendingChoice) {
      return false;
    }

    if (player.teamId !== this.state.turn.activeTeam) {
      this.state.selectedPlayerId = null;
      this.state.selectedAction = null;
      return false;
    }
    if (player.suspended) {
      this.state.selectedPlayerId = null;
      this.state.selectedAction = null;
      return false;
    }

    this.state.selectedPlayerId = playerId;
    this.state.selectedAction = null;
    return true;
  }

  canPlacePlayer(player, x, y) {
    if (this.state.phase !== "placement" || !inBounds(x, y)) {
      return false;
    }
    if (this.state.board[y][x]) {
      return false;
    }

    const goalCell = goalForTeam(player.teamId);
    const half = teamHalf(player.teamId);
    if (player.position === "GK") {
      return x === goalCell.x && y === goalCell.y;
    }
    if (x === goalCell.x && y === goalCell.y) {
      return false;
    }
    return x >= half.minX && x <= half.maxX;
  }

  placeSelectedPlayer(x, y) {
    if (this.state.phase !== "placement") {
      return false;
    }
    const player = this.getPlayer(this.state.placement.selectedPlayerId);
    if (!player || !this.canPlacePlayer(player, x, y)) {
      return false;
    }

    this.placeOnBoard(player, x, y);
    this.state.placement.formation[player.id] = { x, y };

    const teamId = this.getPlacementTeamId();
    const unplaced = this.getUnplacedPlayers(teamId);
    if (unplaced.length > 0) {
      this.state.placement.selectedPlayerId = unplaced[0].id;
      return true;
    }

    this.state.placement.index += 1;
    if (this.state.placement.index >= this.state.placement.teamOrder.length) {
      this.finishPlacement();
      return true;
    }

    const nextTeamId = this.getPlacementTeamId();
    const nextUnplaced = this.getUnplacedPlayers(nextTeamId);
    this.state.placement.selectedPlayerId = nextUnplaced[0]?.id ?? null;
    this.pushLog(`${this.getTeam(nextTeamId).name} расставляют своих игроков.`);
    return true;
  }

  finishPlacement() {
    this.state.phase = "match";
    this.state.selectedPlayerId = null;
    this.state.selectedAction = null;
    this.state.pendingChoice = null;
    this.moveBallToCell(7, 4);
    const startingTeam = this.state.kickoff.winner;
    this.pushLog(`${this.getTeam(startingTeam).name} открывают матч.`);
    this.startTurn(startingTeam, "Старт матча");
  }

  startTurn(teamId, reason = "", { preserveFreeKick = false } = {}) {
    if (!preserveFreeKick) {
      this.clearTransientMarks();
    }
    const dieA = this.rollD6();
    const dieB = this.rollD6();
    this.state.turn = {
      activeTeam: teamId,
      number: this.state.turn.activeTeam === 1 && teamId === 0 ? this.state.turn.number + 1 : this.state.turn.number,
      dice: [dieA, dieB],
      actionPoints: dieA + dieB,
      surge: Math.max(dieA, dieB),
      surgeArmed: false,
      surgeUsed: false,
    };
    this.state.selectedPlayerId = null;
    this.state.selectedAction = null;
    this.state.pendingChoice = null;
    this.addTeamStat("turns", teamId);

    const carrier = this.state.ball.carrierId ? this.getPlayer(this.state.ball.carrierId) : null;
    if (carrier) {
      this.addTeamStat("possessionTurns", carrier.teamId);
    }

    const team = this.getTeam(teamId);
    const prefix = reason ? `${reason}. ` : "";
    this.pushLog(
      `${prefix}${team.name}: кубики ${dieA} и ${dieB}, очки действий ${dieA + dieB}, рывок +${Math.max(dieA, dieB)}.`,
    );
  }

  beginFreeKick(teamId, suspendedPlayerId, spot) {
    const suspendedPlayer = this.getPlayer(suspendedPlayerId);
    if (suspendedPlayer) {
      suspendedPlayer.suspended = true;
    }

    const taker = this.getClosestPlayer(teamId, spot);
    if (taker) {
      this.giveBallToPlayer(taker);
      taker.lastPasserId = null;
    } else {
      this.moveBallToCell(spot.x, spot.y);
    }

    this.state.freeKick = {
      teamId,
      suspendedPlayerId,
      takerId: taker?.id ?? null,
      x: spot.x,
      y: spot.y,
    };
    this.startTurn(
      teamId,
      `Штрафной для ${this.getTeam(teamId).shortName} с клетки ${spot.x + 1}:${spot.y + 1}`,
      { preserveFreeKick: true },
    );
  }

  endTurn(reason = "") {
    if (this.state.phase !== "match" || this.state.pendingChoice) {
      return false;
    }
    if (!this.canEndTurn()) {
      return false;
    }
    const nextTeam = opposingTeam(this.state.turn.activeTeam);
    if (reason) {
      this.pushLog(reason);
    }
    this.startTurn(nextTeam, `Ход переходит к ${this.getTeam(nextTeam).shortName}`);
    return true;
  }

  isGoalkeeperLocked(player) {
    return player.position === "GK";
  }

  getMoveTargets(player) {
    if (!player || player.teamId !== this.state.turn.activeTeam || this.isGoalkeeperLocked(player)) {
      return [];
    }
    if (this.state.turn.actionPoints <= 0) {
      return [];
    }
    const maxSteps = player.hasBall
      ? this.state.turn.actionPoints
      : player.speed * this.state.turn.actionPoints;
    const cells = reachableCells(
      { x: player.x, y: player.y },
      maxSteps,
      (cell) => !this.state.board[cell.y][cell.x],
    );

    return cells
      .map((cell) => ({
        x: cell.x,
        y: cell.y,
        cost: player.hasBall ? cell.steps : Math.ceil(cell.steps / player.speed),
      }))
      .filter((cell) => cell.cost <= this.state.turn.actionPoints);
  }

  getPassTargets(player) {
    if (!player || !player.hasBall || this.state.turn.actionPoints <= 0) {
      return [];
    }
    const abilityBuff =
      player.abilityId === "threadPass" && player.abilityArmed && !player.abilityUsed
        ? 2
        : 0;
    const canThread = player.throughPass || abilityBuff > 0;
    const maxRange = player.pass + abilityBuff;
    const targets = [];

    for (let y = 0; y < FIELD_HEIGHT; y += 1) {
      for (let x = 0; x < FIELD_WIDTH; x += 1) {
        if (x === player.x && y === player.y) {
          continue;
        }
        const distance = chebyshevDistance({ x: player.x, y: player.y }, { x, y });
        const cost = Math.ceil(distance / 2);
        if (distance > maxRange || cost > this.state.turn.actionPoints) {
          continue;
        }
        const occupantId = this.state.board[y][x];
        if (!occupantId && !canThread) {
          continue;
        }
        if (occupantId) {
          const occupant = this.getPlayer(occupantId);
          if (!occupant || occupant.teamId !== player.teamId) {
            continue;
          }
        }
        targets.push({ x, y, cost });
      }
    }

    return targets;
  }

  getTackleTargets(player) {
    if (!player || player.hasBall || this.isGoalkeeperLocked(player) || this.state.turn.actionPoints < 2) {
      return [];
    }
    return orthogonalNeighbors(player.x, player.y)
      .map((cell) => {
        const occupantId = this.state.board[cell.y][cell.x];
        if (!occupantId) {
          return null;
        }
        const occupant = this.getPlayer(occupantId);
        if (!occupant || occupant.teamId === player.teamId || !occupant.hasBall) {
          return null;
        }
        return { x: cell.x, y: cell.y, cost: 2 };
      })
      .filter(Boolean);
  }

  getSlideTargets(player) {
    return this.getTackleTargets(player);
  }

  getDribbleTargets(player) {
    if (!player || !player.hasBall || this.isGoalkeeperLocked(player) || this.state.turn.actionPoints < 1) {
      return [];
    }
    return orthogonalNeighbors(player.x, player.y)
      .map((cell) => {
        const occupantId = this.state.board[cell.y][cell.x];
        if (!occupantId) {
          return null;
        }
        const occupant = this.getPlayer(occupantId);
        if (!occupant || occupant.teamId === player.teamId) {
          return null;
        }
        const dx = cell.x - player.x;
        const dy = cell.y - player.y;
        const landing = { x: cell.x + dx, y: cell.y + dy };
        if (!inBounds(landing.x, landing.y) || this.state.board[landing.y][landing.x]) {
          return null;
        }
        return { x: cell.x, y: cell.y, cost: 1, landing };
      })
      .filter(Boolean);
  }

  getShotCost(player) {
    const defendingTeam = opposingTeam(player.teamId);
    const targetGoal = goalForTeam(defendingTeam);
    const distance = Math.max(1, Math.abs(targetGoal.x - player.x));
    return {
      distance,
      cost: 1 + Math.ceil(distance / 2),
    };
  }

  canShoot(player) {
    if (!player || !player.hasBall) {
      return false;
    }
    const shot = this.getShotCost(player);
    return shot.cost <= this.state.turn.actionPoints;
  }

  getActionAvailability(playerId = this.state.selectedPlayerId) {
    const player = this.getPlayer(playerId);
    if (
      !player ||
      this.state.phase !== "match" ||
      player.teamId !== this.state.turn.activeTeam ||
      player.suspended
    ) {
      return {
        move: false,
        pass: false,
        shoot: false,
        tackle: false,
        slide: false,
        dribble: false,
      };
    }

    return {
      move: this.getMoveTargets(player).length > 0,
      pass: this.getPassTargets(player).length > 0,
      shoot: this.canShoot(player),
      tackle: this.getTackleTargets(player).length > 0,
      slide: this.getSlideTargets(player).length > 0,
      dribble: this.getDribbleTargets(player).length > 0,
    };
  }

  setAction(action) {
    if (this.state.phase !== "match" || this.state.pendingChoice) {
      return false;
    }
    const player = this.getPlayer(this.state.selectedPlayerId);
    if (!player || player.teamId !== this.state.turn.activeTeam) {
      return false;
    }
    if (action === "shoot") {
      if (!this.canShoot(player)) {
        return false;
      }
      const { cost, distance } = this.getShotCost(player);
      this.state.selectedAction = "shoot";
      this.state.pendingChoice = {
        type: "shotAim",
        playerId: player.id,
        cost,
        distance,
      };
      return true;
    }
    const availability = this.getActionAvailability(player.id);
    if (!availability[action]) {
      return false;
    }
    this.state.selectedAction = action;
    return true;
  }

  clearAction() {
    this.state.selectedAction = null;
    if (this.state.pendingChoice?.type === "shotAim") {
      this.state.pendingChoice = null;
    }
  }

  getPassInterceptor(player, target) {
    const ignoreIntercept =
      player.abilityId === "threadPass" && player.abilityArmed && !player.abilityUsed;
    if (ignoreIntercept) {
      return null;
    }

    const lineCells = bresenhamLine(
      { x: player.x, y: player.y },
      { x: target.x, y: target.y },
    );
    const candidates = [];

    for (const enemyTeamId of [opposingTeam(player.teamId)]) {
      for (const playerId of this.getTeam(enemyTeamId).rosterIds) {
        const enemy = this.getPlayer(playerId);
        if (!enemy || enemy.x === null) {
          continue;
        }
        const onLine = lineCells.some(
          (cell, index) =>
            index < lineCells.length - 1 && cell.x === enemy.x && cell.y === enemy.y,
        );
        const nearLanding = manhattanDistance(enemy, target) === 1;
        if (onLine || nearLanding) {
          candidates.push(enemy);
        }
      }
    }

    candidates.sort((a, b) => a.intercept - b.intercept || a.tackle - b.tackle);
    return candidates[0] ?? null;
  }

  resolvePassTo(target) {
    const passer = this.getPlayer(this.state.selectedPlayerId);
    if (!passer || this.state.selectedAction !== "pass" || !passer.hasBall) {
      return false;
    }

    const targetData = this.getPassTargets(passer).find(
      (cell) => cell.x === target.x && cell.y === target.y,
    );
    if (!targetData) {
      return false;
    }

    this.spendActionPoints(targetData.cost);
    this.addTeamStat("passAttempts", passer.teamId);
    this.addPlayerStat(passer, "passesAttempted");
    const interceptor = this.getPassInterceptor(passer, targetData);
    if (interceptor) {
      const interceptionRoll = this.rollD6();
      if (interceptionRoll >= interceptor.intercept) {
        this.giveBallToPlayer(interceptor);
        this.state.selectedPlayerId = null;
        this.state.selectedAction = null;
        this.pushLog(
          `${interceptor.name} перехватывает пас (${interceptionRoll} против порога ${interceptor.intercept}+).`,
        );
        return true;
      }
      this.pushLog(
        `${interceptor.name} читает передачу, но не дотягивается (${interceptionRoll} против ${interceptor.intercept}+).`,
      );
    }

    const occupantId = this.state.board[targetData.y][targetData.x];
    if (!occupantId) {
      this.moveBallToCell(targetData.x, targetData.y);
      this.addTeamStat("passCompletions", passer.teamId);
      this.addPlayerStat(passer, "passesCompleted");
      this.pushLog(
        `${passer.name} играет в свободную зону на ${targetData.cost} ОД.`,
      );
    } else {
      const receiver = this.getPlayer(occupantId);
      const receiveRoll = this.rollD6();
      if (receiveRoll >= receiver.receive) {
        this.giveBallToPlayer(receiver);
        receiver.lastPasserId = passer.id;
        this.addTeamStat("passCompletions", passer.teamId);
        this.addPlayerStat(passer, "passesCompleted");
        this.state.selectedPlayerId = receiver.id;
        this.pushLog(
          `${passer.name} находит ${receiver.name}, приём успешен (${receiveRoll} против ${receiver.receive}+).`,
        );
      } else {
        this.moveBallToCell(receiver.x, receiver.y);
        const bounceCells = orthogonalNeighbors(receiver.x, receiver.y).filter(
          (cell) => !this.state.board[cell.y][cell.x],
        );
        this.state.pendingChoice = {
          type: "bounce",
          actorTeam: opposingTeam(passer.teamId),
          from: { x: receiver.x, y: receiver.y },
          options: bounceCells,
          receiverId: receiver.id,
        };
        this.state.selectedPlayerId = null;
        this.pushLog(
          `${receiver.name} не укрощает мяч (${receiveRoll} против ${receiver.receive}+). Соперник выбирает рикошет.`,
        );
      }
    }

    if (
      passer.abilityId === "threadPass" &&
      passer.abilityArmed &&
      !passer.abilityUsed
    ) {
      this.consumeAbility(passer);
    }

    this.state.selectedAction = null;
    this.updateBallPosition();
    return true;
  }

  resolveBounce(x, y) {
    const pending = this.state.pendingChoice;
    if (pending?.type !== "bounce") {
      return false;
    }
    const valid = pending.options.find((cell) => cell.x === x && cell.y === y);
    if (!valid) {
      return false;
    }
    this.moveBallToCell(x, y);
    this.state.pendingChoice = null;
    this.pushLog(`Мяч отскакивает в клетку ${x + 1}:${y + 1}.`);
    return true;
  }

  resolveMoveTo(target) {
    const player = this.getPlayer(this.state.selectedPlayerId);
    if (!player || this.state.selectedAction !== "move") {
      return false;
    }
    const moveTarget = this.getMoveTargets(player).find(
      (cell) => cell.x === target.x && cell.y === target.y,
    );
    if (!moveTarget) {
      return false;
    }

    this.spendActionPoints(moveTarget.cost);
    this.placeOnBoard(player, target.x, target.y);
    if (this.state.ball.carrierId === player.id) {
      this.updateBallPosition();
    } else if (
      !this.state.ball.carrierId &&
      this.state.ball.x === target.x &&
      this.state.ball.y === target.y
    ) {
      this.giveBallToPlayer(player);
      player.lastPasserId = null;
      this.pushLog(`${player.name} подбирает свободный мяч.`);
    }

    this.state.selectedAction = null;
    this.pushLog(
      `${player.name} смещается на ${moveTarget.cost} ОД.`,
    );
    return true;
  }

  resolveTackleAgainst(targetCell) {
    const tackler = this.getPlayer(this.state.selectedPlayerId);
    if (!tackler || this.state.selectedAction !== "tackle") {
      return false;
    }
    const validTarget = this.getTackleTargets(tackler).find(
      (cell) => cell.x === targetCell.x && cell.y === targetCell.y,
    );
    if (!validTarget) {
      return false;
    }

    const carrier = this.getPlayer(this.state.board[targetCell.y][targetCell.x]);
    this.spendActionPoints(2);
    const surge = this.consumeSurgeIfArmed();
    const ironWallBonus =
      tackler.abilityId === "ironWall" && tackler.abilityArmed && !tackler.abilityUsed ? 4 : 0;
    const untouchableBonus =
      carrier.abilityId === "untouchable" && carrier.abilityArmed && !carrier.abilityUsed ? 4 : 0;
    const defendRoll = this.rollD6();
    const attack = tackler.tackle + surge + ironWallBonus;
    const defense = carrier.dribble + defendRoll + untouchableBonus;

    if (ironWallBonus > 0) {
      this.consumeAbility(tackler);
    }
    if (untouchableBonus > 0) {
      this.consumeAbility(carrier);
    }

    if (attack > defense) {
      this.giveBallToPlayer(tackler);
      this.addTeamStat("tacklesWon", tackler.teamId);
      this.addTeamStat("tacklesLost", carrier.teamId);
      this.addPlayerStat(tackler, "tacklesWon");
      this.addPlayerStat(carrier, "tacklesLost");
      this.pushLog(
        `${tackler.name} выигрывает отбор у ${carrier.name}: ${attack} против ${defense}.`,
      );
    } else {
      this.addTeamStat("tacklesLost", tackler.teamId);
      this.addTeamStat("tacklesWon", carrier.teamId);
      this.addPlayerStat(tackler, "tacklesLost");
      this.addPlayerStat(carrier, "tacklesWon");
      this.pushLog(
        `${carrier.name} удерживает мяч: ${defense} против ${attack}.`,
      );
    }

    this.state.selectedAction = null;
    return true;
  }

  resolveSlideAgainst(targetCell) {
    const tackler = this.getPlayer(this.state.selectedPlayerId);
    if (!tackler || this.state.selectedAction !== "slide") {
      return false;
    }
    const validTarget = this.getSlideTargets(tackler).find(
      (cell) => cell.x === targetCell.x && cell.y === targetCell.y,
    );
    if (!validTarget) {
      return false;
    }

    const carrier = this.getPlayer(this.state.board[targetCell.y][targetCell.x]);
    this.spendActionPoints(2);
    const roll = this.rollD6();
    const ironWallArmed =
      tackler.abilityId === "ironWall" && tackler.abilityArmed && !tackler.abilityUsed;
    const successUpperBound = ironWallArmed ? 5 : 4;

    if (ironWallArmed) {
      this.consumeAbility(tackler);
    }

    if (roll === 1) {
      this.addTeamStat("fouls", tackler.teamId);
      this.addTeamStat("tacklesLost", tackler.teamId);
      this.addPlayerStat(tackler, "fouls");
      this.addPlayerStat(tackler, "tacklesLost");
      this.addPlayerStat(carrier, "tacklesWon");
      this.state.selectedAction = null;
      this.pushLog(`${tackler.name} сносит ${carrier.name}. Судья ставит штрафной.`);
      this.beginFreeKick(carrier.teamId, tackler.id, { x: carrier.x, y: carrier.y });
      return true;
    }

    if (roll >= 2 && roll <= successUpperBound) {
      this.giveBallToPlayer(tackler);
      this.addTeamStat("tacklesWon", tackler.teamId);
      this.addTeamStat("tacklesLost", carrier.teamId);
      this.addPlayerStat(tackler, "tacklesWon");
      this.addPlayerStat(carrier, "tacklesLost");
      this.pushLog(`${tackler.name} чисто выигрывает подкат и выбивает мяч себе (${roll}).`);
      this.state.selectedAction = null;
      return true;
    }

    const dx = targetCell.x - tackler.x;
    const dy = targetCell.y - tackler.y;
    const slideCell = { x: targetCell.x + dx, y: targetCell.y + dy };
    if (inBounds(slideCell.x, slideCell.y) && !this.state.board[slideCell.y][slideCell.x]) {
      this.placeOnBoard(tackler, slideCell.x, slideCell.y);
    }
    this.addTeamStat("tacklesLost", tackler.teamId);
    this.addTeamStat("tacklesWon", carrier.teamId);
    this.addPlayerStat(tackler, "tacklesLost");
    this.addPlayerStat(carrier, "tacklesWon");
    this.state.selectedAction = null;
    this.pushLog(`${tackler.name} проскальзывает мимо соперника (${roll}).`);
    return true;
  }

  resolveDribbleAgainst(targetCell) {
    const dribbler = this.getPlayer(this.state.selectedPlayerId);
    if (!dribbler || this.state.selectedAction !== "dribble") {
      return false;
    }
    const validTarget = this.getDribbleTargets(dribbler).find(
      (cell) => cell.x === targetCell.x && cell.y === targetCell.y,
    );
    if (!validTarget) {
      return false;
    }

    const defender = this.getPlayer(this.state.board[targetCell.y][targetCell.x]);
    this.spendActionPoints(1);
    const surge = this.consumeSurgeIfArmed();
    const untouchableBonus =
      dribbler.abilityId === "untouchable" && dribbler.abilityArmed && !dribbler.abilityUsed
        ? 4
        : 0;
    const defenseRoll = this.rollD6();
    const defenderBonus = defenseRoll > 3 ? defenseRoll : 0;
    const attack = dribbler.dribble + surge + untouchableBonus;
    const defense = defender.tackle + defenderBonus;

    if (untouchableBonus > 0) {
      this.consumeAbility(dribbler);
    }

    if (defense >= attack) {
      this.giveBallToPlayer(defender);
      this.addTeamStat("dribblesLost", dribbler.teamId);
      this.addTeamStat("dribblesWon", defender.teamId);
      this.addPlayerStat(dribbler, "dribblesLost");
      this.addPlayerStat(defender, "dribblesWon");
      this.state.selectedPlayerId = null;
      this.pushLog(`${defender.name} читает дриблинг и отбирает мяч: ${defense} против ${attack}.`);
    } else {
      this.placeOnBoard(dribbler, validTarget.landing.x, validTarget.landing.y);
      this.updateBallPosition();
      this.addTeamStat("dribblesWon", dribbler.teamId);
      this.addTeamStat("dribblesLost", defender.teamId);
      this.addPlayerStat(dribbler, "dribblesWon");
      this.addPlayerStat(defender, "dribblesLost");
      this.pushLog(`${dribbler.name} проходит ${defender.name}: ${attack} против ${defense}.`);
    }

    this.state.selectedAction = null;
    return true;
  }

  chooseShotAim(sector) {
    const pending = this.state.pendingChoice;
    if (pending?.type !== "shotAim" || !isShotSectorValid(sector)) {
      return false;
    }

    const shooter = this.getPlayer(pending.playerId);
    const defendingTeam = opposingTeam(shooter.teamId);
    const keeper = this.getGoalkeeper(defendingTeam);
    this.state.pendingChoice = {
      ...pending,
      type: "keeperDive",
      sector,
      defendingTeam,
      keeperId: keeper.id,
    };
    this.pushLog(`${shooter.name} прицеливается. ${keeper.name} выбирает прыжок.`);
    return true;
  }

  resolveShotDive(sector, useKeeperAbility = false) {
    const pending = this.state.pendingChoice;
    if (pending?.type !== "keeperDive" || !isShotSectorValid(sector)) {
      return false;
    }

    const shooter = this.getPlayer(pending.playerId);
    const keeper = this.getPlayer(pending.keeperId);
    if (!shooter || !keeper || !shooter.hasBall) {
      this.state.pendingChoice = null;
      this.state.selectedAction = null;
      return false;
    }

    this.spendActionPoints(pending.cost);
    this.addTeamStat("shots", shooter.teamId);
    this.addTeamStat("shotsOnTarget", shooter.teamId);
    this.addPlayerStat(shooter, "shots");
    this.addPlayerStat(shooter, "shotsOnTarget");
    const surge = this.consumeSurgeIfArmed();
    const shotRoll = this.rollD6();
    const longShotBonus =
      shooter.abilityId === "longShot" && shooter.abilityArmed && !shooter.abilityUsed ? 5 : 0;
    const keeperAbilityBonus =
      useKeeperAbility &&
      keeper.abilityId === "catReflexes" &&
      !keeper.abilityUsed
        ? 4
        : 0;

    const aim = parseShotSector(pending.sector);
    const dive = parseShotSector(sector);
    let directionBonus = 0;
    if (aim.vertical === dive.vertical) {
      directionBonus += 3;
    }
    if (aim.horizontal === dive.horizontal) {
      directionBonus += 3;
    }

    const attack = shooter.shot + shotRoll + surge + longShotBonus;
    const defense = keeper.goalkeeping + pending.distance + directionBonus + keeperAbilityBonus;

    if (longShotBonus > 0) {
      this.consumeAbility(shooter);
    }
    if (keeperAbilityBonus > 0) {
      this.consumeAbility(keeper);
    }

    this.state.pendingChoice = null;
    this.state.selectedAction = null;

    if (attack > defense) {
      const scoringTeam = this.getTeam(shooter.teamId);
      scoringTeam.score += 1;
      this.addTeamStat("goals", shooter.teamId);
      this.addPlayerStat(shooter, "goals");
      if (shooter.lastPasserId) {
        const assister = this.getPlayer(shooter.lastPasserId);
        if (assister && assister.teamId === shooter.teamId) {
          this.addTeamStat("assists", assister.teamId);
          this.addPlayerStat(assister, "assists");
        }
      }
      if (this.state.mode === "ai") {
        if (shooter.teamId === 0) {
          this.state.aiLevel = Math.min(3, this.state.aiLevel + 1);
        } else {
          this.state.aiLevel = Math.max(1, this.state.aiLevel - 1);
        }
      }
      this.pushLog(
        `${shooter.name} прошивает створ: ${attack} против ${defense}. Счёт ${this.getTeam(0).score}:${this.getTeam(1).score}.`,
      );

      if (scoringTeam.score >= MAX_SCORE) {
        this.state.phase = "ended";
        this.state.selectedPlayerId = null;
        this.clearTransientMarks();
        this.pushLog(`${scoringTeam.name} побеждают, первыми добравшись до ${MAX_SCORE} голов.`);
        return true;
      }

      this.resetAfterGoal(opposingTeam(shooter.teamId));
      return true;
    }

    this.giveBallToPlayer(keeper);
    this.addTeamStat("saves", keeper.teamId);
    this.addPlayerStat(keeper, "saves");
    this.pushLog(
      `${keeper.name} тащит удар: ${defense} против ${attack}. Контратака за ${this.getTeam(keeper.teamId).shortName}.`,
    );
    this.startTurn(keeper.teamId, "После сейва мяч у вратаря");
    return true;
  }

  resetAfterGoal(kickoffTeam) {
    this.clearBoard();
    for (const player of Object.values(this.state.players)) {
      const formation = this.state.placement.formation[player.id];
      if (formation) {
        player.hasBall = false;
        player.lastPasserId = null;
        this.placeOnBoard(player, formation.x, formation.y);
      }
    }
    this.moveBallToCell(7, 4);
    this.state.selectedPlayerId = null;
    this.state.selectedAction = null;
    this.state.pendingChoice = null;
    this.startTurn(kickoffTeam, `После гола разводят ${this.getTeam(kickoffTeam).shortName}`);
  }

  clickCell(x, y) {
    if (!inBounds(x, y)) {
      return false;
    }

    if (this.state.phase === "placement") {
      return this.placeSelectedPlayer(x, y);
    }

    if (this.state.phase !== "match") {
      return false;
    }

    if (this.state.pendingChoice?.type === "bounce") {
      return this.resolveBounce(x, y);
    }

    const occupantId = this.state.board[y][x];
    if (!this.state.selectedAction) {
      if (occupantId) {
        return this.selectPlayer(occupantId);
      }
      this.state.selectedPlayerId = null;
      return false;
    }

    if (this.state.selectedAction === "move") {
      return this.resolveMoveTo({ x, y });
    }
    if (this.state.selectedAction === "pass") {
      return this.resolvePassTo({ x, y });
    }
    if (this.state.selectedAction === "tackle") {
      return this.resolveTackleAgainst({ x, y });
    }
    if (this.state.selectedAction === "slide") {
      return this.resolveSlideAgainst({ x, y });
    }
    if (this.state.selectedAction === "dribble") {
      return this.resolveDribbleAgainst({ x, y });
    }
    return false;
  }

  getCellHighlights() {
    const highlights = new Map();

    if (this.state.phase === "placement") {
      const player = this.getPlayer(this.state.placement.selectedPlayerId);
      if (!player) {
        return highlights;
      }
      for (let y = 0; y < FIELD_HEIGHT; y += 1) {
        for (let x = 0; x < FIELD_WIDTH; x += 1) {
          if (this.canPlacePlayer(player, x, y)) {
            highlights.set(cellKey(x, y), {
              type: "placement",
              label: player.position === "GK" ? "GK" : "Старт",
            });
          }
        }
      }
      return highlights;
    }

    if (this.state.phase !== "match") {
      return highlights;
    }

    if (this.state.pendingChoice?.type === "bounce") {
      for (const option of this.state.pendingChoice.options) {
        highlights.set(cellKey(option.x, option.y), {
          type: "bounce",
          label: "Рикошет",
        });
      }
      return highlights;
    }

    const selected = this.getPlayer(this.state.selectedPlayerId);
    if (!selected || !this.state.selectedAction) {
      return highlights;
    }

    let targets = [];
    if (this.state.selectedAction === "move") {
      targets = this.getMoveTargets(selected).map((cell) => ({
        ...cell,
        type: "move",
        label: `${cell.cost}`,
      }));
    } else if (this.state.selectedAction === "pass") {
      targets = this.getPassTargets(selected).map((cell) => ({
        ...cell,
        type: "pass",
        label: `${cell.cost}`,
      }));
    } else if (this.state.selectedAction === "tackle") {
      targets = this.getTackleTargets(selected).map((cell) => ({
        ...cell,
        type: "tackle",
        label: "2",
      }));
    } else if (this.state.selectedAction === "slide") {
      targets = this.getSlideTargets(selected).map((cell) => ({
        ...cell,
        type: "slide",
        label: "2",
      }));
    } else if (this.state.selectedAction === "dribble") {
      targets = this.getDribbleTargets(selected).map((cell) => ({
        ...cell,
        type: "dribble",
        label: "1",
      }));
    }

    for (const target of targets) {
      highlights.set(cellKey(target.x, target.y), target);
    }

    return highlights;
  }
}

export { SHOT_SECTORS };
