/** Minimal typings for gifenc@1 (no bundled types). Only what we use. */
declare module 'gifenc' {
  export interface GifEncoderOptions {
    auto?: boolean;
  }
  export interface WriteFrameOptions {
    palette?: number[][];
    delay?: number;
    /** Netscape loop count; 0 = forever. Omit entirely to play once. */
    repeat?: number;
    transparent?: boolean;
    dispose?: number;
    first?: boolean;
  }
  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(options?: GifEncoderOptions): GifEncoder;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): number[][];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
  ): Uint8Array;
}
