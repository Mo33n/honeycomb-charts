/**
 * HC2-020: `correctionFlash` default, revision-triggered overlay alpha, fake clock, `prefers-reduced-motion`.
 */
import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { BitmapCoordinatesRenderingScope } from 'fancy-canvas';
import type { PaneRendererCustomData, PriceToCoordinateConverter, UTCTimestamp } from 'lightweight-charts';

import { defaultHoneycombSeriesOptions } from '../src/options/footprint-series-options.js';
import type { HoneycombSeriesOptions } from '../src/options/footprint-series-options.js';
import type { EnrichedCandle } from '../src/schema/types.js';
import {
	FootprintRenderer,
	setFootprintCorrectionFlashClockForTests,
} from '../src/render/footprint-renderer.js';

function enriched(time: UTCTimestamp, bid: number, revision: number): EnrichedCandle<UTCTimestamp> {
	return {
		time,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		revision,
		levels: [{ price: 100, values: { bid, ask: 30, delta: bid - 30 } }],
	};
}

function pane(bars: readonly EnrichedCandle<UTCTimestamp>[]): PaneRendererCustomData<UTCTimestamp, EnrichedCandle<UTCTimestamp>> {
	return {
		barSpacing: 8,
		conflationFactor: 1,
		visibleRange: { from: 0, to: bars.length },
		bars: bars.map((c, i) => ({
			x: 50 + i * 60,
			time: i as UTCTimestamp,
			barColor: '#fff',
			originalData: c,
		})),
	};
}

function mockCanvasTarget(ctx: CanvasRenderingContext2D): CanvasRenderingTarget2D {
	return {
		useBitmapCoordinateSpace<T>(f: (scope: BitmapCoordinatesRenderingScope) => T): T {
			const scope: BitmapCoordinatesRenderingScope = {
				context: ctx,
				mediaSize: { width: 640, height: 400 },
				bitmapSize: { width: 640, height: 400 },
				horizontalPixelRatio: 1,
				verticalPixelRatio: 1,
			};
			return f(scope);
		},
	} as unknown as CanvasRenderingTarget2D;
}

function mockCtx(): CanvasRenderingContext2D {
	return {
		font: '',
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 1,
		fillRect() {},
		fillText() {},
		strokeRect() {},
		beginPath() {},
		moveTo() {},
		lineTo() {},
		stroke() {},
		measureText: (s: string) => ({ width: Math.max(1, s.length * 5) }),
	} as unknown as CanvasRenderingContext2D;
}

const priceToCoord: PriceToCoordinateConverter = (p: number) => 350 - p * 2.2;

const baseOpts: HoneycombSeriesOptions = {
	...defaultHoneycombSeriesOptions,
	barMetricScope: 'perBar',
	bodyVisible: false,
	wicksVisible: false,
};

describe('correctionFlash (HC2-020)', () => {
	afterEach(() => {
		setFootprintCorrectionFlashClockForTests(null);
	});

	it('defaults to off in defaultHoneycombSeriesOptions', () => {
		assert.equal(defaultHoneycombSeriesOptions.correctionFlash, 'off');
	});

	it('starts flash on strictly increasing revision (subtle)', () => {
		const t0 = 1700000000 as UTCTimestamp;
		const r = new FootprintRenderer();
		const opts: HoneycombSeriesOptions = { ...baseOpts, correctionFlash: 'subtle' };
		setFootprintCorrectionFlashClockForTests(1_000_000);
		r.update(pane([enriched(t0, 50, 1)]), opts);
		assert.equal(r.getCorrectionFlashOverlayAlphaForTests(t0), 0);
		r.update(pane([enriched(t0, 51, 2)]), opts);
		const a = r.getCorrectionFlashOverlayAlphaForTests(t0);
		assert.ok(a > 0 && a <= 1);
		setFootprintCorrectionFlashClockForTests(1_000_200);
		const aMid = r.getCorrectionFlashOverlayAlphaForTests(t0);
		assert.ok(aMid > 0 && aMid < a);
		setFootprintCorrectionFlashClockForTests(1_000_350);
		assert.equal(r.getCorrectionFlashOverlayAlphaForTests(t0), 0);
	});

	it('does not start flash when prefers-reduced-motion is reduce', () => {
		const t0 = 1700000001 as UTCTimestamp;
		const prev = globalThis.window;
		(globalThis as { window?: unknown }).window = {
			matchMedia: (q: string) => ({
				matches: q.includes('prefers-reduced-motion') && q.includes('reduce'),
				media: q,
				addEventListener: () => {},
				removeEventListener: () => {},
			}),
		};
		try {
			const r = new FootprintRenderer();
			const opts: HoneycombSeriesOptions = { ...baseOpts, correctionFlash: 'subtle' };
			setFootprintCorrectionFlashClockForTests(2_000_000);
			r.update(pane([enriched(t0, 50, 1)]), opts);
			r.update(pane([enriched(t0, 51, 2)]), opts);
			assert.equal(r.getCorrectionFlashOverlayAlphaForTests(t0), 0);
		} finally {
			if (prev === undefined) {
				delete (globalThis as { window?: unknown }).window;
			} else {
				(globalThis as { window: unknown }).window = prev;
			}
		}
	});

	it('draw path runs with subtle flash after bump (fake time hook)', () => {
		const t0 = 1700000002 as UTCTimestamp;
		const ctx = mockCtx();
		let flashRects = 0;
		const orig = ctx.fillRect.bind(ctx);
		ctx.fillRect = ((x: number, y: number, w: number, h: number) => {
			if (typeof ctx.fillStyle === 'string' && ctx.fillStyle.includes('255, 204, 128')) {
				flashRects++;
			}
			orig(x, y, w, h);
		}) as typeof ctx.fillRect;

		const r = new FootprintRenderer();
		const opts: HoneycombSeriesOptions = { ...baseOpts, correctionFlash: 'subtle' };
		setFootprintCorrectionFlashClockForTests(5_000_000);
		r.update(pane([enriched(t0, 50, 1)]), opts);
		r.update(pane([enriched(t0, 55, 2)]), opts);
		r.draw(mockCanvasTarget(ctx), priceToCoord, false);
		assert.ok(flashRects >= 1);
	});
});
