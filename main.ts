// THE OTTER COMET — an entry for make.fun's ai-excited-01 ("Make the AI judge
// excited"). The program draws its image from scratch at runtime: a helmeted
// otter astronaut riding a blazing comet through a shattering crystal ring
// toward a golden star-portal, rendered by a small SDF software rasterizer
// (src/scene.ts, src/raster.ts) and written as a PNG by a hand-rolled encoder
// (src/png.ts). Node standard library only, fully deterministic — every run
// writes the same bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderScene } from './src/scene.ts';
import { encodePng } from './src/png.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });

const image = renderScene();
writeFileSync(join(outDir, 'entry.png'), encodePng(image.width, image.height, image.rgb));
