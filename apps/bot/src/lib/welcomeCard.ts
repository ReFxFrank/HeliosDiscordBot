import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { logger } from '../logger';
import { ensureFonts, FONT_BOLD, FONT_REGULAR } from './canvasFonts';
import { safeFetchBuffer } from './safeFetch';

/**
 * Welcome-card renderer — a banner image with the member's avatar, a title, and
 * their name, appended to the welcome message. Pure pixels in, PNG buffer out.
 * A custom background is fetched through the SSRF guard; on any failure it falls
 * back to the Solari violet gradient so a card always renders.
 */

const WIDTH = 1024;
const HEIGHT = 320;
const ACCENT = '#8b5cf6';
const TEXT = '#ffffff';
const MUTED = '#c9c2da';

export interface WelcomeCardInput {
  displayName: string;
  avatarUrl: string;
  title: string;
  subtitle: string;
  backgroundUrl?: string | null;
}

function truncate(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/** Draw an image cover-fitted (fills the box, cropping overflow). */
function drawCover(ctx: SKRSContext2D, image: Image, x: number, y: number, w: number, h: number): void {
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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
    // Avatar URLs come from Discord's CDN (bot-constructed), so no SSRF guard.
    const response = await fetch(url);
    if (!response.ok) throw new Error(`avatar fetch ${response.status}`);
    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
  } catch (err) {
    logger.debug({ err }, 'Welcome card avatar load failed; using fallback');
    ctx.fillStyle = '#1e1830';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
}

export async function renderWelcomeCard(input: WelcomeCardInput): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  let drewBackground = false;
  if (input.backgroundUrl) {
    try {
      const buffer = await safeFetchBuffer(input.backgroundUrl);
      const image = await loadImage(buffer);
      drawCover(ctx, image, 0, 0, WIDTH, HEIGHT);
      // Darken for text legibility over arbitrary art.
      ctx.fillStyle = 'rgba(10, 8, 16, 0.55)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drewBackground = true;
    } catch (err) {
      logger.debug({ err }, 'Welcome card background failed; using gradient');
    }
  }
  if (!drewBackground) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#1a1030');
    gradient.addColorStop(1, '#0a0810');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.18)';
    ctx.beginPath();
    ctx.arc(WIDTH / 2, -40, 260, 0, Math.PI * 2);
    ctx.fill();
  }

  await drawAvatar(ctx, input.avatarUrl, WIDTH / 2, 118, 80);

  ctx.textAlign = 'center';
  ctx.fillStyle = TEXT;
  ctx.font = `40px "${FONT_BOLD}"`;
  ctx.fillText(truncate(ctx, input.title.toUpperCase(), WIDTH - 80), WIDTH / 2, 240);

  ctx.fillStyle = ACCENT;
  ctx.font = `30px "${FONT_BOLD}"`;
  ctx.fillText(truncate(ctx, input.displayName, WIDTH - 80), WIDTH / 2, 282);

  ctx.fillStyle = MUTED;
  ctx.font = `22px "${FONT_REGULAR}"`;
  ctx.fillText(truncate(ctx, input.subtitle, WIDTH - 80), WIDTH / 2, 312);
  ctx.textAlign = 'left';

  return canvas.encode('png');
}
