import { createChart } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';

import { HoneycombSeries, defaultHoneycombSeriesOptions, type EnrichedCandle } from 'honeycomb-charts';

const el = document.getElementById('chart');
if (!el) {
	throw new Error('#chart missing');
}

const mirror =
	typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mirror') === '1';

const chart = createChart(el, {
	autoSize: true,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
});

const series = chart.addCustomSeries(new HoneycombSeries(), {
	...defaultHoneycombSeriesOptions,
	layoutDirection: mirror ? 'mirrorSegments' : 'ltr',
	priceLineVisible: false,
});

/** 24 footprint bars (60s apart) so the default demo shows a full strip of candles. */
const BASE = 1_710_000_000 as UTCTimestamp;
const bars: EnrichedCandle<UTCTimestamp>[] = [];
for (let i = 0; i < 24; i++) {
	bars.push({
		time: (BASE + i * 60) as UTCTimestamp,
		open: 100 + i * 0.05,
		high: 101 + i * 0.05,
		low: 99 + i * 0.05,
		close: 100.5 + i * 0.05,
		levels: [
			{ price: 100, values: { bid: 20 + i, ask: 15, delta: 5 } },
			{ price: 101, values: { bid: 5, ask: 10 + i, delta: -5 } },
		],
	});
}

series.setData(bars);
chart.timeScale().fitContent();
