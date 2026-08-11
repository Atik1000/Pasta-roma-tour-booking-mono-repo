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
 * They are deliberately abstract, not stock photography — a seeded catalogue
 * should not be mistakable for real content.
 *
 * Abstract is not the same as interchangeable, though. Every image used to be
 * the same diagonal wash in a different hue, so a blog listing or a tour grid
 * showed the identical picture a dozen times over and read as a bug. Each slug
 * now picks one of six *compositions* as well as its own palette, so adjacent
 * tiles differ in shape and not only in colour.
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

/** A pixel painter, in normalised coordinates. */
type Paint = (x: number, y: number) => [number, number, number];

/** Aspect correction, so a circle drawn in these coordinates comes out round. */
const ASPECT = WIDTH / HEIGHT;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The composition for a slug.
 *
 * Six shapes, chosen by the hash: a diagonal wash, a sun over a horizon, a
 * colonnade of arches, a sunburst, stacked terraces, and ripples. The point is
 * variety at thumbnail size — two tiles side by side must not look like the
 * same image twice.
 */
/**
 * Murmur3's finalizer, used to pick the shape.
 *
 * `(seed >>> 3) % 6` drew the shape from a handful of adjacent bits, and FNV
 * leaves those poorly mixed: across the seeded catalogue it put 16 images on
 * one shape and 5 on another, and eight of twenty blog covers came out as the
 * same diagonal wash. Two posts next to each other in the listing then looked
 * like the same picture twice, which is exactly what the shapes were added to
 * avoid.
 *
 * Avalanching first spreads them 8–16 instead of 5–16, and — because the hue
 * is drawn from the raw seed — it also decorrelates shape from colour, so two
 * tiles that happen to share a palette no longer share a composition too.
 */
function avalanche(value: number): number {
  let h = value;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

function composition(seed: number): Paint {
  const hueA = seed % 360;
  /**
   * A near neighbour, and deliberately *not* wrapped into 0–360 here.
   *
   * Wrapping it is what produced the rainbow tiles: a slug hashing to hue 350
   * got a second hue of 30, and interpolating 350 → 30 walks backwards through
   * every colour on the wheel instead of the 40° step that was intended. The
   * wrap belongs at the point of conversion, where the interpolated value is
   * already in the right direction.
   */
  const hueB = hueA + 25 + ((seed >>> 9) % 50);
  const saturation = 0.28 + ((seed >>> 4) % 5) * 0.05;
  const phase = (seed % 100) / 100;

  const shade = (hueMix: number, light: number, sat = saturation): [number, number, number] =>
    hslToRgb((hueA + (hueB - hueA) * clamp01(hueMix) + 360) % 360, sat, clamp01(light));

  switch (avalanche(seed) % 6) {
    // Diagonal wash with gentle banding — the original treatment, kept as one
    // of the six rather than as all of them.
    case 0:
      return (x, y) => {
        const u = x / WIDTH;
        const v = y / HEIGHT;
        const t = u * 0.65 + v * 0.35;
        const band = Math.sin(v * Math.PI * 3 + phase * 7) * 0.02;
        return shade(t, 0.36 + t * 0.28 + band);
      };

    // A sun sitting over a horizon: bright sky, dark ground, hard edge between.
    case 1: {
      const horizon = 0.56 + ((seed >>> 7) % 18) / 100;
      const sunX = 0.22 + ((seed >>> 11) % 56) / 100;
      const sunY = horizon - 0.14;
      const sunRadius = 0.08 + ((seed >>> 17) % 5) / 100;

      return (x, y) => {
        const u = x / WIDTH;
        const v = y / HEIGHT;

        if (v > horizon) {
          const depth = (v - horizon) / (1 - horizon);
          return shade(1, 0.26 - depth * 0.12, saturation * 0.55);
        }

        const dx = (u - sunX) * ASPECT;
        const dy = v - sunY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < sunRadius) return shade(0.1, 0.78, saturation * 0.75);

        // The glow falls off over three sun radii, then the sky takes over.
        const glow = clamp01(1 - (distance - sunRadius) / (sunRadius * 3)) * 0.22;
        return shade(v / horizon, 0.4 + (v / horizon) * 0.2 + glow);
      };
    }

    // A colonnade: solid façade with arched openings cut out of the lower half.
    case 2: {
      const columns = 4 + ((seed >>> 13) % 4);
      const base = 0.86;
      const archHeight = 0.42;

      return (x, y) => {
        const u = x / WIDTH;
        const v = y / HEIGHT;

        const cell = u * columns - Math.floor(u * columns);
        const offset = (cell - 0.5) * 2;
        const curve = Math.sqrt(Math.max(0, 1 - offset * offset)) * archHeight;

        if (v > base - curve && v < base) return shade(1, 0.2, saturation * 0.5);

        return shade(v, 0.44 + (1 - v) * 0.22);
      };
    }

    // A sunburst from a point below the frame.
    case 3: {
      const spokes = 8 + ((seed >>> 15) % 9);
      const originX = 0.3 + ((seed >>> 19) % 40) / 100;

      return (x, y) => {
        const dx = (x / WIDTH - originX) * ASPECT;
        const dy = y / HEIGHT - 1.08;
        const angle = Math.atan2(dy, dx);
        const distance = Math.sqrt(dx * dx + dy * dy);

        const ray = (Math.sin(angle * spokes + phase * 6) + 1) / 2;
        return shade(clamp01(distance), 0.34 + ray * 0.09 + clamp01(0.9 - distance) * 0.16);
      };
    }

    // Stacked terraces, sheared so the bands are not dead horizontal.
    case 4: {
      const rows = 5 + ((seed >>> 21) % 5);
      const shear = 0.1 + ((seed >>> 5) % 20) / 100;

      return (x, y) => {
        const v = clamp01(y / HEIGHT + (x / WIDTH) * shear - shear / 2);
        const step = Math.min(rows - 1, Math.floor(v * rows));
        const t = step / (rows - 1);
        return shade(t, 0.28 + t * 0.36);
      };
    }

    // Ripples spreading from an off-centre point.
    default: {
      const centreX = 0.3 + ((seed >>> 23) % 40) / 100;
      const centreY = 0.3 + ((seed >>> 6) % 40) / 100;
      const frequency = 14 + (seed % 10);

      return (x, y) => {
        const dx = (x / WIDTH - centreX) * ASPECT;
        const dy = y / HEIGHT - centreY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const ripple = (Math.sin(distance * frequency + phase * 6) + 1) / 2;
        return shade(clamp01(distance), 0.34 + ripple * 0.1 + clamp01(1 - distance) * 0.18);
      };
    }
  }
}

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

  const paint = composition(hash(name));

  const png = encodePng(WIDTH, HEIGHT, (x, y) => {
    const [r, g, b] = paint(x, y);
    return [quantize(r), quantize(g), quantize(b)];
  });

  writeFileSync(join(directory, `${name}.png`), png);

  return url;
}
