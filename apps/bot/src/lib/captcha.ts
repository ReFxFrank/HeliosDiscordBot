import { randomInt } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { ensureFonts, FONT_BOLD } from './canvasFonts';

/**
 * Image-captcha generation for the Verification module. Pure pixels in, PNG
 * buffer out. Codes use crypto randomness and avoid visually ambiguous glyphs
 * (0/O, 1/I/L); rendering adds per-glyph rotation/jitter plus noise strokes so
 * the code isn't trivially machine-readable.
 */

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCaptchaCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CHARSET[randomInt(CHARSET.length)];
  return code;
}

const WIDTH = 360;
const HEIGHT = 140;
const GLYPH_COLORS = ['#3d95ff', '#0072ff', '#70b0ff', '#38bdf8', '#e7e7ee'];

function jitter(spread: number): number {
  return (randomInt(1000) / 1000 - 0.5) * 2 * spread;
}

export function renderCaptcha(code: string): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Dark backdrop with a soft blue wash.
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#0f1626');
  gradient.addColorStop(1, '#060a14');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Background noise strokes (behind the glyphs).
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(0, 114, 255, ${0.15 + randomInt(20) / 100})`;
    ctx.lineWidth = 1 + randomInt(2);
    ctx.beginPath();
    ctx.moveTo(randomInt(WIDTH), randomInt(HEIGHT));
    ctx.bezierCurveTo(
      randomInt(WIDTH),
      randomInt(HEIGHT),
      randomInt(WIDTH),
      randomInt(HEIGHT),
      randomInt(WIDTH),
      randomInt(HEIGHT),
    );
    ctx.stroke();
  }

  // Glyphs — evenly spaced with rotation/offset jitter.
  const cell = WIDTH / (code.length + 1);
  for (let i = 0; i < code.length; i++) {
    const char = code[i] ?? '';
    ctx.save();
    ctx.translate(cell * (i + 1) + jitter(6), HEIGHT / 2 + jitter(12));
    ctx.rotate(jitter(0.4));
    ctx.font = `${52 + randomInt(14)}px "${FONT_BOLD}"`;
    ctx.fillStyle = GLYPH_COLORS[randomInt(GLYPH_COLORS.length)] ?? '#e7e7ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }

  // Foreground noise + speckles (over the glyphs).
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(231, 231, 238, ${0.2 + randomInt(15) / 100})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, randomInt(HEIGHT));
    ctx.bezierCurveTo(
      WIDTH / 3,
      randomInt(HEIGHT),
      (2 * WIDTH) / 3,
      randomInt(HEIGHT),
      WIDTH,
      randomInt(HEIGHT),
    );
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(231, 231, 238, ${0.1 + randomInt(25) / 100})`;
    ctx.fillRect(randomInt(WIDTH), randomInt(HEIGHT), 2, 2);
  }

  return canvas.encode('png');
}
