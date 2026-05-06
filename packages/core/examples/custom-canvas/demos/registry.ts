/**
 * Central list of canvas demos. To add one:
 * 1. Create `demos/<name>/<name>-scene.ts` exporting a class that implements `CanvasScene`.
 * 2. Import it here and append to `CANVAS_DEMOS`.
 * 3. Run `npm run examples:dev:canvas` and open `?demo=<id>`.
 */

import type { CanvasScene } from '../lib/canvas-host.js';
import { butterflyDemoScene } from './butterfly/butterfly-scene.js';
import { numberBarDemoScene } from './number-bar/number-bar-scene.js';
import { footprintGenericDemoScene } from './footprint-generic/footprint-generic-scene.js';

export const CANVAS_DEMOS: readonly CanvasScene[] = [
	butterflyDemoScene,
	numberBarDemoScene,
	footprintGenericDemoScene,
];

export function getCanvasDemoById(id: string): CanvasScene | undefined {
	return CANVAS_DEMOS.find(d => d.id === id);
}

export function defaultCanvasDemo(): CanvasScene {
	return CANVAS_DEMOS[0] ?? butterflyDemoScene;
}
