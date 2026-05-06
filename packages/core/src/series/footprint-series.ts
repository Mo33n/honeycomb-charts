import type {
	CustomSeriesWhitespaceData,
	CustomSeriesPricePlotValues,
	ICustomSeriesPaneView,
	PaneRendererCustomData,
	Time,
} from 'lightweight-charts';

import { defaultHoneycombSeriesOptions, type HoneycombSeriesOptions } from '../options/footprint-series-options.js';
import { FootprintRenderer } from '../render/footprint-renderer.js';
import type { EnrichedCandle } from '../schema/types.js';

function isEnrichedCandle(d: unknown): d is EnrichedCandle<Time> {
	if (typeof d !== 'object' || d === null) {
		return false;
	}
	const open = (d as { open?: unknown }).open;
	return typeof open === 'number';
}

export class HoneycombSeries implements ICustomSeriesPaneView<Time, EnrichedCandle<Time>, HoneycombSeriesOptions> {
	private readonly _renderer = new FootprintRenderer();
	private readonly _lastRevisionByTime = new Map<unknown, number>();

	public priceValueBuilder(plotRow: EnrichedCandle<Time>): CustomSeriesPricePlotValues {
		return [plotRow.high, plotRow.low, plotRow.close];
	}

	public isWhitespace(data: EnrichedCandle<Time> | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
		return !isEnrichedCandle(data);
	}

	public renderer(): FootprintRenderer {
		return this._renderer;
	}

	public update(data: PaneRendererCustomData<Time, EnrichedCandle<Time>>, options: HoneycombSeriesOptions): void {
		const onRevision = options.onRevision;
		const vr = data.visibleRange;
		if (onRevision !== undefined && vr !== null) {
			for (let i = vr.from; i < vr.to; i++) {
				const bar = data.bars[i];
				if (bar === undefined) {
					continue;
				}
				const d = bar.originalData;
				if (!isEnrichedCandle(d) || d.revision === undefined) {
					continue;
				}
				const t = d.time;
				const prev = this._lastRevisionByTime.get(t);
				if (prev !== undefined && d.revision <= prev) {
					continue;
				}
				this._lastRevisionByTime.set(t, d.revision);
				onRevision({ time: t, revision: d.revision, previousRevision: prev });
			}
		}
		this._renderer.update(data, options);
	}

	public defaultOptions(): HoneycombSeriesOptions {
		return defaultHoneycombSeriesOptions;
	}

	public destroy(): void {
		this._lastRevisionByTime.clear();
		this._renderer.clearPerBarLayoutCache();
	}
}

