import { createChart } from 'lightweight-charts';

import {
	defaultHoneycombSeriesOptions,
	HoneycombSeries,
	mergeHoneycombSeriesOptions,
} from 'honeycomb-charts';

import {
	defaultStaticDatasetChartDisplayConfig,
	selectVisibleEnrichedCandles,
	type StaticDatasetChartDisplayConfig,
} from './chart-display-config.js';
import { STATIC_ENRICHED_CANDLE_POOL } from './static-enriched-candles.js';

function configFromQuery(): StaticDatasetChartDisplayConfig {
	const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
	const barsRaw = params.get('bars');
	const sliceRaw = params.get('slice');
	const parsedBars = barsRaw !== null ? Number.parseInt(barsRaw, 10) : Number.NaN;
	const sliceOk = sliceRaw === 'first' || sliceRaw === 'last' ? sliceRaw : undefined;
	return {
		...defaultStaticDatasetChartDisplayConfig,
		...(Number.isFinite(parsedBars) && parsedBars >= 1
			? { visibleBarCount: Math.min(Math.floor(parsedBars), STATIC_ENRICHED_CANDLE_POOL.length) }
			: {}),
		...(sliceOk !== undefined ? { sliceMode: sliceOk } : {}),
	};
}

const displayConfig = configFromQuery();
const visible = selectVisibleEnrichedCandles(STATIC_ENRICHED_CANDLE_POOL, displayConfig);

const meta = document.getElementById('meta');
if (meta) {
	meta.textContent = `Showing ${visible.length} / ${STATIC_ENRICHED_CANDLE_POOL.length} bars — slice=${displayConfig.sliceMode} (edit chart-display-config.ts or use ?bars=20&slice=last)`;
}

const legend = document.getElementById('legend');
if (legend) {
	legend.innerHTML = [
		'<strong>What you are seeing</strong>',
		'<span class="chip chip-num" title="Left: bid with left-growing volume strip; hot bid gets outline">bid</span> ·',
		'<span class="chip chip-num" title="Left: ask with right-growing strip; hot ask highlighted">ask</span> ·',
		'<span class="chip chip-delta" title="Right segment: bar uses green/red by sign per library defaults">delta</span> (right, bar · green/red by sign) ·',
		'<span class="chip chip-candle" title="OHLC candle chrome">candle</span> body + wicks.',
		'<span style="opacity:0.88"> Readability: default <code>minFontPx</code>/<code>minCellHeightPx</code> are raised in <code>chart-display-config.ts</code>; shrink <code>visibleBarCount</code> if you need larger glyphs.</span>',
	].join(' ');
}

const el = document.getElementById('chart');
if (!el) {
	throw new Error('#chart missing');
}

const chart = createChart(el, {
	autoSize: true,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
});

const seriesOptions = mergeHoneycombSeriesOptions(
	defaultHoneycombSeriesOptions,
	displayConfig.seriesOptionsPatch ?? {}
);

const series = chart.addCustomSeries(new HoneycombSeries(), seriesOptions);
series.setData(visible);
chart.timeScale().fitContent();
