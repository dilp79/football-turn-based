import { POSITION_LABELS, TEAM_DEFS } from "./data.js";

const spriteCache = new Map();
let ballSpriteCache = null;

const POSITION_PALETTES = {
  GK: { body: "#d6a73d", shadow: "#7a5917", accent: "#f8e6a2" },
  DEF: { body: "#4e6d8f", shadow: "#21364d", accent: "#a9c8f1" },
  MID: { body: "#3d8b71", shadow: "#1b4b3b", accent: "#a5ebce" },
  FWD: { body: "#a44f48", shadow: "#5b211b", accent: "#ffb5aa" },
};

const SKIN_TONES = ["#f5d8b5", "#d9b28a", "#c28d6b", "#8b6344"];
const HAIR_TONES = ["#2d1f16", "#5c3f22", "#a8682f", "#d4be8b", "#1f232b"];

function hash(input) {
  let total = 0;
  for (let index = 0; index < input.length; index += 1) {
    total = (total * 31 + input.charCodeAt(index)) >>> 0;
  }
  return total;
}

function fill(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function getPalette(player, teamId) {
  if (teamId === null || teamId === undefined) {
    return POSITION_PALETTES[player.position];
  }
  const team = TEAM_DEFS[teamId];
  return {
    body: team.color,
    shadow: team.colorDark,
    accent: team.accent,
  };
}

function drawRoleMark(ctx, player, palette) {
  switch (player.position) {
    case "GK":
      fill(ctx, 7, 8, 2, 4, palette.accent);
      fill(ctx, 6, 9, 4, 2, palette.accent);
      break;
    case "DEF":
      fill(ctx, 5, 8, 6, 2, palette.accent);
      fill(ctx, 5, 11, 6, 1, palette.accent);
      break;
    case "MID":
      fill(ctx, 7, 8, 2, 4, palette.accent);
      fill(ctx, 5, 9, 6, 2, palette.accent);
      break;
    case "FWD":
      fill(ctx, 5, 8, 4, 2, palette.accent);
      fill(ctx, 8, 9, 3, 2, palette.accent);
      fill(ctx, 9, 11, 2, 1, palette.accent);
      break;
    default:
      break;
  }
}

export function createPlayerSprite(player, teamId = null) {
  const key = `${player.id}:${teamId ?? "market"}`;
  if (spriteCache.has(key)) {
    return spriteCache.get(key);
  }

  const seed = hash(player.id);
  const palette = getPalette(player, teamId);
  const skin = SKIN_TONES[seed % SKIN_TONES.length];
  const hair = HAIR_TONES[seed % HAIR_TONES.length];
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");

  fill(ctx, 3, 2, 10, 2, palette.shadow);
  fill(ctx, 4, 4, 8, 4, skin);
  fill(ctx, 4, 3, 8, 2, hair);
  fill(ctx, 3, 7, 10, 5, palette.body);
  fill(ctx, 4, 12, 3, 2, palette.shadow);
  fill(ctx, 9, 12, 3, 2, palette.shadow);
  fill(ctx, 4, 7, 1, 5, skin);
  fill(ctx, 11, 7, 1, 5, skin);
  fill(ctx, 5, 14, 2, 1, "#111820");
  fill(ctx, 9, 14, 2, 1, "#111820");
  fill(ctx, 3, 1, 10, 1, palette.accent);
  fill(ctx, 2, 6, 12, 1, palette.shadow);

  if (player.cost >= 30) {
    fill(ctx, 12, 2, 2, 2, palette.accent);
  }
  if (player.abilityId) {
    fill(ctx, 2, 2, 2, 2, "#ffe799");
  }

  drawRoleMark(ctx, player, palette);

  const url = canvas.toDataURL();
  spriteCache.set(key, url);
  return url;
}

export function createBallSprite() {
  if (ballSpriteCache) {
    return ballSpriteCache;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 10;
  canvas.height = 10;
  const ctx = canvas.getContext("2d");

  fill(ctx, 1, 1, 8, 8, "#f8f5ed");
  fill(ctx, 3, 1, 4, 1, "#111820");
  fill(ctx, 1, 3, 1, 4, "#111820");
  fill(ctx, 8, 3, 1, 4, "#111820");
  fill(ctx, 3, 8, 4, 1, "#111820");
  fill(ctx, 4, 4, 2, 2, "#111820");
  fill(ctx, 2, 2, 1, 1, "#111820");
  fill(ctx, 7, 2, 1, 1, "#111820");
  fill(ctx, 2, 7, 1, 1, "#111820");
  fill(ctx, 7, 7, 1, 1, "#111820");

  ballSpriteCache = canvas.toDataURL();
  return ballSpriteCache;
}

export function getPositionLabel(position) {
  return POSITION_LABELS[position] ?? position;
}
