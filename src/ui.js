import {
  ABILITIES,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  GOALS,
  PLAYER_CATALOG,
  POSITION_LABELS,
  TEAM_DEFS,
} from "./data.js";
import { SHOT_SECTORS } from "./game.js";
import { cellKey } from "./utils.js";
import { createBallSprite, createPlayerSprite } from "./sprites.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getPhaseLabel(game) {
  switch (game.state.phase) {
    case "draft":
      return "Драфт";
    case "placement":
      return "Расстановка";
    case "match":
      return "Матч";
    case "ended":
      return "Финиш";
    default:
      return "";
  }
}

function getActiveTeamId(game) {
  if (game.state.phase === "draft") {
    return game.state.draft.activeTeam;
  }
  if (game.state.phase === "placement") {
    return game.state.placement.teamOrder[game.state.placement.index] ?? null;
  }
  if (game.state.phase === "match") {
    return game.state.turn.activeTeam;
  }
  return null;
}

function getModeLabel(game) {
  return game.state.mode === "ai" ? "Игрок против ИИ" : "Два игрока";
}

function getControllerLabel(game, teamId) {
  return game.isAiControlledTeam(teamId) ? "ИИ" : "Игрок";
}

function isTutorialActive(tutorial) {
  return Boolean(tutorial?.isActive?.());
}

function isTutorialAnchorActive(tutorial, anchor) {
  return Boolean(tutorial?.isAnchorActive?.(anchor));
}

function tutorialFocusClass(tutorial, anchor) {
  return isTutorialAnchorActive(tutorial, anchor) ? "tutorial-focus" : "";
}

function isAiThinking(game) {
  return game.isAiControlledTeam(game.getDecisionTeamId());
}

function renderModeSwitcher(game, tutorial = null) {
  const tutorialModeLock = isTutorialActive(tutorial);
  return `
    <div class="mode-switch">
      <button class="chip ${game.state.mode === "hotseat" ? "chip--active" : ""}" data-mode-set="hotseat" ${tutorialModeLock ? 'disabled title="Обучение запускается только против ИИ."' : ""}>
        2 игрока
      </button>
      <button class="chip ${game.state.mode === "ai" ? "chip--active" : ""}" data-mode-set="ai">
        vs ИИ
      </button>
    </div>
  `;
}

function getInstruction(game) {
  if (game.state.phase === "draft") {
    const team = game.getCurrentTeam();
    return `${getControllerLabel(game, team.id)} ${team.name} добирают состав. Бюджет ${team.coins} монет.`;
  }
  if (game.state.phase === "placement") {
    const team = game.getCurrentTeam();
    const player = game.getPlayer(game.state.placement.selectedPlayerId);
    if (!player) {
      return `${getControllerLabel(game, team.id)} ${team.name} расставляют состав.`;
    }
    return `${getControllerLabel(game, team.id)} ${team.name} ставят ${player.name}. Вратарь должен занять створ, остальные остаются на своей половине.`;
  }
  if (game.state.phase === "ended") {
    const score = `${game.getTeam(0).score}:${game.getTeam(1).score}`;
    return `Матч завершён. Итоговый счёт ${score}.`;
  }
  if (game.state.phase === "match" && game.state.freeKick && !game.state.pendingChoice) {
    const team = game.getTeam(game.state.freeKick.teamId);
    const suspendedPlayer = game.getPlayer(game.state.freeKick.suspendedPlayerId);
    return `${team.name} разыгрывают штрафной. ${suspendedPlayer?.name ?? "Нарушитель"} выведен из эпизода до конца этого владения.`;
  }
  if (game.state.pendingChoice?.type === "bounce") {
    const team = game.getTeam(game.state.pendingChoice.actorTeam);
    return `${team.name} выбирают соседнюю клетку для рикошета после неудачного приёма.`;
  }
  if (game.state.pendingChoice?.type === "shotAim") {
    return "Выберите сектор удара по воротам.";
  }
  if (game.state.pendingChoice?.type === "keeperDive") {
    const keeper = game.getPlayer(game.state.pendingChoice.keeperId);
    return `${keeper.name} выбирает прыжок в створ.`;
  }
  if (game.state.selectedAction === "move") {
    return "Выберите клетку для перемещения. Число в маркере показывает стоимость в ОД.";
  }
  if (game.state.selectedAction === "pass") {
    return "Выберите партнёра или свободную клетку для паса.";
  }
  if (game.state.selectedAction === "tackle") {
    return "Выберите соседнего соперника с мячом для отбора.";
  }
  if (game.state.selectedAction === "slide") {
    return "Выберите цель для подката. Это рискованный отбор.";
  }
  if (game.state.selectedAction === "dribble") {
    return "Выберите соседнего соперника, через которого пойдёт дриблинг.";
  }
  const team = game.getCurrentTeam();
  if (!team) {
    return "";
  }
  if (isAiThinking(game)) {
    return `ИИ ${team.shortName} просчитывает следующий шаг. Поле временно заблокировано.`;
  }
  return `${team.name} ходят. Выберите своего игрока, затем действие.`;
}

function renderRuleTags(tags) {
  return `
    <div class="rule-tags">
      ${tags.map((tag) => `<span class="rule-tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function renderTeamStrip(game, tutorial = null) {
  const activeTeamId = getActiveTeamId(game);
  return `
    <section class="team-strip ${tutorialFocusClass(tutorial, "team-strip")}">
      ${TEAM_DEFS.map((team) => {
        const teamState = game.getTeam(team.id);
        const isActive = activeTeamId === team.id;
        return `
          <section class="team-strip__card ${isActive ? "team-strip__card--active" : ""}" style="--team:${team.color}; --team-dark:${team.colorDark}; --team-accent:${team.accent}">
            <div class="team-strip__top">
              <span class="team-strip__name">${escapeHtml(team.name)}</span>
              <span class="team-strip__score">${teamState.score}</span>
            </div>
            <div class="team-strip__meta">
              <span>${teamState.coins} мон.</span>
              <span>Состав ${teamState.rosterIds.length}/5</span>
              <span>${escapeHtml(getControllerLabel(game, team.id))}</span>
              <span>${isActive ? "На очереди" : "Ожидание"}</span>
            </div>
          </section>
        `;
      }).join("")}
    </section>
  `;
}

function renderHeroBar(game, { audioMuted = true, tutorial = null } = {}) {
  const progress = tutorial?.getProgress?.() ?? null;
  const currentStep = tutorial?.getCurrentStep?.() ?? null;
  return `
    <header class="hero-bar">
      <div>
        <div class="hero-bar__eyebrow">Turn-Based Pixel Football</div>
        <h1>Пошаговый футбол</h1>
        <p>${escapeHtml(getInstruction(game))}</p>
      </div>
      <div class="hero-bar__actions">
        <div class="phase-pill">${getPhaseLabel(game)}</div>
        <div class="mode-pill">${escapeHtml(getModeLabel(game))}</div>
        ${isAiThinking(game) ? '<div class="ai-pill">ИИ думает...</div>' : ""}
        ${
          isTutorialActive(tutorial) && progress
            ? `<div class="tutorial-pill">${currentStep ? `Обучение ${progress.current}/${progress.total}` : "Обучение активно"}</div>`
            : ""
        }
        ${renderModeSwitcher(game, tutorial)}
        <button class="chip ${isTutorialActive(tutorial) ? "chip--active" : ""}" data-tutorial-restart>
          ${isTutorialActive(tutorial) ? "Обучение сначала" : "Повторить обучение"}
        </button>
        <button class="chip" data-mute-toggle>
          ${audioMuted ? "Звук: выкл" : "Звук: вкл"}
        </button>
        <button class="chip" data-reset>Новый матч</button>
      </div>
    </header>
  `;
}

function renderStatLine(label, value, suffix = "") {
  return `<li><span>${label}</span><strong>${value}${suffix}</strong></li>`;
}

function renderPlayerCard(
  game,
  playerLike,
  { clickable = false, selected = false, teamId = null, market = false } = {},
) {
  const player =
    playerLike.id in game.state.players ? game.getPlayer(playerLike.id) : playerLike;
  const teamRef = teamId ?? player.teamId ?? null;
  const ability = player.abilityId ? ABILITIES[player.abilityId] : null;
  const validation = market ? game.canBuyCard(player.id) : { ok: true, reason: "" };
  const buttonAttrs = clickable
    ? `data-player-card="${player.id}" ${!validation.ok ? "disabled" : ""}`
    : "";

  return `
    <button class="player-card ${selected ? "player-card--selected" : ""} ${!validation.ok ? "player-card--disabled" : ""}" ${buttonAttrs}>
      <div class="player-card__top">
        <img class="player-card__sprite" src="${createPlayerSprite(player, teamRef)}" alt="${escapeHtml(player.name)}" />
        <div>
          <div class="player-card__name">${escapeHtml(player.name)}</div>
          <div class="player-card__meta">${escapeHtml(POSITION_LABELS[player.position])} · ${player.cost} монет</div>
          ${player.goalkeeping ? `<div class="player-card__meta">Игра на линии ${player.goalkeeping}</div>` : ""}
        </div>
      </div>
      <ul class="player-card__stats">
        ${renderStatLine("Удар", player.shot)}
        ${renderStatLine("Пас", player.pass)}
        ${renderStatLine("Приём", `${player.receive}+`)}
        ${renderStatLine("Дриблинг", player.dribble)}
        ${renderStatLine("Скорость", player.speed)}
        ${renderStatLine("Отбор", player.tackle)}
        ${renderStatLine("Перехват", `${player.intercept}+`)}
      </ul>
      <div class="player-card__footer">
        <span class="badge">${player.throughPass ? "Пас вразрез" : "Только в ноги"}</span>
        ${
          ability
            ? `<span class="badge badge--ability ${player.abilityUsed ? "badge--spent" : player.abilityArmed ? "badge--armed" : ""}">${escapeHtml(ability.label)}</span>`
            : `<span class="badge">Без супера</span>`
        }
      </div>
      ${market && !validation.ok ? `<div class="player-card__hint">${escapeHtml(validation.reason)}</div>` : ""}
    </button>
  `;
}

function getRosterNeeds(game, teamId) {
  const counts = game.getRosterCounts(teamId);
  const needs = [];
  if (counts.goalkeepers === 0) {
    needs.push("Нужен вратарь");
  }
  if (counts.fieldPlayers < 4) {
    needs.push(`Ещё ${4 - counts.fieldPlayers} полевых`);
  }
  if (needs.length === 0) {
    needs.push("Состав легален");
  }
  return needs;
}

function getMiniRosterStatus(game, player, mode) {
  if (mode === "placement") {
    return player.x === null ? "Ожидает" : "На поле";
  }
  if (mode === "match") {
    if (player.suspended) {
      return "Штрафной";
    }
    if (player.hasBall) {
      return "Мяч";
    }
    if (player.abilityArmed) {
      return "Супер";
    }
    if (player.abilityUsed) {
      return "Супер-";
    }
  }
  return POSITION_LABELS[player.position];
}

function renderStatsRows(game) {
  const stats = game.state.stats;
  const rows = [
    {
      label: "Владение",
      left: `${game.getPossessionShare(0)}%`,
      right: `${game.getPossessionShare(1)}%`,
    },
    {
      label: "Удары",
      left: stats.shots[0],
      right: stats.shots[1],
    },
    {
      label: "В створ",
      left: stats.shotsOnTarget[0],
      right: stats.shotsOnTarget[1],
    },
    {
      label: "Пасы",
      left: `${stats.passCompletions[0]}/${stats.passAttempts[0]}`,
      right: `${stats.passCompletions[1]}/${stats.passAttempts[1]}`,
    },
    {
      label: "Точность",
      left: `${game.getPassAccuracy(0)}%`,
      right: `${game.getPassAccuracy(1)}%`,
    },
    {
      label: "Отборы",
      left: stats.tacklesWon[0],
      right: stats.tacklesWon[1],
    },
    {
      label: "Дриблинг",
      left: stats.dribblesWon[0],
      right: stats.dribblesWon[1],
    },
    {
      label: "Сейвы",
      left: stats.saves[0],
      right: stats.saves[1],
    },
    {
      label: "Фолы",
      left: stats.fouls[0],
      right: stats.fouls[1],
    },
  ];

  return rows
    .map(
      (row) => `
        <div class="stats-row">
          <span class="stats-row__value">${escapeHtml(row.left)}</span>
          <span class="stats-row__label">${escapeHtml(row.label)}</span>
          <span class="stats-row__value">${escapeHtml(row.right)}</span>
        </div>
      `,
    )
    .join("");
}

function renderMvpCard(game) {
  const mvp = game.getMVP();
  if (!mvp) {
    return `
      <section class="mvp-card">
        <div class="panel-card__eyebrow">MVP</div>
        <h3>Без явного героя</h3>
        <p>Матч завершился без ярко выраженного лидера по ключевым действиям.</p>
      </section>
    `;
  }

  return `
    <section class="mvp-card">
      <div class="panel-card__eyebrow">MVP Матча</div>
      <div class="mvp-card__head">
        <img class="selected-player__sprite" src="${createPlayerSprite(mvp, mvp.teamId)}" alt="${escapeHtml(mvp.name)}" />
        <div>
          <h3>${escapeHtml(mvp.name)}</h3>
          <p>${escapeHtml(TEAM_DEFS[mvp.teamId].shortName)} · ${escapeHtml(POSITION_LABELS[mvp.position])}</p>
        </div>
      </div>
      <div class="mvp-card__stats">
        <span>Голы ${mvp.playerStats.goals}</span>
        <span>Ассисты ${mvp.playerStats.assists}</span>
        <span>Отборы ${mvp.playerStats.tacklesWon}</span>
        <span>Дриблинг ${mvp.playerStats.dribblesWon}</span>
        <span>Сейвы ${mvp.playerStats.saves}</span>
      </div>
    </section>
  `;
}

function renderMatchStatsPanel(game, tutorial = null) {
  return `
    <section class="panel-card panel-card--stats ${tutorialFocusClass(tutorial, "stats-overlay")}">
      <div class="panel-card__eyebrow">${game.state.phase === "ended" ? "Статистика матча" : "Пульс матча"}</div>
      <h2>${game.state.phase === "ended" ? "Сводка" : "Live метрики"}</h2>
      <div class="stats-table">
        <div class="stats-table__head">
          <span>${escapeHtml(game.getTeam(0).shortName)}</span>
          <span>Показатель</span>
          <span>${escapeHtml(game.getTeam(1).shortName)}</span>
        </div>
        ${renderStatsRows(game)}
      </div>
    </section>
  `;
}

function renderMiniRoster(game, teamId, { mode, clickable = false, selectedId = null } = {}) {
  const team = game.getTeam(teamId);
  if (!team.rosterIds.length) {
    return `<div class="empty-state">Состав ещё не набран.</div>`;
  }

  return `
    <div class="roster-mini-list roster-mini-list--${escapeHtml(mode)}">
      ${team.rosterIds
        .map((id) => {
          const player = game.getPlayer(id);
          const isSelected = selectedId === id;
          const status = getMiniRosterStatus(game, player, mode);
          const attrs =
            clickable && !(mode === "placement" && player.x !== null)
              ? `data-player-card="${player.id}"`
              : "";
          const disabled =
            clickable && mode === "placement" && player.x !== null ? "disabled" : "";
          return `
            <button class="roster-mini ${isSelected ? "roster-mini--selected" : ""} ${player.x !== null && mode === "placement" ? "roster-mini--placed" : ""} ${player.hasBall ? "roster-mini--ball" : ""}" ${attrs} ${disabled}>
              <img class="roster-mini__sprite" src="${createPlayerSprite(player, player.teamId)}" alt="${escapeHtml(player.name)}" />
              <div class="roster-mini__body">
                <div class="roster-mini__name">${escapeHtml(player.name)}</div>
                <div class="roster-mini__meta">${escapeHtml(status)}</div>
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSelectedPanel(game) {
  const playerId =
    game.state.phase === "placement"
      ? game.state.placement.selectedPlayerId
      : game.state.selectedPlayerId;
  const player = game.getPlayer(playerId);
  if (!player) {
    return `
      <section class="panel-card">
        <div class="panel-card__eyebrow">Фокус</div>
        <h2>Игрок не выбран</h2>
        <p>Выберите карточку состава или фишку на поле.</p>
      </section>
    `;
  }

  const ability = game.getAbility(player);
  return `
    <section class="panel-card">
      <div class="panel-card__eyebrow">Выбранный игрок</div>
      <div class="selected-player">
        <img class="selected-player__sprite" src="${createPlayerSprite(player, player.teamId)}" alt="${escapeHtml(player.name)}" />
        <div>
          <h2>${escapeHtml(player.name)}</h2>
          <p>${escapeHtml(POSITION_LABELS[player.position])} · ${player.cost} монет</p>
          <p>${player.hasBall ? "С мячом" : "Без мяча"}${player.position === "GK" ? " · Вратарь зафиксирован в створе" : ""}${player.suspended ? " · Пропускает штрафной розыгрыш" : ""}</p>
        </div>
      </div>
      <ul class="selected-player__stats">
        ${renderStatLine("Удар", player.shot)}
        ${renderStatLine("Пас", player.pass)}
        ${renderStatLine("Приём", `${player.receive}+`)}
        ${renderStatLine("Дриблинг", player.dribble)}
        ${renderStatLine("Скорость", player.speed)}
        ${renderStatLine("Отбор", player.tackle)}
        ${player.goalkeeping ? renderStatLine("Сейв", player.goalkeeping) : ""}
      </ul>
      ${
        ability
          ? `
            <div class="ability-box">
              <div class="ability-box__title">${escapeHtml(ability.label)}</div>
              <p>${escapeHtml(ability.description)}</p>
              ${
                game.state.phase === "match"
                  ? `<button class="chip ${player.abilityArmed ? "chip--active" : ""}" data-ability-toggle="${player.id}" ${player.abilityUsed || game.state.pendingChoice?.type === "bounce" ? "disabled" : ""}>
                      ${
                        player.abilityUsed
                          ? "Супер израсходован"
                          : player.abilityArmed
                            ? "Супер активирован"
                            : "Подготовить супер"
                      }
                    </button>`
                  : ""
              }
            </div>
          `
          : ""
      }
    </section>
  `;
}

function renderActionPanel(game, tutorial = null) {
  if (isAiThinking(game)) {
    return `
      <section class="panel-card ${tutorialFocusClass(tutorial, "action-panel")}">
        <div class="panel-card__eyebrow">Действия</div>
        <h2>Ход ИИ</h2>
        <p>Сейчас решение принимает команда ${escapeHtml(game.getTeam(game.getDecisionTeamId()).shortName)}. После их действия ручное управление вернётся автоматически.</p>
      </section>
    `;
  }

  const player = game.getPlayer(game.state.selectedPlayerId);
  if (!player || player.teamId !== game.state.turn.activeTeam) {
    return `
      <section class="panel-card ${tutorialFocusClass(tutorial, "action-panel")}">
        <div class="panel-card__eyebrow">Действия</div>
        <h2>Нет активной фишки</h2>
        <p>Выберите своего игрока, чтобы получить набор доступных действий.</p>
      </section>
    `;
  }

  const actions = game.getActionAvailability(player.id);
  const labels = {
    move: "Перемещение",
    pass: "Пас",
    shoot: "Удар",
    tackle: "Отбор",
    slide: "Подкат",
    dribble: "Дриблинг",
  };

  return `
    <section class="panel-card ${tutorialFocusClass(tutorial, "action-panel")}">
      <div class="panel-card__eyebrow">Действия</div>
      <h2>${escapeHtml(player.name)}</h2>
      <div class="action-grid">
        ${Object.entries(labels)
          .map(
            ([action, label]) => `
              <button class="action-btn ${game.state.selectedAction === action ? "action-btn--active" : ""}" data-action-set="${action}" ${!actions[action] || game.state.pendingChoice?.type === "bounce" ? "disabled" : ""}>
                ${escapeHtml(label)}
              </button>
            `,
          )
          .join("")}
      </div>
      <p class="subtle">
        ${player.position === "GK" ? "Вратарь не двигается, но может начинать атаки пасом после сейва." : "Фишки двигаются только по ортогонали, мяч подбирается автоматически."}
      </p>
    </section>
  `;
}

function renderEndSummary(game) {
  const winner = TEAM_DEFS.find((team) => game.getTeam(team.id).score >= 3) ?? null;
  const mvp = game.getMVP();
  return `
    <section class="panel-card panel-card--accent">
      <div class="panel-card__eyebrow">Финиш</div>
      <h2>${winner ? escapeHtml(winner.name) : "Матч завершён"}</h2>
      <p>Итоговый счёт ${game.getTeam(0).score}:${game.getTeam(1).score}. На поле открыта полная статистика матча${mvp ? `, а MVP стал ${escapeHtml(mvp.name)}` : ""}.</p>
      <div class="toggle-row">
        <button class="chip chip--active" data-reset>Новый матч</button>
      </div>
    </section>
  `;
}

function renderShotOverlay(game, tutorial = null) {
  const pending = game.state.pendingChoice;
  if (!pending || (pending.type !== "shotAim" && pending.type !== "keeperDive")) {
    if (game.state.phase !== "ended") {
      return "";
    }
    const winner = TEAM_DEFS.find((team) => game.getTeam(team.id).score >= 3) ?? null;
    return `
      <div class="pitch-overlay">
        <section class="overlay-panel overlay-panel--end overlay-panel--stats ${tutorialFocusClass(tutorial, "stats-overlay")}">
          <div class="panel-card__eyebrow">Матч завершён</div>
          <h2>${winner ? escapeHtml(winner.name) : "Финальный свисток"}</h2>
          <p>Счёт ${game.getTeam(0).score}:${game.getTeam(1).score}. Теперь поверх поля показывается полная статистика, чтобы матч читался не только по голам, но и по рисунку игры.</p>
          <div class="stats-table">
            <div class="stats-table__head">
              <span>${escapeHtml(game.getTeam(0).shortName)}</span>
              <span>Показатель</span>
              <span>${escapeHtml(game.getTeam(1).shortName)}</span>
            </div>
            ${renderStatsRows(game)}
          </div>
          ${renderMvpCard(game)}
          <div class="end-actions">
            <button class="chip chip--active" data-reset>Реванш</button>
          </div>
        </section>
      </div>
    `;
  }

  const keeper = pending.type === "keeperDive" ? game.getPlayer(pending.keeperId) : null;
  const titles = {
    high: "Верх",
    mid: "Центр",
    low: "Низ",
    left: "Лево",
    center: "Центр",
    right: "Право",
  };

  return `
    <div class="pitch-overlay">
      <section class="overlay-panel ${tutorialFocusClass(tutorial, "shot-overlay")}">
        <div class="panel-card__eyebrow">${pending.type === "shotAim" ? "Выбор удара" : "Прыжок вратаря"}</div>
        <h2>${pending.type === "shotAim" ? "Сектор удара" : "Сектор сейва"}</h2>
        <p>${escapeHtml(getInstruction(game))}</p>
        ${
          keeper
            ? `
              <div class="toggle-row">
                <button class="chip ${keeper.abilityArmed ? "chip--active" : ""}" data-ability-toggle="${keeper.id}" ${keeper.abilityUsed ? "disabled" : ""}>
                  ${keeper.abilityUsed ? "Супер уже использован" : keeper.abilityArmed ? "Супер вратаря включён" : "Включить супер вратаря"}
                </button>
              </div>
            `
            : ""
        }
        <div class="shot-grid">
          ${SHOT_SECTORS.map((sector) => {
            const [vertical, horizontal] = sector.split("-");
            return `
              <button class="shot-grid__btn" data-shot-sector="${sector}">
                <span>${titles[vertical]}</span>
                <span>${titles[horizontal]}</span>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderField(
  game,
  {
    eyebrow = "Поле 15×9",
    title = "Пошаговый футбол",
    subtitle = getInstruction(game),
    overlay = "",
    tutorial = null,
    tutorialAnchor = "",
  } = {},
) {
  const highlights = game.getCellHighlights();
  const selectedId =
    game.state.phase === "placement"
      ? game.state.placement.selectedPlayerId
      : game.state.selectedPlayerId;
  const ballSprite = createBallSprite();
  const cells = [];

  for (let y = 0; y < FIELD_HEIGHT; y += 1) {
    for (let x = 0; x < FIELD_WIDTH; x += 1) {
      const occupantId = game.state.board[y][x];
      const player = occupantId ? game.getPlayer(occupantId) : null;
      const highlight = highlights.get(cellKey(x, y));
      const goalClass =
        (GOALS[0].x === x && GOALS[0].y === y) || (GOALS[1].x === x && GOALS[1].y === y)
          ? "cell--goal"
          : "";
      const midfieldClass = x === 7 ? "cell--midfield" : "";
      const cellClasses = [
        "cell",
        goalClass,
        midfieldClass,
        highlight ? `cell--${highlight.type}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      cells.push(`
        <button class="${cellClasses}" data-cell="${x}:${y}">
          ${highlight ? `<span class="cell__hint">${escapeHtml(highlight.label)}</span>` : ""}
          ${
            !game.state.ball.carrierId && game.state.ball.x === x && game.state.ball.y === y
              ? `<img class="ball ball--free" src="${ballSprite}" alt="Мяч" />`
              : ""
          }
          ${
            player
              ? `
                <div class="token token--team-${player.teamId} ${player.id === selectedId ? "token--selected" : ""} ${player.hasBall ? "token--ball" : ""}" title="${escapeHtml(player.name)}">
                  <img class="token__sprite" src="${createPlayerSprite(player, player.teamId)}" alt="${escapeHtml(player.name)}" />
                  <span class="token__label">${escapeHtml(player.position)}</span>
                  ${player.hasBall ? `<img class="ball ball--carrier" src="${ballSprite}" alt="" />` : ""}
                </div>
              `
              : ""
          }
        </button>
      `);
    }
  }

  return `
    <section class="pitch-frame ${tutorialFocusClass(tutorial, tutorialAnchor)}">
      <div class="pitch-header">
        <div>
          <span class="panel-card__eyebrow">${escapeHtml(eyebrow)}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="pitch-canvas">
        <div class="pitch-grid">
          ${cells.join("")}
        </div>
        ${overlay}
      </div>
    </section>
  `;
}

function renderLog(game, { compact = false } = {}) {
  const entries = compact ? game.state.log.slice(0, 6) : game.state.log;
  return `
    <section class="panel-card panel-card--log">
      <div class="panel-card__eyebrow">Лента матча</div>
      <h2>${compact ? "Ключевые эпизоды" : "Последние эпизоды"}</h2>
      <div class="log-list ${compact ? "log-list--compact" : ""}">
        ${entries.map((entry) => `<div class="log-item">${escapeHtml(entry.message)}</div>`).join("")}
      </div>
    </section>
  `;
}

function renderDraftLayout(game, tutorial = null) {
  const activeTeam = game.getCurrentTeam();
  const otherTeamId = activeTeam.id === 0 ? 1 : 0;
  const otherTeam = game.getTeam(otherTeamId);

  return `
    <main class="screen screen--draft">
      <section class="draft-main">
        <section class="panel-card panel-card--market ${tutorialFocusClass(tutorial, "draft-market")}">
          <div class="section-head">
            <div>
              <div class="panel-card__eyebrow">Рынок</div>
              <h2>${escapeHtml(activeTeam.name)} собирают пятёрку</h2>
            </div>
            <p>Поле скрыто полностью: в этом режиме игрок решает бюджет, роли и силу состава, а не пространственную задачу.</p>
          </div>
          ${renderRuleTags([
            "100 монет",
            "5 игроков",
            "1 обязательный GK",
            game.state.mode === "ai" ? "Драфт против ИИ" : "Hot-seat драфт по очереди",
          ])}
          <div class="market-grid market-grid--draft">
            ${game.state.marketIds
              .map((cardId) =>
                renderPlayerCard(
                  game,
                  PLAYER_CATALOG.find((card) => card.id === cardId),
                  { clickable: true, market: true },
                ),
              )
              .join("")}
          </div>
        </section>
      </section>

      <aside class="draft-sidebar">
        <section class="panel-card">
          <div class="panel-card__eyebrow">Активный менеджер</div>
          <h2>${escapeHtml(activeTeam.name)}</h2>
          <p>${escapeHtml(getInstruction(game))}</p>
          <p class="subtle">Управление: ${escapeHtml(getControllerLabel(game, activeTeam.id))}.</p>
          ${renderRuleTags(getRosterNeeds(game, activeTeam.id))}
        </section>

        <section class="panel-card">
          <div class="panel-card__eyebrow">Текущий состав</div>
          <h2>${escapeHtml(activeTeam.shortName)}</h2>
          ${renderMiniRoster(game, activeTeam.id, { mode: "draft" })}
        </section>

        <section class="panel-card">
          <div class="panel-card__eyebrow">Прогресс соперника</div>
          <h2>${escapeHtml(otherTeam.shortName)}</h2>
          <p>${otherTeam.rosterIds.length}/5 игроков собрано. Детальный просмотр состава не должен конкурировать с рынком, поэтому здесь только компактный прогресс.</p>
          ${renderMiniRoster(game, otherTeamId, { mode: "draft" })}
        </section>
      </aside>
    </main>
  `;
}

function renderPlacementLayout(game, tutorial = null) {
  const activeTeam = game.getCurrentTeam();
  const selectedId = game.state.placement.selectedPlayerId;
  const otherTeamId = activeTeam.id === 0 ? 1 : 0;
  const kickoff =
    game.state.kickoff &&
    `${game.getTeam(0).shortName} ${game.state.kickoff.rolls[0]}:${game.state.kickoff.rolls[1]} ${game.getTeam(1).shortName}`;

  return `
    <main class="screen screen--placement">
      <section class="placement-stage">
        ${renderField(game, {
          eyebrow: "Расстановка",
          title: "Стартовые позиции",
          subtitle: getInstruction(game),
          tutorial,
          tutorialAnchor: "placement-field",
        })}
      </section>

      <aside class="placement-sidebar">
        <section class="panel-card">
          <div class="panel-card__eyebrow">Очередь расстановки</div>
          <h2>${escapeHtml(activeTeam.name)}</h2>
          <p>${kickoff ? `Стартовый бросок: ${escapeHtml(kickoff)}.` : ""} Сначала выбирается игрок, затем клетка на своей половине. Вратарь занимает только створ.</p>
          <p class="subtle">Текущий контроллер: ${escapeHtml(getControllerLabel(game, activeTeam.id))}.</p>
          ${renderRuleTags([
            "Поле доминирует",
            "Только легальные клетки",
            "Матчевые кнопки скрыты",
          ])}
        </section>

        <section class="panel-card">
          <div class="panel-card__eyebrow">Пятёрка на поле</div>
          <h2>${escapeHtml(activeTeam.shortName)}</h2>
          ${renderMiniRoster(game, activeTeam.id, {
            mode: "placement",
            clickable: true,
            selectedId,
          })}
        </section>

        ${renderSelectedPanel(game)}

        <section class="panel-card">
          <div class="panel-card__eyebrow">Соперник</div>
          <h2>${escapeHtml(game.getTeam(otherTeamId).shortName)}</h2>
          <p>Противник остаётся на втором плане, пока активный игрок не завершит свою расстановку.</p>
          ${renderMiniRoster(game, otherTeamId, { mode: "placement" })}
        </section>
      </aside>
    </main>
  `;
}

function renderMatchTurnBar(game, tutorial = null) {
  if (game.state.phase === "ended") {
    return `
      <section class="turn-bar turn-bar--ended ${tutorialFocusClass(tutorial, "turn-bar")}">
        <div>
          <div class="panel-card__eyebrow">Финальный свисток</div>
          <h2>Матч завершён</h2>
        </div>
        <p>${escapeHtml(getInstruction(game))}</p>
      </section>
    `;
  }

  const team = game.getTeam(game.state.turn.activeTeam);
  const [dieA, dieB] = game.state.turn.dice;
  const aiDecisionLocked = isAiThinking(game);
  const freeKickLabel =
    game.state.freeKick?.teamId === team.id ? "Штрафной розыгрыш" : "";
  return `
    <section class="turn-bar ${tutorialFocusClass(tutorial, "turn-bar")}">
      <div class="turn-bar__team">
        <div class="panel-card__eyebrow">Ход</div>
        <h2>${escapeHtml(team.name)}</h2>
        <p>${escapeHtml(getInstruction(game))}</p>
      </div>

      <div class="turn-bar__metrics">
        <div class="die">${dieA}</div>
        <div class="die">${dieB}</div>
        <div class="turn-metric">
          <strong>${game.state.turn.actionPoints}</strong>
          <span>ОД</span>
        </div>
        <div class="turn-metric">
          <strong>+${game.state.turn.surge}</strong>
          <span>рывок</span>
        </div>
        ${
          freeKickLabel
            ? `
              <div class="turn-metric turn-metric--alert">
                <strong>FK</strong>
                <span>${escapeHtml(freeKickLabel)}</span>
              </div>
            `
            : ""
        }
      </div>

      <div class="turn-bar__actions">
        <button class="chip ${game.state.turn.surgeArmed ? "chip--active" : ""}" data-surge-toggle ${!game.canUseSurge() || game.state.pendingChoice || aiDecisionLocked ? "disabled" : ""}>
          ${game.state.turn.surgeArmed ? "Рывок заряжен" : `Подготовить рывок +${game.state.turn.surge}`}
        </button>
        <button class="chip" data-end-turn ${game.state.pendingChoice || aiDecisionLocked ? "disabled" : ""}>
          Завершить ход
        </button>
      </div>
    </section>
  `;
}

function renderTeamRibbon(game, teamId) {
  const team = game.getTeam(teamId);
  const active =
    game.state.phase === "match" &&
    !game.state.pendingChoice &&
    game.state.turn.activeTeam === teamId &&
    !game.isAiControlledTeam(teamId);
  const selectedId = game.state.selectedPlayerId;

  return `
    <section class="team-ribbon" style="--team:${TEAM_DEFS[teamId].color}; --team-dark:${TEAM_DEFS[teamId].colorDark}; --team-accent:${TEAM_DEFS[teamId].accent}">
      <div class="team-ribbon__head">
        <span>${escapeHtml(team.name)} <span class="controller-badge">${escapeHtml(getControllerLabel(game, teamId))}</span></span>
        <span>${team.score}</span>
      </div>
      <div class="team-ribbon__list">
        ${team.rosterIds
          .map((id) => {
            const player = game.getPlayer(id);
            const attrs = active ? `data-player-card="${player.id}"` : "";
            return `
              <button class="ribbon-player ${selectedId === player.id ? "ribbon-player--selected" : ""} ${player.hasBall ? "ribbon-player--ball" : ""}" ${attrs}>
                <img class="ribbon-player__sprite" src="${createPlayerSprite(player, player.teamId)}" alt="${escapeHtml(player.name)}" />
                <span class="ribbon-player__name">${escapeHtml(player.name)}</span>
                <span class="ribbon-player__meta">${escapeHtml(getMiniRosterStatus(game, player, "match"))}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderMatchLayout(game, tutorial = null) {
  return `
    <main class="screen screen--match">
      <section class="match-stage">
        ${renderMatchTurnBar(game, tutorial)}
        ${renderField(game, {
          eyebrow: "Живое поле",
          title: "Тактический экран",
          subtitle: getInstruction(game),
          overlay: renderShotOverlay(game, tutorial),
          tutorial,
        })}
        <section class="match-support">
          <section class="panel-card">
            <div class="panel-card__eyebrow">Пятёрки на поле</div>
            <h2>Командные ленты</h2>
            <div class="team-ribbons">
              ${renderTeamRibbon(game, 0)}
              ${renderTeamRibbon(game, 1)}
            </div>
          </section>
          ${renderLog(game, { compact: true })}
        </section>
      </section>

      <aside class="match-sidebar">
        ${renderSelectedPanel(game)}
        ${game.state.phase === "match" ? renderActionPanel(game, tutorial) : renderEndSummary(game)}
        ${renderMatchStatsPanel(game, tutorial)}
      </aside>
    </main>
  `;
}

function renderLayoutByPhase(game, tutorial = null) {
  if (game.state.phase === "draft") {
    return renderDraftLayout(game, tutorial);
  }
  if (game.state.phase === "placement") {
    return renderPlacementLayout(game, tutorial);
  }
  return renderMatchLayout(game, tutorial);
}

export function renderApp(root, game, options = {}) {
  const tutorial = options.tutorial ?? null;
  const appClasses = [
    "app-shell",
    `app-shell--${game.state.phase}`,
    game.state.mode === "ai" ? "app-shell--ai" : "",
    isAiThinking(game) ? "app-shell--ai-thinking" : "",
  ]
    .filter(Boolean)
    .join(" ");
  root.innerHTML = `
    <div class="${appClasses}">
      ${renderHeroBar(game, options)}
      ${renderTeamStrip(game, tutorial)}
      ${renderLayoutByPhase(game, tutorial)}
    </div>
    ${tutorial?.renderOverlay?.() ?? ""}
  `;
}
