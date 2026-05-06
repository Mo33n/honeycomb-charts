import { createChart } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';

import {
	HoneycombSeries,
	defaultHoneycombSeriesOptions,
	FootprintSeriesBinding,
	FootprintDataAdapter,
} from 'honeycomb-charts';

const el = document.getElementById('chart');
if (!el) {
	throw new Error('#chart missing');
}

const chart = createChart(el, {
	autoSize: true,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
});

const series = chart.addCustomSeries(new HoneycombSeries(), {
	...defaultHoneycombSeriesOptions,
	priceLineVisible: false,
});

const seedTime = 1710000000 as UTCTimestamp;
series.setData([
	{
		time: seedTime,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		levels: [{ price: 100, values: { bid: 1, ask: 1, delta: 0 } }],
	},
]);

const binding = new FootprintSeriesBinding(
	new FootprintDataAdapter({
		barKey: t => Math.floor(t.time / 60_000) * 60_000,
		maxUpdatesPerSecond: 120,
	})
);

let revision = 1;
binding.startRafFlush((bucket, ticks) => {
	void bucket;
	if (ticks.length === 0) {
		return;
	}
	const bid = ticks.reduce((s, t) => s + (t.size ?? 1), 0);
	series.update({
		time: seedTime,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		revision: revision++,
		levels: [{ price: 100, values: { bid, ask: 1, delta: bid - 1 } }],
	});
});

for (let i = 0; i < 8; i++) {
	binding.adapter.pushTick({ time: seedTime + i, price: 100, size: 2 });
}

chart.timeScale().fitContent();

window.addEventListener('beforeunload', () => {
	binding.destroy();
});
