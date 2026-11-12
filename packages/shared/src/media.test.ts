import { describe, expect, it } from 'vitest';
import { formatBytes, mediaPath, parseMediaFileName, sniffImageType } from './media';

const bytes = (...values: (number | string)[]): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

describe('sniffImageType', () => {
  it('recognises the four supported formats from their first bytes', () => {
    expect(sniffImageType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes('GIF89a'))).toBe('image/gif');
    expect(sniffImageType(bytes('GIF87a'))).toBe('image/gif');
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(sniffImageType(bytes('<!doctype html><script>'))).toBeNull();
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('media paths', () => {
  it('round-trips an id through its public path', () => {
    const id = 'cmhx2k9z80000abcdefghijkl';
    expect(mediaPath(id, 'image/jpeg')).toBe(`/media/${id}.jpg`);
    expect(parseMediaFileName(`${id}.jpg`)).toBe(id);
  });

  it('rejects names that are not ours', () => {
    expect(parseMediaFileName('../../etc/passwd')).toBeNull();
    expect(parseMediaFileName('cmhx2k9z80000abcdefghijkl.svg')).toBeNull();
    expect(parseMediaFileName('short.png')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('reads naturally', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(8 * 1024 * 1024)).toBe('8.0 MB');
  });
});
