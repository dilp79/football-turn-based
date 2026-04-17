export const EFFECT_DURATIONS = {
  buy: 180,
  place: 220,
  move: 220,
  pass: 320,
  shot: 420,
  clash: 220,
  goal: 900,
  phase: 320,
  turn: 620,
};

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function getAppShell(root) {
  return root.querySelector(".app-shell");
}

function getPitchCanvas(root) {
  return root.querySelector(".pitch-canvas");
}

function ensureFxLayer(root) {
  const canvas = getPitchCanvas(root);
  if (!canvas) {
    return null;
  }

  let layer = canvas.querySelector(".fx-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "fx-layer";
    canvas.append(layer);
  }
  return layer;
}

function getCellCenter(root, x, y) {
  const canvas = getPitchCanvas(root);
  const cell = root.querySelector(`[data-cell="${x}:${y}"]`);
  if (!canvas || !cell) {
    return null;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  return {
    x: cellRect.left - canvasRect.left + cellRect.width / 2,
    y: cellRect.top - canvasRect.top + cellRect.height / 2,
  };
}

function addTimedClass(target, className, duration) {
  if (!target) {
    return Promise.resolve(0);
  }
  target.classList.add(className);
  return wait(duration).then(() => {
    target.classList.remove(className);
    return duration;
  });
}

function animateGhost(root, { from, to, className, duration }) {
  if (prefersReducedMotion()) {
    return Promise.resolve(0);
  }

  const layer = ensureFxLayer(root);
  const fromPoint = getCellCenter(root, from.x, from.y);
  const toPoint = getCellCenter(root, to.x, to.y);
  if (!layer || !fromPoint || !toPoint) {
    return Promise.resolve(0);
  }

  const ghost = document.createElement("div");
  ghost.className = className;
  ghost.style.transform = `translate(${fromPoint.x}px, ${fromPoint.y}px)`;
  layer.append(ghost);

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${toPoint.x}px, ${toPoint.y}px)`;
    });
    window.setTimeout(() => {
      ghost.remove();
      resolve(duration);
    }, duration);
  });
}

export async function animatePhase(root) {
  if (prefersReducedMotion()) {
    return 0;
  }
  return addTimedClass(getAppShell(root), "app-shell--phase-fade", EFFECT_DURATIONS.phase);
}

export async function animateTurnStart(root) {
  if (prefersReducedMotion()) {
    return 0;
  }
  const dice = [...root.querySelectorAll(".die")];
  await Promise.all(dice.map((die) => addTimedClass(die, "die--rolling", EFFECT_DURATIONS.turn)));
  return EFFECT_DURATIONS.turn;
}

export async function animateGoal(root) {
  if (prefersReducedMotion()) {
    return 0;
  }
  return addTimedClass(getAppShell(root), "app-shell--goal-flash", EFFECT_DURATIONS.goal);
}

export async function animateBuy(root) {
  return addTimedClass(root.querySelector(".panel-card--market"), "panel-card--pulse", EFFECT_DURATIONS.buy);
}

export async function animatePlacement(root, to) {
  if (!to) {
    return 0;
  }
  const cell = root.querySelector(`[data-cell="${to.x}:${to.y}"]`);
  return addTimedClass(cell, "cell--placed-fx", EFFECT_DURATIONS.place);
}

export async function animateMove(root, from, to) {
  if (!from || !to) {
    return 0;
  }

  const duration = await animateGhost(root, {
    from,
    to,
    className: "fx-runner",
    duration: EFFECT_DURATIONS.move,
  });
  const targetCell = root.querySelector(`[data-cell="${to.x}:${to.y}"]`);
  await addTimedClass(targetCell, "cell--travel-fx", EFFECT_DURATIONS.move);
  return duration;
}

export async function animateBallTravel(root, from, to, { shot = false } = {}) {
  if (!from || !to) {
    return 0;
  }

  return animateGhost(root, {
    from,
    to,
    className: shot ? "fx-ball fx-ball--shot" : "fx-ball fx-ball--pass",
    duration: shot ? EFFECT_DURATIONS.shot : EFFECT_DURATIONS.pass,
  });
}

export async function animateClash(root, cells = [], { foul = false } = {}) {
  const duration = EFFECT_DURATIONS.clash;
  const targets = cells
    .map((cell) => root.querySelector(`[data-cell="${cell.x}:${cell.y}"]`))
    .filter(Boolean);

  if (!targets.length) {
    return 0;
  }

  const className = foul ? "cell--foul-fx" : "cell--impact-fx";
  await Promise.all(targets.map((target) => addTimedClass(target, className, duration)));
  return duration;
}
