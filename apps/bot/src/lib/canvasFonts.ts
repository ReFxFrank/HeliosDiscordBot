import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';

/**
 * Shared canvas font registration. Fonts are vendored under `assets/fonts`
 * because the slim production image has no system fonts. Registered once,
 * shared by every canvas renderer (rank card, welcome card, …).
 */
export const FONT_REGULAR = 'SolariSans';
export const FONT_BOLD = 'SolariSans Bold';

function fontPath(file: string): string {
  return fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url));
}

let ready = false;
export function ensureFonts(): void {
  if (ready) return;
  GlobalFonts.registerFromPath(fontPath('DejaVuSans.ttf'), FONT_REGULAR);
  GlobalFonts.registerFromPath(fontPath('DejaVuSans-Bold.ttf'), FONT_BOLD);
  ready = true;
}
