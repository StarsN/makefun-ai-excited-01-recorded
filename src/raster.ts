// raster.ts — a tiny software rasterizer over a float RGB buffer.
//
// Every shape is a signed-distance function (SDF): negative inside, positive
// outside, in pixel units. A shape is painted by walking its bounding box and
// turning distance into coverage, which gives clean anti-aliased edges at the
// native resolution with no supersampling pass. Two paint modes: 'over'
// (ordinary alpha blending) and 'add' (additive light, for glows and fire).
// Everything is deterministic — the only randomness comes from mulberry32
// with a fixed seed supplied by the scene.

export type Rgb = [number, number, number];
export type Paint = Rgb | ((x: number, y: number) => Rgb);
export type Mode = 'over' | 'add';

/** Parse '#rrggbb' into a 0..1 float colour. */
export function hex(code: string): Rgb {
  const n = parseInt(code.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Linear interpolation between two colours. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Scale a colour's brightness. */
export function scale(c: Rgb, s: number): Rgb {
  return [c[0] * s, c[1] * s, c[2] * s];
}

/** mulberry32: small seeded PRNG, identical output on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

type Sdf = (x: number, y: number) => number;

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = clamp(t, 0, 1);
  const ex = x1 + dx * t - px;
  const ey = y1 + dy * t - py;
  return Math.hypot(ex, ey);
}

/** Signed distance to a polygon (negative inside), from vertex list. */
export function sdPolygon(points: ReadonlyArray<readonly [number, number]>): Sdf {
  return (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      d = Math.min(d, distToSegment(x, y, xj, yj, xi, yi));
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? -d : d;
  };
}

export class Raster {
  readonly width: number;
  readonly height: number;
  /** Float RGB per pixel, row-major. Additive light may push past 1. */
  readonly px: Float32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.px = new Float32Array(width * height * 3);
  }

  /** Fill the whole canvas by evaluating a colour function per pixel. */
  fill(fn: (x: number, y: number) => Rgb): void {
    const { width, height, px } = this;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = fn(x, y);
        const i = (y * width + x) * 3;
        px[i] = c[0];
        px[i + 1] = c[1];
        px[i + 2] = c[2];
      }
    }
  }

  /**
   * Paint an SDF shape. `feather` is the anti-aliasing width in pixels.
   * The paint may be a flat colour or a per-pixel colour function (gradients).
   */
  shape(
    bbox: readonly [number, number, number, number],
    sdf: Sdf,
    paint: Paint,
    alpha: number,
    mode: Mode = 'over',
    feather = 1.4,
  ): void {
    const { width, height, px } = this;
    const x0 = Math.max(0, Math.floor(bbox[0]));
    const y0 = Math.max(0, Math.floor(bbox[1]));
    const x1 = Math.min(width - 1, Math.ceil(bbox[2]));
    const y1 = Math.min(height - 1, Math.ceil(bbox[3]));
    const paintFn = typeof paint === 'function' ? (paint as (x: number, y: number) => Rgb) : null;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = sdf(x, y);
        const coverage = clamp(0.5 - d / feather, 0, 1);
        if (coverage <= 0) continue;
        const c = paintFn ? paintFn(x, y) : (paint as Rgb);
        const a = alpha * coverage;
        const i = (y * width + x) * 3;
        if (mode === 'add') {
          px[i] += c[0] * a;
          px[i + 1] += c[1] * a;
          px[i + 2] += c[2] * a;
        } else {
          px[i] += (c[0] - px[i]) * a;
          px[i + 1] += (c[1] - px[i + 1]) * a;
          px[i + 2] += (c[2] - px[i + 2]) * a;
        }
      }
    }
  }

  /** A filled circle (optionally a spatial paint function for gradients). */
  disc(cx: number, cy: number, r: number, paint: Paint, alpha = 1, mode: Mode = 'over'): void {
    this.shape([cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2], (x, y) => Math.hypot(x - cx, y - cy) - r, paint, alpha, mode);
  }

  /** Soft additive light: brightness falls off quadratically to the rim. */
  glow(cx: number, cy: number, r: number, color: Rgb, strength: number): void {
    const { width, height, px } = this;
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = Math.hypot(x - cx, y - cy) / r;
        if (t >= 1) continue;
        const fall = (1 - t) * (1 - t);
        const i = (y * width + x) * 3;
        px[i] += color[0] * strength * fall;
        px[i + 1] += color[1] * strength * fall;
        px[i + 2] += color[2] * strength * fall;
      }
    }
  }

  /** A filled ellipse, optionally rotated (radians, clockwise on screen). */
  ellipse(cx: number, cy: number, rx: number, ry: number, paint: Paint, alpha = 1, rot = 0, mode: Mode = 'over'): void {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const reach = Math.max(rx, ry) + 2;
    this.shape(
      [cx - reach, cy - reach, cx + reach, cy + reach],
      (x, y) => {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const k = Math.hypot(lx / rx, ly / ry);
        return (k - 1) * Math.min(rx, ry);
      },
      paint,
      alpha,
      mode,
    );
  }

  /** A thick line segment with round caps (a capsule). */
  capsule(x1: number, y1: number, x2: number, y2: number, r: number, paint: Paint, alpha = 1, mode: Mode = 'over'): void {
    this.shape(
      [Math.min(x1, x2) - r - 2, Math.min(y1, y2) - r - 2, Math.max(x1, x2) + r + 2, Math.max(y1, y2) + r + 2],
      (x, y) => distToSegment(x, y, x1, y1, x2, y2) - r,
      paint,
      alpha,
      mode,
    );
  }

  /** A ring (annulus): outline of a circle with the given stroke width. */
  ring(cx: number, cy: number, r: number, width: number, paint: Paint, alpha = 1, mode: Mode = 'over'): void {
    const outer = r + width / 2 + 2;
    this.shape(
      [cx - outer, cy - outer, cx + outer, cy + outer],
      (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - width / 2,
      paint,
      alpha,
      mode,
    );
  }

  /** A filled polygon from screen-space points. */
  polygon(points: ReadonlyArray<readonly [number, number]>, paint: Paint, alpha = 1, mode: Mode = 'over'): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    this.shape([minX - 2, minY - 2, maxX + 2, maxY + 2], sdPolygon(points), paint, alpha, mode);
  }

  /**
   * Stamp filled discs along a polyline — the brush for comet trails, scarf
   * ribbons and arcs. `radiusAt` and `paintAt` receive t in 0..1 along the
   * whole path, so width and colour can taper and shift along the stroke.
   */
  strokePath(
    points: ReadonlyArray<readonly [number, number]>,
    radiusAt: (t: number) => number,
    paintAt: (t: number) => Rgb,
    alphaAt: (t: number) => number,
    mode: Mode = 'over',
    step = 3,
  ): void {
    // Cumulative lengths, so t tracks distance along the path.
    const lengths: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const total = lengths[lengths.length - 1];
    if (total === 0) return;
    for (let s = 0; s <= total; s += step) {
      const t = s / total;
      let seg = 1;
      while (seg < lengths.length - 1 && lengths[seg] < s) seg++;
      const segT = (s - lengths[seg - 1]) / Math.max(1e-6, lengths[seg] - lengths[seg - 1]);
      const x = points[seg - 1][0] + (points[seg][0] - points[seg - 1][0]) * segT;
      const y = points[seg - 1][1] + (points[seg][1] - points[seg - 1][1]) * segT;
      this.disc(x, y, radiusAt(t), paintAt(t), alphaAt(t), mode);
    }
  }

  /** Multiply every pixel by a per-pixel factor (vignette, fades). */
  multiply(fn: (x: number, y: number) => number): void {
    const { width, height, px } = this;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const f = fn(x, y);
        const i = (y * width + x) * 3;
        px[i] *= f;
        px[i + 1] *= f;
        px[i + 2] *= f;
      }
    }
  }

  /** Clamp to 0..1 with a soft shoulder and quantise to 8-bit RGB bytes. */
  toRgbBytes(): Uint8Array {
    const out = new Uint8Array(this.width * this.height * 3);
    for (let i = 0; i < this.px.length; i++) {
      const v = this.px[i];
      // Gentle filmic shoulder so additive highlights roll off, not clip.
      const soft = v <= 0 ? 0 : v / (1 + Math.max(0, v - 1) * 0.55);
      out[i] = Math.round(clamp(soft, 0, 1) * 255);
    }
    return out;
  }
}
