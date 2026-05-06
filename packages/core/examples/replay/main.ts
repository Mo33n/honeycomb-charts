import { createChart } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';

import {
	clampFootprintReplayPlayhead,
	defaultHoneycombSeriesOptions,
	deriveFootprintReplayDomain,
	filterEnrichedCandlesAtOrBeforePlayhead,
	HoneycombSeries,
	type EnrichedCandle,
} from 'honeycomb-charts';

/** Full session kept off-screen; only a slice is passed to `setData` (see `docs/replay-mode-v2.md`). */
const REPLAY_BAR_COUNT = 24;
const BASE = 1_710_000_000 as UTCTimestamp;
const FULL: EnrichedCandle<UTCTimestamp>[] = [];
for (let i = 0; i < REPLAY_BAR_COUNT; i++) {
	FULL.push({
		time: (BASE + i * 60) as UTCTimestamp,
		open: 100 + i * 0.1,
		high: 101 + i * 0.1,
		low: 99 + i * 0.1,
		close: 100.5 + i * 0.1,
		levels: [
			{ price: 100, values: { bid: 5 + i, ask: 3, delta: 2 } },
			{ price: 101, values: { bid: 1, ask: 2, delta: -1 } },
		],
	});
}

const domain = deriveFootprintReplayDomain(FULL);
if (domain === null) {
	throw new Error('replay fixture empty');
}

const sortedTimes = [...FULL.map(b => b.time)].sort((a, b) => a - b);

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

const countEl = document.querySelector('[data-testid="replay-visible-count"]');
const rangeEl = document.getElementById('playhead') as HTMLInputElement | null;
if (!countEl || !rangeEl) {
	throw new Error('replay toolbar missing');
}

function applyPlayheadIndex(idx: number): void {
	const i = Math.max(0, Math.min(sortedTimes.length - 1, idx));
	const raw = sortedTimes[i]!;
	const playhead = clampFootprintReplayPlayhead(raw, domain);
	const visible = filterEnrichedCandlesAtOrBeforePlayhead(FULL, playhead);
	series.setData(visible);
	countEl.textContent = String(visible.length);
	chart.timeScale().fitContent();
}

rangeEl.addEventListener('input', () => {
	applyPlayheadIndex(Number.parseInt(rangeEl.value, 10));
});

applyPlayheadIndex(Number.parseInt(rangeEl.value, 10));
