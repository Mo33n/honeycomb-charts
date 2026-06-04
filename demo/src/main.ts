import type { UTCTimestamp } from 'lightweight-charts';
import { CrosshairMode, createChart } from 'lightweight-charts';

import * as hc from '@honeycomb/charts';
import { sanitizeEnrichedCandle } from '@honeycomb/charts';

import { addHoneycombLayoutSeries } from '@honeycomb/lib/chart-binding.mjs';
import { applyDataMapping, dataMappingFromDataContract } from '@honeycomb/lib/data-mapping.mjs';

import catalog from '../../config.json' with { type: 'json' };
import sampleDoc from '../../SampleData.json' with { type: 'json' };
import { userGenericSeriesOptions } from './user-generic-series-options.js';

type SampleBar = {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
	volume_delta?: number;
	footprint_levels: Array<Record<string, number>>;
};

function toEnrichedCandles(raw: { data: SampleBar[] }, mapping: ReturnType<typeof dataMappingFromDataContract>) {
	return raw.data.map(bar => {
		const b = applyDataMapping(bar, mapping) as Record<string, unknown>;
		const levelsIn = b.footprint_levels;
		if (!Array.isArray(levelsIn)) {
			throw new Error('Expected footprint_levels array');
		}
		const levels = levelsIn.map(row => {
			if (!row || typeof row !== 'object') {
				throw new Error('Invalid level row');
			}
			const { price, ...rest } = row as Record<string, number> & { price: number };
			if (typeof price !== 'number' || !Number.isFinite(price)) {
				throw new Error('Invalid level price');
			}
			return { price, values: { ...rest } };
		});
		const { candle } = sanitizeEnrichedCandle({
			time: b.time as UTCTimestamp,
			open: b.open as number,
			high: b.high as number,
			low: b.low as number,
			close: b.close as number,
			levels,
		});
		return candle;
	});
}

const el = document.getElementById('chart');
const meta = document.getElementById('meta');
if (!el || !meta) {
	throw new Error('#chart / #meta missing');
}

const params = new URLSearchParams(window.location.search);
const layoutFromUrl = params.get('layout');
const validLayoutIds = new Set(
	Array.isArray(catalog.layouts) ? catalog.layouts.map(l => (l && typeof l.id === 'string' ? l.id : '')) : []
);
if (typeof catalog.defaultLayoutId !== 'string' || !catalog.defaultLayoutId) {
	throw new Error('config.defaultLayoutId must be set');
}
const defaultLayoutId = catalog.defaultLayoutId;
const layoutId =
	layoutFromUrl && validLayoutIds.has(layoutFromUrl)
		? layoutFromUrl
		: defaultLayoutId;

const chart = createChart(el, {
	autoSize: true,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
	rightPriceScale: { borderVisible: false },
	timeScale: {
		borderVisible: false,
		barSpacing: 8,
		minBarSpacing: 3,
	},
	grid: { vertLines: { visible: false }, horzLines: { visible: false } },
	crosshair: { mode: CrosshairMode.Normal },
});

const series = addHoneycombLayoutSeries(chart, layoutId, catalog, hc, userGenericSeriesOptions);

const mapping = dataMappingFromDataContract(
	catalog.dataContract as { aliases?: Record<string, string> } | undefined
);
series.setData(toEnrichedCandles(sampleDoc as { data: SampleBar[] }, mapping));
chart.timeScale().fitContent();

const layoutSource =
	layoutFromUrl && validLayoutIds.has(layoutFromUrl) ? 'url' : 'config.defaultLayoutId';
meta.textContent =
	`Layout: ${layoutId} (${layoutSource}) · ${sampleDoc.data.length} bars (SampleData.json) · ` +
	'compile + @honeycomb/charts build required (see README).';

window.addEventListener(
	'beforeunload',
	() => {
		chart.remove();
	},
	{ once: true }
);
