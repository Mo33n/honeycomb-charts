import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { CrosshairMode, createChart } from 'lightweight-charts';

import * as hc from '@honeycomb/charts';

import { createHoneycombChartBinding } from '@honeycomb/lib/chart-binding.mjs';
import { applyDataMapping, dataMappingFromDataContract } from '@honeycomb/lib/data-mapping.mjs';

import catalog from '../../config.json' with { type: 'json' };
import sampleDoc from '../../SampleData.json' with { type: 'json' };
import { userGenericSeriesOptions } from './user-generic-series-options.js';
import { segmentProfileSelectorWidth } from './segment-profile-selector-width.js';

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

type SegmentProfileRule = { minWidthPx: number; layoutId: string };
type SegmentProfile = { hysteresisPx: number; rules: SegmentProfileRule[] };
type LayoutLike = { id: string };

type AutoswitchHandle = { detach: () => void; reconcileNow: () => void };

type ViewportSignalPayload = {
	selectorWidthCss: number;
	rawEffectiveWidthCss: number;
	uncappedProfileWidthCss: number;
	perBarPx: number | null;
	layoutId: string;
};

const PROFILE_ID = 'demo_autoswitch_profile';
const PROFILE_HOST_LAYOUT_ID = 'demo_autoswitch_host';

const AUTOSWITCH_RULE_SPECS: readonly { minWidthPx: number; layoutId: string }[] = [
	{ minWidthPx: 1000, layoutId: 'pro_max_custom' },
	{ minWidthPx: 620, layoutId: 'desk_candle_vol_profile' },
	{ minWidthPx: 0, layoutId: 'desk_candle_only' },
];

/** Smallest positive `minWidthPx` in the profile — first step above the base tier; per-bar scale aligns to this. */
function smallestPositiveProfileBreakpointPx(rules: readonly { minWidthPx: number }[]): number {
	const positives = rules.map(r => r.minWidthPx).filter(w => typeof w === 'number' && Number.isFinite(w) && w > 0);
	return positives.length > 0 ? Math.min(...positives) : 1;
}

const DETAIL_TIER_MIN_WIDTH_PX = smallestPositiveProfileBreakpointPx(AUTOSWITCH_RULE_SPECS);

const NOMINAL_PX_PER_BAR_FOR_DETAIL = 22;

function sumTrackWeightsForLayout(catalog: Record<string, unknown>, layoutId: string): number {
	const layouts = catalog.layouts;
	if (!Array.isArray(layouts)) {
		return 1;
	}
	const row = layouts.find(
		(l: unknown) => l && typeof l === 'object' && (l as { id?: string }).id === layoutId
	) as { segment?: { trackWeights?: unknown } } | undefined;
	const w = row?.segment?.trackWeights;
	if (!Array.isArray(w) || w.length === 0) {
		return 1;
	}
	let sum = 0;
	for (const x of w) {
		if (typeof x === 'number' && Number.isFinite(x) && x > 0) {
			sum += x;
		}
	}
	return Math.max(1, sum);
}

function medianProfileTrackWeight(catalog: Record<string, unknown>): number {
	const sums = AUTOSWITCH_RULE_SPECS.map(r => sumTrackWeightsForLayout(catalog, r.layoutId)).sort((a, b) => a - b);
	return Math.max(1, sums[Math.floor(sums.length / 2)] ?? 1);
}

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

function collectExistingLayoutIds(layouts: unknown): Set<string> {
	if (!Array.isArray(layouts)) {
		return new Set();
	}
	const out = new Set<string>();
	for (const l of layouts) {
		if (l && typeof l === 'object' && typeof (l as LayoutLike).id === 'string') {
			out.add((l as LayoutLike).id);
		}
	}
	return out;
}

function buildAutoswitchCatalog(baseCatalog: unknown): Record<string, unknown> {
	const cloned = structuredClone(baseCatalog) as Record<string, unknown>;
	const layouts = Array.isArray(cloned.layouts) ? [...cloned.layouts] : [];
	const existingIds = collectExistingLayoutIds(layouts);

	const rules: SegmentProfileRule[] = AUTOSWITCH_RULE_SPECS.filter(r => existingIds.has(r.layoutId));
	if (rules.length === 0) {
		throw new Error('Autoswitch demo: no profile rule target layout ids exist in config.layouts');
	}

	const segmentProfiles =
		cloned.segmentProfiles && typeof cloned.segmentProfiles === 'object' && !Array.isArray(cloned.segmentProfiles)
			? { ...(cloned.segmentProfiles as Record<string, unknown>) }
			: {};
	segmentProfiles[PROFILE_ID] = {
		hysteresisPx: 24,
		rules,
	} satisfies SegmentProfile;
	cloned.segmentProfiles = segmentProfiles;

	const hostLayout = {
		id: PROFILE_HOST_LAYOUT_ID,
		label: 'Demo — autoswitch profile host',
		description: 'Host-only row for segment profile based layout switching.',
		engine: 'genericFootprint',
		segmentProfileRef: PROFILE_ID,
		segment: {
			chrome: { showPriceGrid: false, histogramShowValues: false },
			tracks: [{ role: 'candle' }],
			trackWeights: [],
		},
	};

	const hostIndex = layouts.findIndex(l => l && typeof l === 'object' && (l as LayoutLike).id === PROFILE_HOST_LAYOUT_ID);
	if (hostIndex >= 0) {
		layouts[hostIndex] = hostLayout;
	} else {
		layouts.unshift(hostLayout);
	}
	cloned.layouts = layouts;
	cloned.defaultLayoutId = PROFILE_HOST_LAYOUT_ID;
	return cloned;
}

function installAutoswitch(
	binding: ReturnType<typeof createHoneycombChartBinding>,
	chart: IChartApi,
	container: HTMLElement,
	catalog: Record<string, unknown>,
	enriched: ReturnType<typeof toEnrichedCandles>,
	onViewportSignal?: (p: ViewportSignalPayload) => void
): AutoswitchHandle {
	let rafPending = false;
	let baselineVisibleSpan: number | null = null;

	const getVisibleSpan = (): number | null => {
		const r = chart.timeScale().getVisibleLogicalRange();
		if (!r || typeof r.from !== 'number' || typeof r.to !== 'number') {
			return null;
		}
		const span = Math.max(1, r.to - r.from);
		return Number.isFinite(span) ? span : null;
	};

	/** `clientWidth` × baseline-relative density (clamped); zoom out → smaller px for segment tiers. */
	const zoomEffectiveWidthCss = (): number => {
		const widthCss = Math.max(1, container.clientWidth);
		const visibleSpan = getVisibleSpan();
		if (visibleSpan === null) {
			return widthCss;
		}
		if (baselineVisibleSpan === null) {
			baselineVisibleSpan = visibleSpan;
			return widthCss;
		}
		const densityFactor = Math.min(4, Math.max(0.25, baselineVisibleSpan / visibleSpan));
		return Math.max(1, widthCss * densityFactor);
	};

	const refWeight = medianProfileTrackWeight(catalog);

	const reconcileBySignal = (): void => {
		const widthCss = Math.max(1, container.clientWidth);
		const visibleSpan = getVisibleSpan();
		const rawEffective = zoomEffectiveWidthCss();
		const scaled = segmentProfileSelectorWidth({
			zoomEffectiveWidthPx: rawEffective,
			referenceComplexity: refWeight,
			layoutComplexity: sumTrackWeightsForLayout(catalog, binding.layoutId),
			chartWidthPx: widthCss,
			visibleLogicalSpan: visibleSpan,
			detailTierMinWidthPx: DETAIL_TIER_MIN_WIDTH_PX,
			nominalPxPerBar: NOMINAL_PX_PER_BAR_FOR_DETAIL,
		});
		const next = binding.onViewportWidthCss(scaled.selectorWidthCss);
		onViewportSignal?.({
			selectorWidthCss: scaled.selectorWidthCss,
			rawEffectiveWidthCss: rawEffective,
			uncappedProfileWidthCss: scaled.uncappedProfileWidthCss,
			perBarPx: scaled.perBarPx,
			layoutId: binding.layoutId,
		});
		if (next !== null) {
			binding.series.setData(enriched);
		}
	};

	const schedule = (): void => {
		if (rafPending) {
			return;
		}
		rafPending = true;
		requestAnimationFrame(() => {
			rafPending = false;
			reconcileBySignal();
		});
	};

	const ro = new ResizeObserver(() => schedule());
	ro.observe(container);

	const onVisibleRange = (): void => schedule();
	chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRange);

	return {
		detach: () => {
			ro.disconnect();
			chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRange);
		},
		/** Run one reconciliation (e.g. after `fitContent` once the time scale has a logical range). */
		reconcileNow: () => schedule(),
	};
}

const el = document.getElementById('chart');
const meta = document.getElementById('meta');
if (!el || !meta) {
	throw new Error('#chart / #meta missing');
}

const workingCatalog = buildAutoswitchCatalog(catalog);
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

const binding = createHoneycombChartBinding(chart, workingCatalog, hc, PROFILE_HOST_LAYOUT_ID, {
	initialViewportWidthCss: el.clientWidth,
	userSeriesOptions: userGenericSeriesOptions,
});
const mapping = dataMappingFromDataContract(
	(workingCatalog.dataContract as { aliases?: Record<string, string> } | undefined) ?? undefined
);
const enriched = toEnrichedCandles(sampleDoc as { data: SampleBar[] }, mapping);
binding.series.setData(enriched);
chart.timeScale().fitContent();

function formatAutoswitchMeta(catalog: Record<string, unknown>, p: ViewportSignalPayload, chartWidthPx: number, barCount: number): string {
	const weightSum = sumTrackWeightsForLayout(catalog, p.layoutId);
	const perBar = p.perBarPx !== null ? ` · perBar≈${p.perBarPx.toFixed(1)}px` : '';
	const uncapped =
		Math.round(p.uncappedProfileWidthCss) !== Math.round(p.selectorWidthCss)
			? ` · uncapped=${Math.round(p.uncappedProfileWidthCss)}px`
			: '';
	return `Autoswitch layout: ${p.layoutId} · width=${chartWidthPx}px · zoomEffective=${Math.round(p.rawEffectiveWidthCss)}px · selectorWidth=${Math.round(p.selectorWidthCss)}px${uncapped}${perBar} (Σweights=${weightSum.toFixed(2)}) · ${barCount} bars`;
}

meta.textContent = `Autoswitch layout: ${binding.layoutId} · width=${el.clientWidth}px · ${sampleDoc.data.length} bars`;

const autoswitch = installAutoswitch(binding, chart, el, workingCatalog, enriched, p =>
	meta.textContent = formatAutoswitchMeta(workingCatalog, p, el.clientWidth, sampleDoc.data.length)
);
/* Double rAF: first paint after setData/fitContent so `getVisibleLogicalRange` is stable. */
requestAnimationFrame(() => {
	requestAnimationFrame(() => autoswitch.reconcileNow());
});
window.addEventListener(
	'beforeunload',
	() => {
		autoswitch.detach();
	},
	{ once: true }
);
