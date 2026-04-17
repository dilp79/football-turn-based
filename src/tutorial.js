const STORAGE_KEY = "tutorialComplete";

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCompletionFlag() {
  return getStorage()?.getItem(STORAGE_KEY) === "true";
}

function writeCompletionFlag(value) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (value) {
    storage.setItem(STORAGE_KEY, "true");
    return;
  }

  storage.removeItem(STORAGE_KEY);
}

function hasAnyGoals(state) {
  return state.teams.some((team) => team.score > 0);
}

export const TUTORIAL_STEPS = [
  {
    id: "draft-intro",
    anchor: "draft-market",
    tone: "info",
    title: "Соберите первую пятёрку",
    message:
      "Стартовый onboarding проходит в режиме vs ИИ. Возьмите 5 игроков на 100 монет: ровно одного вратаря и ещё четырёх полевых. Начните с любой доступной карточки на рынке.",
    trigger: (state) => state.phase === "draft" && state.teams[0].rosterIds.length === 0,
  },
  {
    id: "first-buy",
    anchor: "draft-market",
    tone: "info",
    title: "Соперник отвечает сам",
    message:
      "Теперь очередь ИИ. После закрытия подсказки он автоматически сделает свой пик, а драфт продолжится по очереди, пока у обеих команд не будет по пять игроков.",
    trigger: (state) =>
      state.phase === "draft" &&
      state.mode === "ai" &&
      state.teams[0].rosterIds.length >= 1 &&
      state.teams[1].rosterIds.length === 0 &&
      state.draft.activeTeam === 1,
  },
  {
    id: "placement-intro",
    anchor: "placement-field",
    tone: "info",
    title: "Расстановка задаёт рисунок атаки",
    message:
      "Ставьте игроков на своей половине поля. Вратарь идёт только в створ ворот, а остальные фишки можно разложить так, чтобы подготовить короткий пас или быстрый выход на центр.",
    trigger: (state) => state.phase === "placement" && state.placement.index === 0,
  },
  {
    id: "dice-intro",
    anchor: "turn-bar",
    tone: "info",
    title: "Ход строится от кубиков",
    message:
      "Каждый ход начинается с двух кубиков. Их сумма даёт очки действий, а больший кубик становится разовым бонусом рывка. Сначала посмотрите на этот бар, затем выберите своего игрока.",
    trigger: (state) =>
      state.phase === "match" &&
      state.turn.number === 1 &&
      state.turn.activeTeam === 0 &&
      !state.selectedPlayerId &&
      !state.pendingChoice,
  },
  {
    id: "move-intro",
    anchor: "action-panel",
    tone: "info",
    title: "Перемещение тратит темп",
    message:
      "Подсвеченные клетки покажут доступный путь, а цифра на клетке подскажет цену в ОД. Игрок без мяча экономит ход лучше, поэтому центр поля выгодно занимать заранее.",
    trigger: (state) => state.phase === "match" && state.selectedAction === "move",
  },
  {
    id: "pass-intro",
    anchor: "action-panel",
    tone: "info",
    title: "Пас держит владение живым",
    message:
      "Выберите партнёра или свободную клетку для передачи. Дальность зависит от стата паса, а длинные линии опасны из-за возможного перехвата. Через пас здесь выгоднее создавать удар, чем тащить мяч одному.",
    trigger: (state) => state.phase === "match" && state.selectedAction === "pass",
  },
  {
    id: "tackle-intro",
    anchor: "action-panel",
    tone: "danger",
    title: "Отбор и подкат меняют владение",
    message:
      "Отбор стоит 2 ОД и сравнивает ваш стат с дриблингом соперника. Подкат грубее и опаснее: он может дать фол и штрафной. Используйте его, когда нужно остановить атаку любой ценой.",
    trigger: (state) =>
      state.phase === "match" &&
      (state.selectedAction === "tackle" || state.selectedAction === "slide"),
  },
  {
    id: "shoot-intro",
    anchor: "shot-overlay",
    tone: "success",
    title: "Удар идёт через выбор сектора",
    message:
      "Сейчас выберите одну из девяти зон ворот. После этого вратарь ответит своим прыжком. Чем ближе вы к воротам, тем дешевле попытка и тем легче строить атаку через короткий последний пас.",
    trigger: (state) => state.pendingChoice?.type === "shotAim",
  },
  {
    id: "goal-scored",
    anchor: "team-strip",
    tone: "success",
    title: "Первый гол меняет ритм матча",
    message:
      "После гола обе команды возвращаются в стартовые позиции, а мяч разводит пропустившая сторона. Побеждает тот, кто первым доберётся до трёх мячей, поэтому важно читать не только счёт, но и владение с ударами.",
    trigger: (state) => (state.phase === "match" || state.phase === "ended") && hasAnyGoals(state),
  },
  {
    id: "match-summary",
    anchor: "stats-overlay",
    tone: "success",
    completeOnDismiss: true,
    title: "Матч прочитан до конца",
    message:
      "Финальный overlay показывает, кто реально контролировал игру: владение, пас, отборы, дриблинг и сейвы. На этом onboarding завершён; позже его можно перезапустить из верхней панели.",
    trigger: (state) => state.phase === "ended",
  },
];

export class Tutorial {
  constructor() {
    this.active = !readCompletionFlag();
    this.currentStep = null;
    this.dismissedIds = new Set();
  }

  isActive() {
    return this.active;
  }

  getCurrentStep() {
    return this.currentStep;
  }

  hasOpenStep() {
    return Boolean(this.currentStep);
  }

  isAnchorActive(anchor) {
    return this.currentStep?.anchor === anchor;
  }

  getProgress() {
    const currentIndex = this.currentStep
      ? TUTORIAL_STEPS.findIndex((step) => step.id === this.currentStep.id)
      : -1;

    return {
      current:
        currentIndex >= 0
          ? currentIndex + 1
          : Math.min(this.dismissedIds.size + 1, TUTORIAL_STEPS.length),
      total: TUTORIAL_STEPS.length,
    };
  }

  complete() {
    this.active = false;
    this.currentStep = null;
    writeCompletionFlag(true);
  }

  restart() {
    this.active = true;
    this.currentStep = null;
    this.dismissedIds.clear();
    writeCompletionFlag(false);
  }

  skip() {
    this.complete();
  }

  dismiss() {
    if (!this.currentStep) {
      return false;
    }

    const step = this.currentStep;
    this.dismissedIds.add(step.id);
    this.currentStep = null;

    if (step.completeOnDismiss) {
      this.complete();
    }

    return true;
  }

  check(gameState) {
    if (!this.active) {
      this.currentStep = null;
      return null;
    }

    if (this.currentStep) {
      return this.currentStep;
    }

    for (const step of TUTORIAL_STEPS) {
      if (this.dismissedIds.has(step.id)) {
        continue;
      }

      try {
        if (step.trigger(gameState)) {
          this.currentStep = step;
          return step;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  renderOverlay() {
    if (!this.currentStep) {
      return "";
    }

    const step = this.currentStep;
    const progress = this.getProgress();

    return `
      <div class="tutorial-overlay" data-tutorial-overlay data-tone="${step.tone ?? "info"}">
        <section class="tutorial-tooltip" aria-live="polite">
          <div class="tutorial-tooltip__meta">
            <span class="tutorial-pill">Обучение ${progress.current}/${progress.total}</span>
            <button class="chip" data-tutorial-skip>Пропустить</button>
          </div>
          <h3>${step.title}</h3>
          <p>${step.message}</p>
          <div class="tutorial-tooltip__actions">
            <button class="chip chip--active" data-tutorial-dismiss>Продолжить</button>
          </div>
        </section>
      </div>
    `;
  }
}
