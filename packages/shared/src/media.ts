/**
 * Images uploaded from the dashboard (welcome banners, card backgrounds, embed
 * images). The dashboard stores them and serves them at /media/<id>.<ext>, a
 * public address Discord and the bot can both load.
 */

/** Discord shows embed images up to this size without trouble; bigger ones are rarely needed. */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
/** Per server: enough for banners and backgrounds without letting one server fill the database. */
export const MEDIA_MAX_PER_GUILD = 100;
export const MEDIA_MAX_TOTAL_BYTES_PER_GUILD = 200 * 1024 * 1024;

export const MEDIA_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
} as const;
export type MediaType = keyof typeof MEDIA_TYPES;

/** What the file chooser accepts. */
export const MEDIA_ACCEPT = Object.keys(MEDIA_TYPES).join(',');

/**
 * The image type from the file's first bytes, ignoring its name and the type the
 * browser claimed. Anything that isn't a PNG, JPEG, GIF or WebP returns null, so
 * an HTML or SVG file can never be served from the media address.
 */
export function sniffImageType(bytes: Uint8Array): MediaType | null {
  const at = (index: number): number => bytes[index] ?? -1;
  const ascii = (start: number, text: string): boolean =>
    [...text].every((char, offset) => at(start + offset) === char.charCodeAt(0));

  if (at(0) === 0x89 && ascii(1, 'PNG') && at(4) === 0x0d && at(5) === 0x0a) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  return null;
}

/** The public path an uploaded image is served at. */
export function mediaPath(id: string, type: MediaType): string {
  return `/media/${id}.${MEDIA_TYPES[type]}`;
}

/** Split `/media/<id>.<ext>`'s last part back into the id. Null when it isn't one of ours. */
export function parseMediaFileName(file: string): string | null {
  const match = /^([a-z0-9]{20,40})\.(png|jpg|gif|webp)$/.exec(file);
  return match?.[1] ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
