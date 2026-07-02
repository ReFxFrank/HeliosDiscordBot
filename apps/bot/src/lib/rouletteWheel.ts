import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { rouletteColor } from './casino';

/**
 * Animated roulette spin — a real European wheel rendered with canvas and
 * encoded as a play-once GIF: the wheel decelerates, the ball counter-rotates
 * and spirals into the WINNING pocket, and the last frame holds the result.
 * Rendered lazily per pocket and cached (37 variants max) since the animation
 * is deterministic for a given winning number.
 */

/** Standard European wheel order, clockwise from the top. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const SIZE = 280;
const CENTER = SIZE / 2;
const FRAMES = 40;
const FRAME_DELAY_MS = 90;
const HOLD_FRAMES = 4;
/** Total on-screen play time (used by the command to pace its result edit). */
export const ROULETTE_SPIN_MS = (FRAMES + HOLD_FRAMES) * FRAME_DELAY_MS;

const POCKET_ARC = (Math.PI * 2) / WHEEL_ORDER.length;
const RIM_OUTER = 136;
const RIM_INNER = 122;
const POCKET_OUTER = 121;
const POCKET_INNER = 78;
const BALL_TRACK = 128;
const BALL_REST = 100;
const BALL_RADIUS = 6.5;

const COLORS = {
  felt: '#0d1117',
  rimWood: '#3b2314',
  rimGold: '#c9a227',
  green: '#0f7a3d',
  red: '#b3202c',
  black: '#15151a',
  separator: '#c9a227',
  hub: '#241a10',
  number: '#f5f0e6',
  ball: '#f4f4f2',
};

function easeOutCubic(p: number): number {
  return 1 - (1 - p) ** 3;
}

/** Draw one frame: wheel rotated to `wheelAngle`, ball at (ballAngle, ballR). */
function drawFrame(
  ctx: SKRSContext2D,
  wheelAngle: number,
  ballAngle: number,
  ballR: number,
): void {
  ctx.resetTransform();
  ctx.fillStyle = COLORS.felt;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Rim.
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RIM_OUTER, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.rimWood;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.rimGold;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RIM_INNER, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.rimGold;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Pockets (rotate the whole ring by wheelAngle; pocket i centered at
  // i*POCKET_ARC - 90° in wheel space).
  for (let i = 0; i < WHEEL_ORDER.length; i++) {
    const pocket = WHEEL_ORDER[i]!;
    const start = wheelAngle + i * POCKET_ARC - Math.PI / 2 - POCKET_ARC / 2;
    const color = rouletteColor(pocket);
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, POCKET_OUTER, start, start + POCKET_ARC);
    ctx.arc(CENTER, CENTER, POCKET_INNER, start + POCKET_ARC, start, true);
    ctx.closePath();
    ctx.fillStyle = color === 'green' ? COLORS.green : color === 'red' ? COLORS.red : COLORS.black;
    ctx.fill();
    ctx.strokeStyle = COLORS.separator;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Number, upright along the wedge's mid-angle near the outer edge.
    const mid = start + POCKET_ARC / 2;
    ctx.save();
    ctx.translate(CENTER + Math.cos(mid) * 110, CENTER + Math.sin(mid) * 110);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = COLORS.number;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(pocket), 0, 0);
    ctx.restore();
  }

  // Hub with spokes.
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, POCKET_INNER - 4, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.hub;
  ctx.fill();
  ctx.strokeStyle = COLORS.rimGold;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let s = 0; s < 4; s++) {
    const angle = wheelAngle + (s * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(CENTER + Math.cos(angle) * 12, CENTER + Math.sin(angle) * 12);
    ctx.lineTo(CENTER + Math.cos(angle) * (POCKET_INNER - 10), CENTER + Math.sin(angle) * (POCKET_INNER - 10));
    ctx.strokeStyle = COLORS.rimGold;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 10, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.rimGold;
  ctx.fill();

  // Pointer at 12 o'clock.
  ctx.beginPath();
  ctx.moveTo(CENTER - 7, CENTER - RIM_OUTER - 2);
  ctx.lineTo(CENTER + 7, CENTER - RIM_OUTER - 2);
  ctx.lineTo(CENTER, CENTER - RIM_OUTER + 12);
  ctx.closePath();
  ctx.fillStyle = COLORS.rimGold;
  ctx.fill();

  // Ball (with a soft shadow for depth).
  const bx = CENTER + Math.cos(ballAngle) * ballR;
  const by = CENTER + Math.sin(ballAngle) * ballR;
  ctx.beginPath();
  ctx.arc(bx + 1.5, by + 2, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
}

/** Wheel/ball pose at animation progress p (0..1) for a given winning index. */
function frameState(
  winIndex: number,
  p: number,
): { wheelAngle: number; ballAngle: number; ballR: number } {
  // Final wheel rotation puts the winning pocket's center under the pointer.
  const finalWheelAngle = -winIndex * POCKET_ARC;
  const wheelTravel = Math.PI * 6; // three decelerating turns
  const ballTravel = Math.PI * 10; // five counter-turns the opposite way
  const eased = easeOutCubic(p);
  // Spiral from the outer track down into the pocket over the last 45%.
  const drop = Math.min(1, Math.max(0, (p - 0.55) / 0.45));
  return {
    wheelAngle: finalWheelAngle - (1 - eased) * wheelTravel,
    // The ball ends parked at the pointer (top), inside the winning pocket.
    ballAngle: -Math.PI / 2 + (1 - eased) * ballTravel,
    ballR: BALL_TRACK - (BALL_TRACK - BALL_REST) * easeOutCubic(drop),
  };
}

function winIndexOf(winningPocket: number): number {
  const winIndex = WHEEL_ORDER.indexOf(winningPocket as (typeof WHEEL_ORDER)[number]);
  if (winIndex === -1) throw new Error(`Not a roulette pocket: ${winningPocket}`);
  return winIndex;
}

const cache = new Map<number, Buffer>();

/** Render (or reuse) the spin GIF that lands on `winningPocket`. */
export function renderRouletteSpin(winningPocket: number): Buffer {
  const cached = cache.get(winningPocket);
  if (cached) return cached;
  const winIndex = winIndexOf(winningPocket);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const gif = GIFEncoder();
  let palette: number[][] | null = null;

  for (let frame = 0; frame < FRAMES + HOLD_FRAMES; frame++) {
    const p = Math.min(1, frame / (FRAMES - 1));
    const { wheelAngle, ballAngle, ballR } = frameState(winIndex, p);
    drawFrame(ctx, wheelAngle, ballAngle, ballR);

    const { data, width, height } = ctx.getImageData(0, 0, SIZE, SIZE);
    // One shared palette: the wheel's colors are constant across frames.
    palette ??= quantize(data, 128);
    const indexed = applyPalette(data, palette);
    gif.writeFrame(indexed, width, height, {
      palette,
      // Hold the final result on screen; no `repeat` => the GIF plays once.
      delay: frame >= FRAMES - 1 ? 350 : FRAME_DELAY_MS,
    });
  }

  gif.finish();
  const buffer = Buffer.from(gif.bytes());
  cache.set(winningPocket, buffer);
  return buffer;
}

/** One frame as a PNG at progress p — preview/debug (and test) hook. */
export function renderRouletteFramePng(winningPocket: number, p: number): Buffer {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const { wheelAngle, ballAngle, ballR } = frameState(winIndexOf(winningPocket), p);
  drawFrame(ctx, wheelAngle, ballAngle, ballR);
  return canvas.toBuffer('image/png');
}
