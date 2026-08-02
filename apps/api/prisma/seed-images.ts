import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/**
 * Placeholder photography for the seed.
 *
 * The seed used to point at `images.unsplash.com/photo-<tour-slug>-1`, which
 * looks like a real Unsplash URL but is assembled from the tour slug — no such
 * photo id exists, so every one of them 404s and the whole catalogue renders as
 * the "no image" fallback. Rather than swap in a different remote host that
 * needs network access to work, the seed now writes its own images into the
 * uploads directory the API already serves. They resolve offline, in CI and in
 * Docker, and they travel the exact `/uploads/...` path a real upload does.
 *
 * They are deliberately abstract gradients, not stock photography — a seeded
 * catalogue should not be mistakable for real content.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);

  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed));

  return Buffer.concat([length, typed, checksum]);
}

/** An 8-bit truecolour PNG, one `paint` call per pixel. */
function encodePng(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
): Buffer {
  // Each scanline is prefixed with its filter byte; 0 means "no filter".
  const raw = Buffer.alloc(height * (1 + width * 3));
  let cursor = 0;

  for (let y = 0; y < height; y += 1) {
    raw[cursor] = 0;
    cursor += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      raw[cursor] = r;
      raw[cursor + 1] = g;
      raw[cursor + 2] = b;
      cursor += 3;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  // 10–12 stay zero: deflate compression, adaptive filtering, no interlace.

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A stable 32-bit hash, so a given slug always produces the same picture. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = l - chroma / 2;

  const [r, g, b] =
    h < 60
      ? [chroma, secondary, 0]
      : h < 120
        ? [secondary, chroma, 0]
        : h < 180
          ? [0, chroma, secondary]
          : h < 240
            ? [0, secondary, chroma]
            : h < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return [
    Math.round((r + match) * 255),
    Math.round((g + match) * 255),
    Math.round((b + match) * 255),
  ];
}

const WIDTH = 1280;
const HEIGHT = 720;

/**
 * Colour steps per channel.
 *
 * A continuous gradient gives almost every pixel its own value, which leaves
 * PNG's filter and deflate stages nothing to exploit — the first version of
 * these came out around 100KB each. Snapping to a coarse ramp collapses each
 * band into a long run and drops them to a few KB, with no visible difference
 * at the size a placeholder is ever displayed.
 */
const QUANTUM = 8;

const quantize = (channel: number): number =>
  Math.min(255, Math.round(channel / QUANTUM) * QUANTUM);

/** Where the seed's images live, under the directory the API serves. */
export const SEED_IMAGE_SUBDIR = 'seed';

/** Names already written this run, so a repeated slug is not re-encoded. */
const written = new Set<string>();

/**
 * Writes a placeholder for `name` and returns its public URL.
 *
 * Synchronous on purpose: the seed builds these inside `.map()` callbacks that
 * feed straight into `createMany`, and a promise there would ripple through
 * every caller for no benefit in a one-shot script.
 *
 * Rewriting the same file on every seed keeps the run idempotent — the images
 * directory never accumulates orphans from earlier seeds of the same slug.
 */
export function writeSeedImage(uploadsDir: string, apiOrigin: string, name: string): string {
  const directory = join(uploadsDir, SEED_IMAGE_SUBDIR);
  const url = `${apiOrigin}/uploads/${SEED_IMAGE_SUBDIR}/${name}.png`;

  if (written.has(name)) return url;
  written.add(name);

  mkdirSync(directory, { recursive: true });

  const seed = hash(name);
  const hue = seed % 360;
  const secondHue = (hue + 40 + (seed % 60)) % 360;

  const png = encodePng(WIDTH, HEIGHT, (x, y) => {
    // Diagonal blend between two related hues, with gentle banding so the
    // tiles read as distinct rather than as one flat wash.
    const t = (x / WIDTH) * 0.65 + (y / HEIGHT) * 0.35;
    const band = Math.sin((y / HEIGHT) * Math.PI * 3 + (seed % 7)) * 0.02;
    const mixedHue = hue + (secondHue - hue) * t;

    const [r, g, b] = hslToRgb((mixedHue + 360) % 360, 0.34, 0.36 + t * 0.28 + band);
    return [quantize(r), quantize(g), quantize(b)];
  });

  writeFileSync(join(directory, `${name}.png`), png);

  return url;
}
