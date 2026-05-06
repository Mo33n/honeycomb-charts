import type { CanvasLayout, CanvasScene } from '../../lib/canvas-host.js';
import { buildFootprintLayout, validateFootprintViewModel } from './layout.js';
import { renderFootprintGeneric } from './renderer.js';
import { createFootprintGenericSampleViewModel } from './sample-data.js';
import type { FootprintGenericViewModel } from './types.js';

/**
 * Pure-canvas footprint driven entirely by {@link FootprintGenericViewModel}:
 * declarative **slots**, **weights**, **theme**, and **bar** data.
 */
export class FootprintGenericScene implements CanvasScene {
	public readonly id = 'footprint_generic';
	public readonly title = 'Generic footprint (config-driven)';
	private readonly _vm: FootprintGenericViewModel;

	public constructor(viewModel: FootprintGenericViewModel) {
		validateFootprintViewModel(viewModel);
		this._vm = viewModel;
	}

	public draw(ctx: CanvasRenderingContext2D, layout: CanvasLayout): void {
		const L = buildFootprintLayout(this._vm, layout.cssWidth, layout.cssHeight);
		renderFootprintGeneric({ ctx, vm: this._vm, layout: L });
	}
}

export const footprintGenericDemoScene: CanvasScene = new FootprintGenericScene(
	createFootprintGenericSampleViewModel()
);
