import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { logger } from '../logger';

/**
 * Rank-card renderer (§7). Pure pixels in, PNG buffer out — no Discord types, so
 * the `/rank` command stays a thin caller. Fonts are vendored under
 * `assets/fonts` and registered once at module load because the slim production
 * image has no system fonts.
 */

const FONT_REGULAR = 'SolariSans';
const FONT_BOLD = 'SolariSans Bold';

function fontPath(file: string): string {
  return fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url));
}

let fontsReady = false;
function ensureFonts(): void {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(fontPath('DejaVuSans.ttf'), FONT_REGULAR);
  GlobalFonts.registerFromPath(fontPath('DejaVuSans-Bold.ttf'), FONT_BOLD);
  fontsReady = true;
}

export interface RankCardInput {
  displayName: string;
  username: string;
  avatarUrl: string;
  level: number;
  rank: number;
  /** XP earned within the current level. */
  currentXp: number;
  /** XP needed to clear the current level. */
  neededXp: number;
  totalXp: number;
}

const WIDTH = 900;
const HEIGHT = 270;
const ACCENT = '#8b5cf6';
const BG = '#141020';
const PANEL = '#1e1830';
const TRACK = '#332a4a';
const TEXT = '#ffffff';
const MUTED = '#a29bb4';

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Compact, human-friendly XP count: 950, 12.3k, 4.1M. */
function formatXp(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function truncate(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

async function drawAvatar(
  ctx: SKRSContext2D,
  url: string,
  cx: number,
  cy: number,
  radius: number,
): Promise<void> {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`avatar fetch ${response.status}`);
    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
  } catch (err) {
    // Network/format failure — fall back to a flat accent disc so the card
    // still renders rather than throwing.
    logger.debug({ err }, 'Rank card avatar load failed; using fallback');
    ctx.fillStyle = PANEL;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();

  // Accent ring.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
}

export async function renderRankCard(input: RankCardInput): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background + inner panel.
  ctx.fillStyle = BG;
  roundRect(ctx, 0, 0, WIDTH, HEIGHT, 28);
  ctx.fill();
  ctx.fillStyle = PANEL;
  roundRect(ctx, 16, 16, WIDTH - 32, HEIGHT - 32, 22);
  ctx.fill();

  const avatarRadius = 84;
  const avatarCx = 130;
  const avatarCy = HEIGHT / 2;
  await drawAvatar(ctx, input.avatarUrl, avatarCx, avatarCy, avatarRadius);

  const textLeft = 250;
  const textRight = WIDTH - 50;

  // Name + handle.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT;
  ctx.font = `40px "${FONT_BOLD}"`;
  const name = truncate(ctx, input.displayName, 380);
  ctx.fillText(name, textLeft, 110);

  ctx.fillStyle = MUTED;
  ctx.font = `24px "${FONT_REGULAR}"`;
  ctx.fillText(truncate(ctx, `@${input.username}`, 360), textLeft, 142);

  // Rank + level, right-aligned.
  ctx.textAlign = 'right';
  ctx.font = `34px "${FONT_BOLD}"`;
  ctx.fillStyle = ACCENT;
  ctx.fillText(`LEVEL ${input.level}`, textRight, 96);
  ctx.fillStyle = MUTED;
  ctx.font = `26px "${FONT_REGULAR}"`;
  ctx.fillText(`RANK #${input.rank}`, textRight, 132);
  ctx.textAlign = 'left';

  // Progress bar.
  const barX = textLeft;
  const barY = 178;
  const barW = textRight - textLeft;
  const barH = 30;
  const ratio = input.neededXp > 0 ? Math.min(1, Math.max(0, input.currentXp / input.neededXp)) : 0;

  ctx.fillStyle = TRACK;
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  if (ratio > 0) {
    const fillW = Math.max(barH, barW * ratio); // keep the rounded cap visible
    ctx.fillStyle = ACCENT;
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.fill();
  }

  // XP label under the bar.
  ctx.fillStyle = MUTED;
  ctx.font = `22px "${FONT_REGULAR}"`;
  ctx.fillText(
    `${formatXp(input.currentXp)} / ${formatXp(input.neededXp)} XP`,
    barX,
    barY + barH + 30,
  );
  ctx.textAlign = 'right';
  ctx.fillText(`${formatXp(input.totalXp)} total`, textRight, barY + barH + 30);
  ctx.textAlign = 'left';

  return canvas.encode('png');
}
