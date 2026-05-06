import { CrosshairMode, createChart, type UTCTimestamp } from 'lightweight-charts';

import type { ViewportSegmentProfileSignalPayload } from '@honeycomb/charts';
import * as hc from '@honeycomb/charts';

import { createHoneycombChartBinding } from '@honeycomb/lib/chart-binding.mjs';
import { applyDataMapping, dataMappingFromDataContract } from '@honeycomb/lib/data-mapping.mjs';

import catalog from '../../config.json' with { type: 'json' };
import sampleDoc from '../../SampleData.json' with { type: 'json' };
import { userGenericSeriesOptions } from './user-generic-series-options.js';

/** Must match `config.json` layout id + `segmentProfiles.demo_autoswitch_profile`. */
const PROFILE_HOST_LAYOUT_ID = 'demo_autoswitch_host';

/** Autoswitch demo: catalog defines segment profile + host row; binding opts attach viewport scaling. */

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
			return { price, values: { ...rest } };
		});
		return {
			time: b.time as UTCTimestamp,
			open: b.open as number,
			high: b.high as number,
			low: b.low as number,
			close: b.close as number,
			levels,
		};
	});
}

const el = document.getElementById('chart');
const meta = document.getElementById('meta');
if (!el || !meta) {
	throw new Error('#chart / #meta missing');
}

const workingCatalog = catalog as Record<string, unknown>;

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

const mapping = dataMappingFromDataContract(
	(workingCatalog.dataContract as { aliases?: Record<string, string> } | undefined) ?? undefined
);
const enriched = toEnrichedCandles(sampleDoc as { data: SampleBar[] }, mapping);

const binding = createHoneycombChartBinding(chart, workingCatalog, hc, PROFILE_HOST_LAYOUT_ID, {
	initialViewportWidthCss: el.clientWidth,
	userSeriesOptions: userGenericSeriesOptions,
	viewportSegmentProfile: {
		container: el,
		getRelayoutData: () => enriched,
		onViewportSignal: (p: ViewportSegmentProfileSignalPayload) => {
			meta.textContent = `Autoswitch: ${p.layoutId} · selector ${Math.round(p.selectorWidthCss)}px · zoom ${Math.round(p.rawEffectiveWidthCss)}px · ${sampleDoc.data.length} bars`;
		},
	},
});

binding.series.setData(enriched);
chart.timeScale().fitContent();

meta.textContent = `Autoswitch layout: ${binding.layoutId} · width=${el.clientWidth}px · ${sampleDoc.data.length} bars`;

window.addEventListener(
	'beforeunload',
	() => {
		binding.detachViewport?.();
	},
	{ once: true }
);
