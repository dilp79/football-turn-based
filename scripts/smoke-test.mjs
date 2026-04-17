import assert from "node:assert/strict";
import { FootballTurnGame } from "../src/game.js";

const game = new FootballTurnGame();

const draftSequence = [
  "gk-denis-barierov",
  "mid-yaroslav-dirizher",
  "mid-timur-tempo",
  "fwd-viktor-obvod",
  "def-kirill-polev",
  "def-maksim-zubov",
  "fwd-anton-vyvorot",
  "gk-semyon-shchitov",
  "def-egor-hardov",
  "mid-lev-ritmov",
];

for (const cardId of draftSequence.slice(0, -1)) {
  const result = game.buyCard(cardId);
  assert.equal(result.ok, true, `Не удалось купить ${cardId}`);
}

game.setDebugRollQueue([6, 4, 6, 6, 6]);
const lastDraftPick = game.buyCard(draftSequence.at(-1));
assert.equal(lastDraftPick.ok, true, "Последний пик драфта не прошёл");
assert.equal(game.state.phase, "placement", "После драфта должна начаться расстановка");
assert.equal(game.state.kickoff.winner, 0, "Команда 0 должна выиграть стартовый бросок");

const placementSteps = [
  [0, 4],
  [5, 4],
  [3, 2],
  [6, 4],
  [2, 6],
  [9, 4],
  [10, 2],
  [11, 6],
  [14, 4],
  [8, 5],
];

for (const [x, y] of placementSteps) {
  assert.equal(game.clickCell(x, y), true, `Не удалось поставить игрока в ${x}:${y}`);
}

assert.equal(game.state.phase, "match", "После расстановки должен начаться матч");
assert.equal(game.state.turn.activeTeam, 0, "Матч должна открывать команда 0");
assert.deepEqual(game.state.turn.dice, [6, 6], "Стартовые кубики должны быть 6 и 6");
assert.equal(game.state.turn.actionPoints, 12, "Сумма очков действий должна быть 12");

game.selectPlayer("fwd-anton-vyvorot");
assert.equal(game.setAction("move"), true, "Не удалось активировать перемещение");
assert.equal(game.clickCell(7, 4), true, "Не удалось подобрать мяч с центра");
assert.equal(game.getPlayer("fwd-anton-vyvorot").hasBall, true, "Нападающий должен владеть мячом");
assert.equal(game.state.turn.actionPoints, 11, "Перемещение на одну клетку должно стоить 1 ОД");

assert.equal(game.setAction("pass"), true, "Не удалось активировать пас");
assert.equal(game.clickCell(5, 4), true, "Пас на Тимура не прошёл");
assert.equal(game.getPlayer("mid-timur-tempo").hasBall, true, "После паса мяч должен перейти к Тимуру");
assert.equal(game.state.stats.passAttempts[0], 1, "Пас должен считаться в attempts");
assert.equal(game.state.stats.passCompletions[0], 1, "Успешный пас должен считаться в completions");

const shooter = game.getPlayer("mid-timur-tempo");
game.placeOnBoard(shooter, 12, 4);
game.updateBallPosition();
game.state.selectedPlayerId = shooter.id;
game.state.turn.actionPoints = 10;
game.state.turn.surgeArmed = false;
game.state.turn.surgeUsed = false;
game.setDebugRollQueue([6, 3, 2]);
assert.equal(game.setAction("shoot"), true, "Не удалось подготовить удар");
assert.equal(game.chooseShotAim("mid-left"), true, "Не удалось выбрать сектор удара");
assert.equal(game.resolveShotDive("low-right", false), true, "Удар по воротам не был разрешён");
assert.equal(game.getTeam(0).score, 1, "После удара команда 0 должна повести в счёте");
assert.equal(game.state.turn.activeTeam, 1, "После гола мяч должна разводить пропустившая команда");
assert.equal(game.state.stats.shots[0], 1, "Удар должен считаться в статистике");
assert.equal(game.state.stats.goals[0], 1, "Гол должен считаться в статистике");
assert.equal(game.state.stats.assists[0], 1, "Голевой пас должен считаться в статистике");

console.log("smoke-test: ok");
