import type { IChartApi } from 'lightweight-charts';

import {
	medianProfileTrackWeightFromRules,
	smallestPositiveProfileBreakpointPx,
	sumTrackWeightsForLayout,
	type SegmentProfileRuleRow,
} from './catalog-layout-complexity.js';
import { segmentProfileRulesForHostLayout } from './raw-catalog-segment-profile.js';
import { segmentProfileSelectorWidth } from './segment-profile-selector-width.js';
import { resolveViewportSegmentProfilePreset, type ViewportSegmentProfilePresetId } from './viewport-segment-profile-presets.js';
import { zoomEffectiveWidthPx, type DensityClamp, type ZoomBaselineState } from './zoom-effective-width.js';

/** Binding shape from {@link createHoneycombChartBinding} (chart-binding host). */
export type ViewportSegmentProfileBinding = {
	readonly layoutId: string;
	readonly profileHostLayoutId: string | null;
	onViewportWidthCss(widthCss: number): string | null;
	readonly series: { setData(data: unknown[]): void; data?: () => unknown[] };
	/** Host-provided snapshot after layout swap (see chart-binding). */
	getRelayoutData?: () => unknown[];
};

export type ViewportSegmentProfileSignalPayload = {
	selectorWidthCss: number;
	rawEffectiveWidthCss: number;
	uncappedProfileWidthCss: number;
	perBarPx: number | null;
	layoutId: string;
};

export type AttachViewportSegmentProfileOptions = {
	chart: IChartApi;
	container: HTMLElement;
	catalog: Record<string, unknown>;
	binding: ViewportSegmentProfileBinding;
	/**
	 * Data reapplied after layout swap (`setData`). Defaults to `binding.getRelayoutData()` when set,
	 * otherwise reads from the current series.
	 */
	getRelayoutData?: () => unknown[];
	onViewportSignal?: (payload: ViewportSegmentProfileSignalPayload) => void;
	/** Default 22 — px/bar at which per-bar synthetic width hits the first positive profile breakpoint. */
	nominalPxPerBar?: number;
	densityClamp?: DensityClamp;
	/**
	 * Shorthand for `nominalPxPerBar` + `densityClamp` — ignored when those are set explicitly.
	 * @default 'default'
	 */
	preset?: ViewportSegmentProfilePresetId;
	/** When set, runs one reconciliation after the next frame(s) (double `rAF` in browsers) so `fitContent` can settle. @default false */
	scheduleInitialReconcile?: boolean;
	/** When set, skips reading rules from `catalog` via host layout’s `segmentProfileRef`. */
	profileRules?: readonly SegmentProfileRuleRow[];
};

export type ViewportSegmentProfileHandle = {
	detach: () => void;
	reconcileNow: () => void;
};

function seriesDataOrEmpty(series: ViewportSegmentProfileBinding['series']): unknown[] {
	if (typeof series.data === 'function') {
		const d = series.data();
		return Array.isArray(d) ? d : [];
	}
	return [];
}

function resolveRelayoutData(
	binding: ViewportSegmentProfileBinding,
	override?: () => unknown[]
): () => unknown[] {
	if (override !== undefined) {
		return override;
	}
	if (typeof binding.getRelayoutData === 'function') {
		return () => binding.getRelayoutData!();
	}
	return () => seriesDataOrEmpty(binding.series);
}

/**
 * Subscribes to resize + visible logical range, computes selector width (zoom × complexity × per-bar floor),
 * drives `binding.onViewportWidthCss`, and reapplies data after swap.
 */
export function attachViewportSegmentProfile(options: AttachViewportSegmentProfileOptions): ViewportSegmentProfileHandle {
	const {
		chart,
		container,
		catalog,
		binding,
		onViewportSignal,
		profileRules: profileRulesOverride,
		scheduleInitialReconcile = false,
	} = options;

	const fromPreset = resolveViewportSegmentProfilePreset(options.preset);
	const nominalPxPerBar = options.nominalPxPerBar ?? fromPreset.nominalPxPerBar;
	const densityClamp = options.densityClamp ?? fromPreset.densityClamp;

	const getRelayoutData = resolveRelayoutData(binding, options.getRelayoutData);

	const rules: SegmentProfileRuleRow[] | null =
		profileRulesOverride && profileRulesOverride.length > 0
			? [...profileRulesOverride]
			: binding.profileHostLayoutId !== null
				? segmentProfileRulesForHostLayout(catalog, binding.profileHostLayoutId)
				: null;

	if (!rules || rules.length === 0) {
		throw new Error(
			'attachViewportSegmentProfile: no segment profile rules (set binding.profileHostLayoutId + catalog.segmentProfiles, or pass profileRules)'
		);
	}

	const refWeight = medianProfileTrackWeightFromRules(catalog, rules);
	const detailTierMinWidthPx = smallestPositiveProfileBreakpointPx(rules);

	let rafPending = false;
	let rafId: number | null = null;
	let detached = false;
	const baselineState: ZoomBaselineState = { baselineVisibleSpan: null };

	const getVisibleSpan = (): number | null => {
		const r = chart.timeScale().getVisibleLogicalRange();
		if (!r || typeof r.from !== 'number' || typeof r.to !== 'number') {
			return null;
		}
		const span = Math.max(1, r.to - r.from);
		return Number.isFinite(span) ? span : null;
	};

	const reconcileBySignal = (): void => {
		if (detached) {
			return;
		}
		const widthCss = Math.max(1, container.clientWidth);
		const visibleSpan = getVisibleSpan();
		const rawEffective = zoomEffectiveWidthPx(widthCss, visibleSpan, baselineState, densityClamp);
		const scaled = segmentProfileSelectorWidth({
			zoomEffectiveWidthPx: rawEffective,
			referenceComplexity: refWeight,
			layoutComplexity: sumTrackWeightsForLayout(catalog, binding.layoutId),
			chartWidthPx: widthCss,
			visibleLogicalSpan: visibleSpan,
			detailTierMinWidthPx,
			nominalPxPerBar,
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
			baselineState.baselineVisibleSpan = null;
			binding.series.setData(getRelayoutData());
		}
	};

	const schedule = (): void => {
		if (detached || rafPending || typeof requestAnimationFrame !== 'function') {
			return;
		}
		rafPending = true;
		rafId = requestAnimationFrame(() => {
			rafPending = false;
			rafId = null;
			reconcileBySignal();
		});
	};

	const cancelPendingRaf = (): void => {
		if (rafId !== null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(rafId);
		}
		rafId = null;
		rafPending = false;
	};

	const ro = new ResizeObserver(() => schedule());
	ro.observe(container);

	const onVisibleRange = (): void => schedule();
	chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRange);

	const handle: ViewportSegmentProfileHandle = {
		detach: () => {
			detached = true;
			cancelPendingRaf();
			ro.disconnect();
			chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRange);
		},
		reconcileNow: () => {
			if (detached) {
				return;
			}
			cancelPendingRaf();
			reconcileBySignal();
		},
	};

	if (scheduleInitialReconcile) {
		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => handle.reconcileNow());
			});
		} else {
			handle.reconcileNow();
		}
	}

	return handle;
}
