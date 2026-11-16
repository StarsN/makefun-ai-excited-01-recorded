// scene.ts — "THE OTTER COMET": the whole picture, drawn procedurally.
//
// A helmeted otter astronaut rides a blazing comet along a hard diagonal
// (lower-left to upper-right), caught at the exact instant it smashes through
// a ring of teal crystal shards on its way into a radiant golden star-portal
// that fills the top-right corner. Flat, bold vector shapes; a ringed planet,
// a crescent moon and a starfield stay quiet in the background so the comet,
// the breaking ring and the portal read instantly — even at 300 px wide.

import {
  Raster,
  hex,
  mix,
  scale,
  clamp,
  smoothstep,
  mulberry32,
  type Rgb,
} from './raster.ts';

export const WIDTH = 1024;
export const HEIGHT = 1024;

// ---- palette -------------------------------------------------------------
const SPACE_TOP = hex('#1c1c44');
const SPACE_BOTTOM = hex('#0d0d27');
const NEBULA_VIOLET = hex('#5b2a9d');
const NEBULA_TEAL = hex('#0e6e7e');
const NEBULA_MAGENTA = hex('#8e2a6e');
const GOLD = hex('#ffd76a');
const GOLD_CORE = hex('#fff6d8');
const AMBER = hex('#ffab2e');
const COMET_MAGENTA = hex('#ff2e88');
const COMET_ORANGE = hex('#ff5e3a');
const COMET_DEEP = hex('#8e2a9e');
const CRYSTAL_DEEP = hex('#0b6e63');
const CRYSTAL = hex('#14b8a6');
const CRYSTAL_LIGHT = hex('#6ff5e0');
const CRYSTAL_EDGE = hex('#eafffb');
const OTTER_BROWN = hex('#8a5a30');
const OTTER_DARK = hex('#5f3c1e');
const OTTER_CREAM = hex('#f6e7c8');
const OTTER_NOSE = hex('#2b1a10');
const SCARF = hex('#ff7a1a');
const SCARF_DARK = hex('#e85d04');
const STAR_WHITE = hex('#ffffff');

// ---- composition anchors ---------------------------------------------------
const PORTAL = { x: 878, y: 148, r: 148 };
const RING = { x: 588, y: 428, r: 168 };
const HEAD = { x: 668, y: 352 };

type Pt = readonly [number, number];

/** Multi-stop colour gradient: stops are [t, colour] pairs, t ascending. */
function gradient(stops: ReadonlyArray<readonly [number, Rgb]>): (t: number) => Rgb {
  return (t) => {
    const x = clamp(t, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (x <= stops[i][0]) {
        const [t0, c0] = stops[i - 1];
        const [t1, c1] = stops[i];
        return mix(c0, c1, (x - t0) / Math.max(1e-6, t1 - t0));
      }
    }
    return stops[stops.length - 1][1];
  };
}

/** Catmull-Rom spline through control points, as a dense polyline. */
function spline(control: ReadonlyArray<Pt>, samplesPerSegment = 24): Pt[] {
  const pts: Pt[] = [];
  const p = (i: number): Pt => control[clamp(i, 0, control.length - 1)];
  for (let i = 0; i < control.length - 1; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      pts.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  pts.push(control[control.length - 1]);
  return pts;
}

/** Resample a polyline to roughly uniform spacing. */
function resample(points: ReadonlyArray<Pt>, step: number): Pt[] {
  const out: Pt[] = [points[0]];
  // Distance still to walk before the next emitted point; counts down across
  // segment boundaries so short segments accumulate instead of being skipped.
  let distToNext = step;
  for (let i = 1; i < points.length; i++) {
    let [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    let segLen = Math.hypot(bx - ax, by - ay);
    while (segLen >= distToNext && segLen > 0) {
      const t = distToNext / segLen;
      const nx = ax + (bx - ax) * t;
      const ny = ay + (by - ay) * t;
      out.push([nx, ny]);
      ax = nx;
      ay = ny;
      segLen = Math.hypot(bx - ax, by - ay);
      distToNext = step;
    }
    distToNext -= segLen;
  }
  out.push(points[points.length - 1]);
  return out;
}

// ---- background ------------------------------------------------------------

function drawBackground(r: Raster, rng: () => number): void {
  r.fill((x, y) => {
    const t = y / HEIGHT;
    const base = mix(SPACE_TOP, SPACE_BOTTOM, t);
    // A whisper of extra depth: darker toward the lower-left corner.
    const corner = Math.hypot(x, HEIGHT - y) / (WIDTH * 1.2);
    return scale(base, 1 - 0.25 * smoothstep(0.4, 1.1, corner));
  });
  // Quiet nebula light, kept far below the brightness of the action.
  r.glow(300, 290, 400, NEBULA_VIOLET, 0.16);
  r.glow(830, 770, 430, NEBULA_TEAL, 0.11);
  r.glow(500, 850, 360, NEBULA_MAGENTA, 0.09);
  r.glow(140, 580, 300, hex('#27407e'), 0.12);

  // Starfield: many faint pinpoints, a few with cross sparkles.
  for (let i = 0; i < 300; i++) {
    const x = rng() * WIDTH;
    const y = rng() * HEIGHT;
    const bright = 0.2 + rng() * 0.65;
    const tint = rng();
    const color = tint < 0.6 ? STAR_WHITE : tint < 0.8 ? hex('#ffd9a0') : hex('#a8c8ff');
    r.disc(x, y, 0.8 + rng() * 1.5, color, bright * 0.8);
    if (rng() < 0.035) {
      const len = 7 + rng() * 8;
      r.capsule(x - len, y, x + len, y, 1, color, bright * 0.5);
      r.capsule(x, y - len, x, y + len, 1, color, bright * 0.5);
    }
  }
}

function drawPlanet(r: Raster): void {
  const cx = 168;
  const cy = 172;
  const rad = 56;
  const rot = -0.42;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const ringSdf = (frontOnly: boolean) => (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    if (frontOnly && ly < 0) return 1e6;
    const k = Math.hypot(lx / 96, ly / 30);
    return Math.abs(k - 1) * 30 - 3.5;
  };
  // Back half of the ring, behind the planet.
  r.shape([cx - 110, cy - 60, cx + 110, cy + 60], ringSdf(false), hex('#8f9ad4'), 0.4);
  // Planet body: cool violet, lit from the right (toward the portal).
  r.disc(cx, cy, rad, (x) => {
    const t = clamp((x - (cx - rad)) / (2 * rad), 0, 1);
    return mix(hex('#454a7d'), hex('#7d84c4'), t);
  });
  r.disc(cx, cy, rad, (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / rad;
    return scale(hex('#20224a'), smoothstep(0.75, 1.0, d) * 0.5);
  }, 0.5);
  // Front arc of the ring, passing before the planet's lower face.
  r.shape([cx - 110, cy - 60, cx + 110, cy + 60], ringSdf(true), hex('#aab4e8'), 0.85);
}

function drawMoon(r: Raster): void {
  const cx = 892;
  const cy = 878;
  const rad = 44;
  r.glow(cx, cy, 90, hex('#cfd4e8'), 0.1);
  r.shape(
    [cx - rad - 2, cy - rad - 2, cx + rad + 30, cy + rad + 2],
    (x, y) => Math.max(Math.hypot(x - cx, y - cy) - rad, -(Math.hypot(x - (cx + 26), y - (cy - 18)) - 40)),
    hex('#e9e7db'),
    0.92,
  );
}

// ---- the portal --------------------------------------------------------------

function drawPortal(r: Raster, rng: () => number): void {
  const { x, y, r: rad } = PORTAL;
  // Ambient golden wash over the whole corner.
  r.glow(x, y, 540, AMBER, 0.42);
  r.glow(x, y, 320, GOLD, 0.5);

  // Radiant rays: long additive wedges bursting outward.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng() * 0.2;
    const len = 250 + rng() * 190;
    const wdt = 9 + rng() * 13;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    const perpX = -dirY;
    const perpY = dirX;
    r.polygon(
      [
        [x + perpX * wdt, y + perpY * wdt],
        [x - perpX * wdt, y - perpY * wdt],
        [x + dirX * len, y + dirY * len],
      ],
      GOLD,
      0.05 + rng() * 0.06,
      'add',
    );
  }

  // The portal disc: white-hot heart cooling to amber at the rim.
  const portalGradient = gradient([
    [0, GOLD_CORE],
    [0.45, hex('#ffe98f')],
    [0.78, GOLD],
    [1, hex('#ff8a00')],
  ]);
  r.disc(x, y, rad, (px, py) => portalGradient(Math.hypot(px - x, py - y) / rad), 1);
  // Swirl arcs inside the disc, like a turning gate.
  for (const [arcR, start, span, alpha] of [
    [100, 0.4, 2.2, 0.3],
    [66, 2.8, 1.9, 0.35],
  ] as const) {
    const arcPts: Pt[] = [];
    for (let s = 0; s <= 30; s++) {
      const a = start + (s / 30) * span;
      arcPts.push([x + Math.cos(a) * arcR, y + Math.sin(a) * arcR]);
    }
    r.strokePath(arcPts, (t) => 5.5 * (1 - t) + 1.5, () => GOLD_CORE, () => alpha, 'over', 4);
  }
  // Blazing core and rim rings.
  r.glow(x, y, 130, GOLD_CORE, 0.85);
  r.disc(x, y, 44, GOLD_CORE, 0.95);
  r.ring(x, y, rad - 2, 5, hex('#ffe9a8'), 0.95);
  r.ring(x, y, rad + 12, 22, AMBER, 0.22, 'add');
  // Sparkles on the rim.
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const sx = x + Math.cos(a) * (rad + 6 + rng() * 26);
    const sy = y + Math.sin(a) * (rad + 6 + rng() * 26);
    const len = 6 + rng() * 9;
    r.capsule(sx - len, sy, sx + len, sy, 1.4, GOLD_CORE, 0.8, 'add');
    r.capsule(sx, sy - len, sx, sy + len, 1.4, GOLD_CORE, 0.8, 'add');
  }
}

// ---- speed streaks and particles --------------------------------------------

function drawStreaks(r: Raster, rng: () => number): void {
  // Motion direction of the comet: up and to the right at 45 degrees.
  const ux = Math.SQRT1_2;
  const uy = -Math.SQRT1_2;
  for (let i = 0; i < 34; i++) {
    // Cluster along the comet's diagonal band, a few strays elsewhere.
    const along = rng();
    const bx = 90 + along * 760 + (rng() - 0.5) * 300;
    const by = 950 - along * 740 + (rng() - 0.5) * 300;
    if (bx < 0 || bx > WIDTH || by < 0 || by > HEIGHT) continue;
    const len = 26 + rng() * 70;
    const tint = rng();
    const color = tint < 0.5 ? STAR_WHITE : tint < 0.75 ? GOLD : hex('#6ff5e0');
    r.capsule(bx, by, bx - ux * len, by - uy * len, 1.4 + rng() * 1.8, color, 0.14 + rng() * 0.3);
  }
}

function drawParticles(r: Raster, rng: () => number, path: ReadonlyArray<Pt>): void {
  // Embers streaming off the trail.
  for (let i = 0; i < 80; i++) {
    const p = path[Math.floor(rng() * path.length)];
    const x = p[0] + (rng() - 0.5) * 130;
    const y = p[1] + (rng() - 0.5) * 130;
    const tint = rng();
    const color = tint < 0.55 ? GOLD : tint < 0.8 ? COMET_MAGENTA : COMET_ORANGE;
    r.glow(x, y, 5 + rng() * 9, color, 0.5);
    r.disc(x, y, 1.2 + rng() * 2, GOLD_CORE, 0.75, 'add');
  }
  // Crystal dust bursting off the ring.
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const d = RING.r + rng() * 150;
    const x = RING.x + Math.cos(a) * d;
    const y = RING.y + Math.sin(a) * d;
    r.glow(x, y, 4 + rng() * 7, CRYSTAL_LIGHT, 0.45);
    r.disc(x, y, 1 + rng() * 1.8, CRYSTAL_EDGE, 0.8, 'add');
  }
}

// ---- the comet ----------------------------------------------------------------

function drawTrail(r: Raster, rng: () => number): Pt[] {
  const control: Pt[] = [
    [HEAD.x, HEAD.y],
    [548, 472],
    [418, 606],
    [288, 742],
    [152, 862],
    [64, 950],
  ];
  const path = resample(spline(control, 30), 4);
  const n = path.length;

  // Pass 1: wide additive halo, magenta heat around the whole ribbon.
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rad = 85 * Math.pow(1 - t, 1.1) + 8;
    r.disc(path[i][0], path[i][1], rad, COMET_MAGENTA, 0.05, 'add');
  }
  // Pass 2: the flame ribbon itself. Stamp centres wander and radii breathe
  // (seeded, so still deterministic) — the edge licks like real fire instead
  // of ruling a straight beam.
  const flame = gradient([
    [0, COMET_ORANGE],
    [0.3, COMET_MAGENTA],
    [0.75, hex('#c22a9e')],
    [1, COMET_DEEP],
  ]);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rad = (50 * Math.pow(1 - t, 1.2) + 2.5) * (0.85 + rng() * 0.3);
    const jx = (rng() - 0.5) * rad * 0.45;
    const jy = (rng() - 0.5) * rad * 0.45;
    r.disc(path[i][0] + jx, path[i][1] + jy, rad, flame(t), 0.5);
  }
  // Pass 3: the molten core ribbon, gold cooling to orange.
  const core = gradient([
    [0, hex('#ffdf8a')],
    [0.4, GOLD],
    [1, COMET_ORANGE],
  ]);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rad = 23 * Math.pow(1 - t, 1.1) + 1.2;
    r.disc(path[i][0], path[i][1], rad, core(t), 0.75);
  }
  // Pass 4: a near-white spine right behind the head.
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (t > 0.4) break;
    const rad = 13 * (1 - t / 0.4) + 1;
    r.disc(path[i][0], path[i][1], rad, GOLD_CORE, 0.65);
  }
  return path;
}

function drawCometHead(r: Raster): void {
  r.glow(HEAD.x, HEAD.y, 200, COMET_MAGENTA, 0.55);
  r.glow(HEAD.x, HEAD.y, 120, GOLD, 0.55);
  // The head: white-gold heart, gold mantle, magenta rim.
  const headGradient = gradient([
    [0, hex('#fffbe8')],
    [0.4, hex('#ffe98f')],
    [0.72, GOLD],
    [0.92, COMET_ORANGE],
    [1, COMET_MAGENTA],
  ]);
  r.disc(HEAD.x, HEAD.y, 60, (x, y) => headGradient(Math.hypot(x - HEAD.x, y - HEAD.y) / 60), 1);
  r.disc(HEAD.x - 10, HEAD.y - 10, 26, GOLD_CORE, 0.85);
}

// ---- the crystal ring -----------------------------------------------------------

interface Shard {
  points: Pt[];
  facet: Pt[];
  edge: readonly [Pt, Pt];
}

function makeShard(cx: number, cy: number, angle: number, len: number, wid: number, tilt: number): Shard {
  const a = angle + tilt;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const local: Pt[] = [
    [len * 0.55, 0],
    [-len * 0.08, wid / 2],
    [-len * 0.45, 0],
    [-len * 0.08, -wid / 2],
  ];
  const toScreen = (p: Pt): Pt => [cx + p[0] * cos - p[1] * sin, cy + p[0] * sin + p[1] * cos];
  const points = local.map(toScreen);
  return {
    points,
    facet: [points[0], points[1], toScreen([-len * 0.05, 0])],
    edge: [points[0], points[1]],
  };
}

function paintShard(r: Raster, shard: Shard, alpha: number): void {
  r.polygon(shard.points, CRYSTAL_DEEP, alpha);
  r.polygon(shard.facet, CRYSTAL_LIGHT, alpha * 0.9);
  r.polygon([shard.points[0], shard.points[3], shard.facet[2]], CRYSTAL, alpha * 0.95);
  r.capsule(shard.edge[0][0], shard.edge[0][1], shard.edge[1][0], shard.edge[1][1], 1.6, CRYSTAL_EDGE, alpha * 0.6);
}

/** The ring of shards; returns a few foreground shards to repaint later. */
function drawCrystalRing(r: Raster, rng: () => number): Shard[] {
  // Ghost of the unbroken ring, faint behind the fragments.
  r.ring(RING.x, RING.y, RING.r, 3, CRYSTAL, 0.16);

  const front: Shard[] = [];
  const count = 15;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.22;
    // Some shards still sit on the ring; others are already flying outward.
    const burst = rng();
    const disp = burst < 0.35 ? rng() * 14 : 16 + Math.pow(rng(), 1.6) * 95;
    const dist = RING.r + disp;
    const cx = RING.x + Math.cos(angle) * dist;
    const cy = RING.y + Math.sin(angle) * dist;
    const shard = makeShard(cx, cy, angle, 58 + rng() * 48, 21 + rng() * 14, (rng() - 0.5) * 1.1);
    // Shards on the lower-left arc read as nearest the viewer: repaint later.
    if (angle > Math.PI * 0.55 && angle < Math.PI * 1.05 && disp < 40) front.push(shard);
    else paintShard(r, shard, 1);
  }
  // Loose fragments tumbling away from the break.
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    const d = RING.r + 50 + rng() * 170;
    const cx = RING.x + Math.cos(a) * d;
    const cy = RING.y + Math.sin(a) * d;
    const s = 7 + rng() * 15;
    const rot = rng() * Math.PI;
    const tri: Pt[] = [0, 1, 2].map((k) => {
      const aa = rot + (k / 3) * Math.PI * 2;
      return [cx + Math.cos(aa) * s, cy + Math.sin(aa) * s] as Pt;
    });
    r.polygon(tri, rng() < 0.5 ? CRYSTAL : CRYSTAL_LIGHT, 0.9);
  }
  return front;
}

// ---- the otter ------------------------------------------------------------------

function drawOtter(r: Raster): void {
  // Local space: the otter faces +x, up is -y; rotated so +x aims up-right,
  // leaning into the flight direction, and set down onto the comet's head.
  const A = -0.6;
  const cos = Math.cos(A);
  const sin = Math.sin(A);
  const OX = 622;
  const OY = 282;
  const xf = (x: number, y: number): Pt => [OX + x * cos - y * sin, OY + x * sin + y * cos];
  const disc = (x: number, y: number, rad: number, paint: Rgb, alpha = 1) => {
    const [sx, sy] = xf(x, y);
    r.disc(sx, sy, rad, paint, alpha);
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, paint: Rgb, alpha = 1, localRot = 0) => {
    const [sx, sy] = xf(x, y);
    r.ellipse(sx, sy, rx, ry, paint, alpha, A + localRot);
  };
  const capsule = (x1: number, y1: number, x2: number, y2: number, rad: number, paint: Rgb, alpha = 1) => {
    const [ax, ay] = xf(x1, y1);
    const [bx, by] = xf(x2, y2);
    r.capsule(ax, ay, bx, by, rad, paint, alpha);
  };

  // Tail, streaming behind and below.
  capsule(-52, 24, -96, 44, 13, OTTER_DARK);
  capsule(-88, 40, -104, 50, 9, OTTER_BROWN);
  // Body and cream belly.
  ellipse(0, 18, 60, 46, OTTER_BROWN);
  ellipse(15, 31, 36, 29, OTTER_CREAM, 0.95);
  // Feet planted on the fireball.
  ellipse(-16, 57, 20, 10, OTTER_DARK, 1, 0.15);
  ellipse(32, 56, 20, 10, OTTER_DARK, 1, -0.1);
  // Scarf: knot plus two ribbons arcing away behind the neck.
  const ribbon1: Pt[] = [
    [2, -14],
    [-38, -10],
    [-78, -2],
    [-118, -8],
    [-156, 4],
  ].map(([x, y]) => xf(x, y));
  r.strokePath(ribbon1, (t) => 12 * (1 - t) + 3, () => SCARF, () => 1, 'over', 3);
  const ribbon2: Pt[] = [
    [0, -20],
    [-34, -24],
    [-70, -20],
    [-104, -28],
  ].map(([x, y]) => xf(x, y));
  r.strokePath(ribbon2, (t) => 8 * (1 - t) + 2, () => SCARF_DARK, () => 1, 'over', 3);
  disc(4, -15, 10.5, SCARF);
  // Arm reaching forward, gripping the comet.
  ellipse(36, 32, 23, 11, OTTER_DARK, 1, 0.65);
  // Ears, then head.
  disc(13, -65, 12.5, OTTER_DARK);
  disc(64, -63, 11.5, OTTER_DARK);
  disc(13, -65, 6, hex('#c68b4e'));
  disc(64, -63, 5.5, hex('#c68b4e'));
  disc(40, -34, 39, OTTER_BROWN);
  // Muzzle, nose and eye.
  ellipse(59, -22, 23, 16, OTTER_CREAM);
  ellipse(77, -28, 7.5, 5.5, OTTER_NOSE);
  disc(49, -44, 5.5, hex('#1c1108'));
  disc(51, -46.5, 1.9, STAR_WHITE);
  disc(33, -23, 7, hex('#e8906a'), 0.35);
  // The glass helmet: faint dome, bright rim, one clean highlight arc.
  disc(40, -34, 55, hex('#bfe3ff'), 0.13);
  const [hx, hy] = xf(40, -34);
  r.ring(hx, hy, 55, 5, hex('#dff2ff'), 0.95);
  const highlight: Pt[] = [];
  for (let s = 0; s <= 16; s++) {
    const a = Math.PI * 1.08 + (s / 16) * Math.PI * 0.5;
    highlight.push([hx + Math.cos(a) * 43, hy + Math.sin(a) * 43]);
  }
  r.strokePath(highlight, (t) => 3.4 * Math.sin(Math.PI * t) + 0.6, () => STAR_WHITE, () => 0.85, 'over', 3);
  // Two little gold bolts where the helmet meets the scarf.
  disc(2, 8, 4, GOLD);
  disc(72, 6, 4, GOLD);
}

// ---- the whole picture -----------------------------------------------------------

export function renderScene(): { width: number; height: number; rgb: Uint8Array } {
  const rng = mulberry32(0x07ce11);
  const r = new Raster(WIDTH, HEIGHT);

  drawBackground(r, rng);
  drawPlanet(r);
  drawMoon(r);
  drawPortal(r, rng);
  drawStreaks(r, rng);
  const trailPath = drawTrail(r, rng);
  const frontShards = drawCrystalRing(r, rng);
  drawCometHead(r);
  drawOtter(r);
  // Foreground shards and dust settle the depth: the comet is through the ring.
  for (const shard of frontShards) paintShard(r, shard, 1);
  drawParticles(r, rng, trailPath);

  // A gentle vignette keeps the eye on the diagonal.
  r.multiply((x, y) => 1 - 0.26 * smoothstep(480, 760, Math.hypot(x - WIDTH / 2, y - HEIGHT / 2)));

  return { width: WIDTH, height: HEIGHT, rgb: r.toRgbBytes() };
}
