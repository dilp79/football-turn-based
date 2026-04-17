import assert from "node:assert/strict";
import { FootballTurnGame } from "../src/game.js";
import {
  chooseAiBounce,
  chooseAiKeeperDive,
  chooseAiShotSector,
  executeAiAction,
  pickAiDraftCard,
  pickAiPlacement,
  planAiMatchStep,
  shouldAiUseKeeperAbility,
} from "../src/ai.js";

function runAiUntilHumanDecision(game, maxSteps = 32) {
  let steps = 0;

  while (game.isAiControlledTeam(game.getDecisionTeamId()) && steps < maxSteps) {
    steps += 1;

    if (game.state.phase === "draft") {
      const cardId = pickAiDraftCard(game);
      assert.ok(cardId, "ИИ должен выбрать карточку на драфте");
      const result = game.buyCard(cardId);
      assert.equal(result.ok, true, "Покупка ИИ на драфте должна быть легальной");
      continue;
    }

    if (game.state.phase === "placement") {
      const placement = pickAiPlacement(game);
      assert.ok(placement, "ИИ должен выбрать клетку расстановки");
      game.state.placement.selectedPlayerId = placement.playerId;
      assert.equal(
        game.clickCell(placement.x, placement.y),
        true,
        "ИИ должен успешно ставить игрока на поле",
      );
      continue;
    }

    if (game.state.phase !== "match") {
      break;
    }

    if (game.state.pendingChoice?.type === "shotAim") {
      assert.equal(
        game.chooseShotAim(chooseAiShotSector(game)),
        true,
        "ИИ должен выбрать сектор удара",
      );
      continue;
    }

    if (game.state.pendingChoice?.type === "keeperDive") {
      assert.equal(
        game.resolveShotDive(
          chooseAiKeeperDive(game),
          shouldAiUseKeeperAbility(game),
        ),
        true,
        "ИИ должен завершить фазу прыжка вратаря",
      );
      continue;
    }

    if (game.state.pendingChoice?.type === "bounce") {
      const bounce = chooseAiBounce(game);
      assert.ok(bounce, "ИИ должен выбрать клетку рикошета");
      assert.equal(
        game.clickCell(bounce.x, bounce.y),
        true,
        "ИИ должен успешно выбирать рикошет",
      );
      continue;
    }

    const actions = planAiMatchStep(game);
    assert.ok(actions.length > 0, "ИИ должен спланировать хотя бы одно действие");

    let acted = false;
    for (const action of actions) {
      acted = executeAiAction(game, action) || acted;
    }

    assert.equal(acted, true, "ИИ должен исполнить действие");
  }

  assert.ok(steps < maxSteps, "Цикл решений ИИ не должен застревать");
}

function pickHumanDraftCard(game) {
  const teamId = game.state.draft.activeTeam;
  const counts = game.getRosterCounts(teamId);
  const legalCards = game.state.marketIds
    .filter((cardId) => game.canBuyCard(cardId, teamId).ok)
    .map((cardId) => game.getCard(cardId))
    .sort((left, right) => left.cost - right.cost || left.position.localeCompare(right.position));

  if (counts.goalkeepers === 0) {
    const goalkeeper = legalCards.find((card) => card.position === "GK");
    if (goalkeeper) {
      return goalkeeper.id;
    }
  }

  const fieldCard = legalCards.find((card) => card.position !== "GK");
  return fieldCard?.id ?? legalCards[0]?.id ?? null;
}

const game = new FootballTurnGame({ rng: () => 0 });
game.setMode("ai");
game.setDebugRollQueue([6, 4, 6, 5, 5, 4, 4, 4, 4, 4, 4, 4]);

for (let index = 0; index < 5; index += 1) {
  const cardId = pickHumanDraftCard(game);
  assert.ok(cardId, "Человек должен иметь легальный пик на драфте");
  const result = game.buyCard(cardId);
  assert.equal(result.ok, true, `Человек должен успешно купить ${cardId}`);
  runAiUntilHumanDecision(game);
}

assert.equal(game.state.phase, "placement", "После драфта начинается расстановка");
assert.equal(game.state.mode, "ai", "Режим против ИИ должен сохраняться");
const humanPlacementSteps = [
  [0, 4],
  [3, 2],
  [3, 6],
  [5, 3],
  [6, 4],
];

for (const [x, y] of humanPlacementSteps) {
  assert.equal(game.clickCell(x, y), true, `Человек должен поставить игрока в ${x}:${y}`);
  runAiUntilHumanDecision(game);
}

assert.equal(game.state.phase, "match", "После расстановки стартует матч");
assert.equal(game.state.turn.activeTeam, 0, "Первый ход в smoke-тесте остаётся за человеком");

assert.equal(game.endTurn("Переход хода к ИИ для smoke-теста."), true);
runAiUntilHumanDecision(game);

assert.equal(game.state.phase, "match", "После хода ИИ матч должен продолжаться");
assert.equal(
  game.isAiControlledTeam(game.getDecisionTeamId()),
  false,
  "После завершения ответа ИИ управление должно вернуться человеку или закончить матч",
);

console.log("ai-smoke-test: ok");
