import assert from "node:assert/strict";
import { FootballTurnGame } from "../src/game.js";

function setupMatch() {
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
  assert.equal(game.buyCard(draftSequence.at(-1)).ok, true, "Драфт должен завершиться");

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

  assert.equal(game.state.phase, "match", "Матч должен стартовать после расстановки");
  return game;
}

const game = setupMatch();
const tackler = game.getPlayer("def-egor-hardov");
const carrier = game.getPlayer("mid-lev-ritmov");

game.placeOnBoard(tackler, 6, 4);
game.placeOnBoard(carrier, 7, 4);
game.giveBallToPlayer(carrier);
game.state.turn.activeTeam = 0;
game.state.turn.actionPoints = 4;
game.state.turn.surgeArmed = false;
game.state.turn.surgeUsed = false;
game.state.selectedPlayerId = tackler.id;
game.setDebugRollQueue([1, 3, 2]);

assert.equal(game.setAction("slide"), true, "Подкат должен активироваться");
assert.equal(game.clickCell(7, 4), true, "Фол в подкате должен быть разрешён");

assert.equal(game.state.freeKick?.teamId, 1, "После фола соперник должен получить штрафной");
assert.equal(game.state.turn.activeTeam, 1, "Ход должен перейти команде, пробивающей штрафной");
assert.deepEqual(game.state.turn.dice, [3, 2], "Штрафной должен запускать новый бросок кубиков");
assert.equal(game.state.stats.fouls[0], 1, "Фол должен попадать в статистику");
assert.equal(tackler.suspended, true, "Нарушитель должен быть помечен как выведенный из эпизода");
assert.equal(game.state.ball.carrierId, carrier.id, "Мяч должен остаться у команды, пробивающей штрафной");

assert.equal(game.endTurn("Штрафной разыгран."), true, "Штрафной должен завершаться обычным endTurn");
assert.equal(game.state.turn.activeTeam, 0, "После штрафного ход должен вернуться исходной стороне");
assert.equal(game.state.freeKick, null, "Метка штрафного должна очищаться после смены хода");
assert.equal(tackler.suspended, false, "Отметка вывода из эпизода должна сниматься после штрафного");
assert.equal(game.selectPlayer(tackler.id), true, "После штрафного игрок снова должен выбираться");

console.log("match-systems-test: ok");
