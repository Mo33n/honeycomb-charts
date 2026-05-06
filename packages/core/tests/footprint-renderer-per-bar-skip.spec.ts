/**
 * HC1-012: `FootprintRenderer` with `barMetricScope === 'perBar'` skips canvas paint when the
 * bar’s footprint fingerprint matches the previous frame (same viewport / spacing signature).
 *
 * **Measurement:** `TextMeasureCache` LRU **miss** counter via `getTextMeasureMissCountForTests`
 * (increments only when `ctx.measureText` runs). After `resetTextMeasureDiagnosticsForTests`, a
 * second identical draw should record **zero** new misses (all bars skipped); a draw where only
 * the last bar’s values change should record **fewer** misses than the initial cold draw.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { BitmapCoordinatesRenderingScope } from 'fancy-canvas';
import type { PaneRendererCustomData, PriceToCoordinateConverter, UTCTimestamp } from 'lightweight-charts';

import { FootprintRenderer } from '../src/render/footprint-renderer.js';
import { defaultHoneycombSeriesOptions } from '../src/options/footprint-series-options.js';
import type { EnrichedCandle } from '../src/schema/types.js';
import type { HoneycombSeriesOptions } from '../src/options/footprint-series-options.js';

function enriched(time: UTCTimestamp, bid: number): EnrichedCandle<UTCTimestamp> {
	return {
		time,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		revision: 1,
		levels: [{ price: 100, values: { bid, ask: 30, delta: bid - 30 } }],
	};
}

function pane(
	bars: readonly EnrichedCandle<UTCTimestamp>[]
): PaneRendererCustomData<UTCTimestamp, EnrichedCandle<UTCTimestamp>> {
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

const opts: HoneycombSeriesOptions = {
	...defaultHoneycombSeriesOptions,
	barMetricScope: 'perBar',
	bodyVisible: false,
	wicksVisible: false,
};

const priceToCoord: PriceToCoordinateConverter = (p: number) => 350 - p * 2.2;

describe('FootprintRenderer perBar skip (HC1-012)', () => {
	it('skips measureText on a second identical draw; partial change remeasures only affected bar', () => {
		const t0 = 1700000000 as UTCTimestamp;
		const t1 = 1700003600 as UTCTimestamp;
		const d0 = pane([enriched(t0, 50), enriched(t1, 20)]);
		const d1 = pane([enriched(t0, 50), enriched(t1, 88)]);

		const ctx = mockCtx();
		const target = mockCanvasTarget(ctx);
		const r = new FootprintRenderer();

		r.update(d0, opts);
		r.resetTextMeasureDiagnosticsForTests();
		r.draw(target, priceToCoord, false);
		const cold = r.getTextMeasureMissCountForTests();

		r.update(d0, opts);
		r.resetTextMeasureDiagnosticsForTests();
		r.draw(target, priceToCoord, false);
		const identicalRepeat = r.getTextMeasureMissCountForTests();

		r.update(d1, opts);
		r.resetTextMeasureDiagnosticsForTests();
		r.draw(target, priceToCoord, false);
		const afterPartial = r.getTextMeasureMissCountForTests();

		assert.ok(cold > 0, 'first draw should miss LRU for number cells');
		assert.equal(identicalRepeat, 0, 'identical frame should skip all bars → no measureText');
		assert.ok(afterPartial > 0, 'changed last bar should redraw number cells');
		assert.ok(afterPartial < cold, 'partial update should measure fewer cells than full cold draw');
	});
});
