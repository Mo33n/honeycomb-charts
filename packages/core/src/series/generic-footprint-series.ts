import type {
	CustomSeriesWhitespaceData,
	CustomSeriesPricePlotValues,
	ICustomSeriesPaneView,
	PaneRendererCustomData,
	Time,
} from 'lightweight-charts';

import {
	defaultGenericFootprintSeriesOptions,
	type GenericFootprintSeriesOptions,
} from '../options/generic-footprint-series-options.js';
import { GenericFootprintRenderer } from '../render/generic-footprint-renderer.js';
import type { EnrichedCandle } from '../schema/types.js';

function isEnrichedCandle(d: unknown): d is EnrichedCandle<Time> {
	if (typeof d !== 'object' || d === null) {
		return false;
	}
	const open = (d as { open?: unknown }).open;
	return typeof open === 'number';
}

/**
 * Lightweight Charts custom series: declarative **histogram / number / ratio** slots
 * over {@link EnrichedCandle} levels (`vol`, `delta`, …), plus a mini OHLC strip per bar.
 */
export class GenericFootprintSeries implements ICustomSeriesPaneView<Time, EnrichedCandle<Time>, GenericFootprintSeriesOptions> {
	private readonly _renderer = new GenericFootprintRenderer();

	public priceValueBuilder(plotRow: EnrichedCandle<Time>): CustomSeriesPricePlotValues {
		return [plotRow.high, plotRow.low, plotRow.close];
	}

	public isWhitespace(data: EnrichedCandle<Time> | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
		return !isEnrichedCandle(data);
	}

	public renderer(): GenericFootprintRenderer {
		return this._renderer;
	}

	public update(data: PaneRendererCustomData<Time, EnrichedCandle<Time>>, options: GenericFootprintSeriesOptions): void {
		this._renderer.update(data, options);
	}

	public defaultOptions(): GenericFootprintSeriesOptions {
		return defaultGenericFootprintSeriesOptions;
	}

	public destroy(): void {
		this._renderer.clearRendererState();
	}
}
