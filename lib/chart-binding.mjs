/**
 * Wires a compiled honeycomb layout onto a Lightweight Charts `IChartApi` custom series.
 * Injects **`@honeycomb/charts`** from the host (browser bundle or `import()` of `dist/index.js`) so this package stays decoupled from `lightweight-charts` at install time.
 * @module honeycomb/lib/chart-binding
 */
import { attachViewportSegmentProfile } from '../packages/core/dist/index.js';
import { mapSegmentPlanToGenericPartial } from './adapter-generic.mjs';
import { compileLayoutCatalog } from './compiler-core.mjs';
import { CompileLayoutError } from './errors.mjs';
import { applyMutationBatch } from './mutation.mjs';
import { resolveSegmentProfileLayoutId } from './segment-profile.mjs';
import { validateSegmentPlan } from './validate-segment-plan.mjs';

/**
 * @typedef {{ readonly revision?: number; readonly ops: ReadonlyArray<import('./mutation.mjs').MutationOp> }} MutationBatchBody
 */

/**
 * @typedef {{
 *   GenericFootprintSeries: new () => unknown;
 *   defaultGenericFootprintSeriesOptions: Record<string, unknown>;
 *   mergeGenericFootprintSeriesOptions: (base: Record<string, unknown>, partial: Record<string, unknown>) => Record<string, unknown>;
 * }} HoneycombChartsModule
 */

/**
 * @param {unknown} chart
 * @returns {chart is { addCustomSeries: (series: unknown, options: Record<string, unknown>) => unknown }}
 */
function isChartWithCustomSeries(chart) {
	return Boolean(
		chart &&
			typeof chart === 'object' &&
			typeof /** @type {{ addCustomSeries?: unknown }} */ (chart).addCustomSeries === 'function'
	);
}

/**
 * @param {unknown} bar
 * @returns {bar is Record<string, unknown>}
 */
function isMutableBarShape(bar) {
	if (!bar || typeof bar !== 'object' || Array.isArray(bar)) {
		return false;
	}
	const b = /** @type {Record<string, unknown>} */ (bar);
	if (typeof b.open !== 'number' || typeof b.high !== 'number' || typeof b.low !== 'number' || typeof b.close !== 'number') {
		return false;
	}
	return Array.isArray(b.levels);
}

/**
 * @param {unknown} seriesHandle
 * @returns {unknown[]}
 */
function extractSeriesData(seriesHandle) {
	if (
		seriesHandle &&
		typeof seriesHandle === 'object' &&
		typeof /** @type {{ data?: unknown }} */ (seriesHandle).data === 'function'
	) {
		const d = /** @type {{ data: () => unknown }} */ (seriesHandle).data();
		return Array.isArray(d) ? d : [];
	}
	return [];
}

/**
 * @param {readonly unknown[]} data
 * @param {number | string} candleId
 */
function findBarIndexByCandleId(data, candleId) {
	for (let i = 0; i < data.length; i++) {
		const row = data[i];
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			continue;
		}
		const b = /** @type {Record<string, unknown>} */ (row);
		if (b.time !== undefined && b.time === candleId) {
			return i;
		}
		if (b.id !== undefined && b.id === candleId) {
			return i;
		}
	}
	return -1;
}

/**
 * @param {unknown} series
 * @returns {series is { data: () => unknown[]; update: (bar: unknown) => void; setData?: (bars: unknown[]) => void }}
 */
function isSeriesWithDataAndUpdate(series) {
	return Boolean(
		series &&
			typeof series === 'object' &&
			typeof /** @type {{ data?: unknown }} */ (series).data === 'function' &&
			typeof /** @type {{ update?: unknown }} */ (series).update === 'function'
	);
}

/**
 * @param {unknown} hc
 * @returns {hc is HoneycombChartsModule}
 */
function isHoneycombChartsModule(hc) {
	if (!hc || typeof hc !== 'object') {
		return false;
	}
	const o = /** @type {Record<string, unknown>} */ (hc);
	return (
		typeof o.GenericFootprintSeries === 'function' &&
		typeof o.mergeGenericFootprintSeriesOptions === 'function' &&
		typeof o.defaultGenericFootprintSeriesOptions === 'object' &&
		o.defaultGenericFootprintSeriesOptions !== null
	);
}

/**
 * @param {unknown} chart
 * @returns {chart is { removeSeries: (series: unknown) => void }}
 */
function isChartWithRemoveSeries(chart) {
	return Boolean(
		chart &&
			typeof chart === 'object' &&
			typeof /** @type {{ removeSeries?: unknown }} */ (chart).removeSeries === 'function'
	);
}

/**
 * @param {unknown} compiled result of {@link compileLayoutCatalog}
 * @param {string} layoutId
 * @returns {import('./segment-profile.mjs').SegmentProfileSelector | null}
 */
function profileSelectorFromCompiledLayout(compiled, layoutId) {
	const layouts = /** @type {{ layouts?: unknown[] }} */ (compiled).layouts;
	if (!Array.isArray(layouts)) {
		return null;
	}
	const L = layouts.find(l => l && typeof l === 'object' && /** @type {{ id?: string }} */ (l).id === layoutId);
	if (!L || typeof L !== 'object') {
		return null;
	}
	const sp = /** @type {{ segmentPlan?: Record<string, unknown> }} */ (L).segmentPlan;
	if (!sp || typeof sp !== 'object') {
		return null;
	}
	const ps = sp.profileSelector;
	if (!ps || typeof ps !== 'object' || !Array.isArray(/** @type {{ rules?: unknown }} */ (ps).rules)) {
		return null;
	}
	return /** @type {import('./segment-profile.mjs').SegmentProfileSelector} */ (ps);
}

/**
 * @param {unknown} compiled result of {@link compileLayoutCatalog}
 * @param {string} layoutId
 * @returns {{ segmentPlanVersion: number; hasColumnOverlays: boolean; hasProfileSelector: boolean } | null}
 */
function segmentPlanMetaFromCompiledLayout(compiled, layoutId) {
	const layouts = /** @type {{ layouts?: unknown[] }} */ (compiled).layouts;
	if (!Array.isArray(layouts)) {
		return null;
	}
	const L = layouts.find(l => l && typeof l === 'object' && /** @type {{ id?: string }} */ (l).id === layoutId);
	if (!L || typeof L !== 'object') {
		return null;
	}
	const sp = /** @type {{ segmentPlan?: Record<string, unknown> }} */ (L).segmentPlan;
	if (!sp || typeof sp !== 'object') {
		return null;
	}
	const versionRaw = sp.segmentPlanVersion;
	const segmentPlanVersion = versionRaw === 2 ? 2 : 1;
	const hasProfileSelector = Boolean(sp.profileSelector && typeof sp.profileSelector === 'object');

	let hasColumnOverlays = false;
	const cols = sp.columns;
	if (Array.isArray(cols)) {
		hasColumnOverlays = cols.some(c => c && typeof c === 'object' && Array.isArray(/** @type {{ overlays?: unknown }} */ (c).overlays) && /** @type {{ overlays?: unknown[] }} */ (c).overlays.length > 0);
	} else {
		const leftCols = sp.left && typeof sp.left === 'object' && Array.isArray(/** @type {{ columns?: unknown }} */ (sp.left).columns)
			? /** @type {unknown[]} */ (/** @type {{ columns?: unknown[] }} */ (sp.left).columns)
			: [];
		const rightCols = sp.right && typeof sp.right === 'object' && Array.isArray(/** @type {{ columns?: unknown }} */ (sp.right).columns)
			? /** @type {unknown[]} */ (/** @type {{ columns?: unknown[] }} */ (sp.right).columns)
			: [];
		hasColumnOverlays = [...leftCols, ...rightCols].some(
			c => c && typeof c === 'object' && Array.isArray(/** @type {{ overlays?: unknown }} */ (c).overlays) && /** @type {{ overlays?: unknown[] }} */ (c).overlays.length > 0
		);
	}
	return { segmentPlanVersion, hasColumnOverlays, hasProfileSelector };
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
	return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

/**
 * Merges layout-derived partial, then optional host overrides (e.g. `priceFormat`), preserving `mergeGenericFootprintSeriesOptions` theme deep-merge.
 * @param {HoneycombChartsModule} hc
 * @param {Record<string, unknown>} layoutPartial from {@link mapSegmentPlanToGenericPartial}
 * @param {unknown} [userSeriesOptions]
 */
function mergeGenericFootprintOptsFromLayout(hc, layoutPartial, userSeriesOptions) {
	const base = /** @type {Record<string, unknown>} */ (hc.defaultGenericFootprintSeriesOptions);
	const fromLayout = hc.mergeGenericFootprintSeriesOptions(base, layoutPartial);
	if (userSeriesOptions === undefined || userSeriesOptions === null) {
		return fromLayout;
	}
	if (!isPlainObject(userSeriesOptions)) {
		throw new CompileLayoutError(
			'CHART_BINDING_INVALID',
			'userSeriesOptions must be a plain object when provided (e.g. priceFormat from lightweight-charts)',
			{}
		);
	}
	return hc.mergeGenericFootprintSeriesOptions(fromLayout, userSeriesOptions);
}

/**
 * Compiles **`catalog`**, finds **`layoutId`**, validates the segment plan, merges options, and calls **`chart.addCustomSeries`**.
 *
 * @param {unknown} chart Lightweight Charts chart (`addCustomSeries`)
 * @param {string} layoutId
 * @param {unknown} catalog honeycomb `config.json` root
 * @param {HoneycombChartsModule} hc imported **`@honeycomb/charts`** module object
 * @param {Record<string, unknown>} [userSeriesOptions] optional LWC custom-series fields merged **after** the layout (e.g. `{ priceFormat: { type: 'price', precision: 3, minMove: 0.001 } }`)
 * @returns {unknown} return value of `chart.addCustomSeries` (series handle)
 */
export function addHoneycombLayoutSeries(chart, layoutId, catalog, hc, userSeriesOptions) {
	if (typeof layoutId !== 'string' || !layoutId.trim()) {
		throw new CompileLayoutError('LAYOUT_ID_INVALID', 'layoutId must be a non-empty string', {});
	}
	if (!isChartWithCustomSeries(chart)) {
		throw new CompileLayoutError('CHART_BINDING_INVALID', 'chart.addCustomSeries must be a function', {});
	}
	if (!isHoneycombChartsModule(hc)) {
		throw new CompileLayoutError(
			'CHART_BINDING_INVALID',
			'@honeycomb/charts module must expose GenericFootprintSeries, mergeGenericFootprintSeriesOptions, defaultGenericFootprintSeriesOptions',
			{}
		);
	}

	const compiled = compileLayoutCatalog(catalog);
	const L = compiled.layouts.find(l => l.id === layoutId);
	if (!L) {
		throw new CompileLayoutError('LAYOUT_NOT_FOUND', `No layout with id: ${layoutId}`, { layoutId });
	}

	const plan = /** @type {Record<string, unknown>} */ (L.segmentPlan);

	if (L.engine === 'genericFootprint') {
		validateSegmentPlan(plan, 'genericFootprint');
		const themes = catalog && typeof catalog === 'object' && 'themes' in catalog ? /** @type {Record<string, unknown>} */ (catalog).themes : {};
		const themeRef = plan.themeRef;
		const theme =
			typeof themeRef === 'string' &&
			themeRef.length > 0 &&
			themes &&
			typeof themes === 'object' &&
			!Array.isArray(themes) &&
			themes[themeRef] &&
			typeof themes[themeRef] === 'object' &&
			!Array.isArray(themes[themeRef])
				? /** @type {Record<string, unknown>} */ (themes[themeRef])
				: undefined;
		const partial = mapSegmentPlanToGenericPartial(plan, theme ? { theme } : {});
		const opts = mergeGenericFootprintOptsFromLayout(hc, partial, userSeriesOptions);
		return chart.addCustomSeries(new hc.GenericFootprintSeries(), opts);
	}

	throw new CompileLayoutError('ENGINE_UNKNOWN', `Unsupported engine: ${String(L.engine)}`, { layoutId });
}

/**
 * @deprecated Prefer {@link addHoneycombLayoutSeries}. Kept for backlog naming (CT-R04).
 * @param {unknown} chart
 * @param {string} layoutId
 * @param {unknown} catalog
 * @param {HoneycombChartsModule} hc
 * @returns {unknown}
 */
export function createFootprintSeriesFromLayout(chart, layoutId, catalog, hc, userSeriesOptions) {
	return addHoneycombLayoutSeries(chart, layoutId, catalog, hc, userSeriesOptions);
}

/**
 * Stateful binding: one active layout series, revision map for mutations, and **`swapLayout`** (CT-P1-11).
 * Optional **segment profile** (CT-P2-11): when `initialLayoutId`’s compiled `segmentPlan.profileSelector` exists,
 * the binding keeps that selector and uses **`onViewportWidthCss`** + hysteresis to call **`swapLayout`** toward the rule’s `layoutId`s.
 *
 * @param {unknown} chart
 * @param {unknown} catalog
 * @param {HoneycombChartsModule} hc
 * @param {string} initialLayoutId layout id (often a profile **host** row that declares `segmentProfileRef`)
 * @param {{
 *   initialViewportWidthCss?: number;
 *   userSeriesOptions?: Record<string, unknown>;
 *   viewportSegmentProfile?: {
 *     container: HTMLElement;
 *     getRelayoutData?: () => unknown[];
 *     onViewportSignal?: (payload: unknown) => void;
 *     nominalPxPerBar?: number;
 *     densityClamp?: { min: number; max: number };
 *     preset?: 'default' | 'dense';
 *     profileRules?: ReadonlyArray<{ minWidthPx: number; layoutId: string }>;
 *     scheduleInitialReconcile?: boolean;
 *   };
 * }} [bindingOptions] initial chart/container width in CSS px for first profile resolution; optional `userSeriesOptions` forwarded to every `addHoneycombLayoutSeries` (e.g. `priceFormat`). **`viewportSegmentProfile`** attaches `@honeycomb/charts` viewport scaling + optional double-rAF reconcile (default on).
 */
export function createHoneycombChartBinding(chart, catalog, hc, initialLayoutId, bindingOptions = {}) {
	if (typeof initialLayoutId !== 'string' || !initialLayoutId.trim()) {
		throw new CompileLayoutError('LAYOUT_ID_INVALID', 'initialLayoutId must be a non-empty string', {});
	}
	if (!isChartWithCustomSeries(chart)) {
		throw new CompileLayoutError('CHART_BINDING_INVALID', 'chart.addCustomSeries must be a function', {});
	}
	if (!isHoneycombChartsModule(hc)) {
		throw new CompileLayoutError(
			'CHART_BINDING_INVALID',
			'@honeycomb/charts module must expose GenericFootprintSeries, mergeGenericFootprintSeriesOptions, defaultGenericFootprintSeriesOptions',
			{}
		);
	}
	if (!isChartWithRemoveSeries(chart)) {
		throw new CompileLayoutError(
			'CHART_BINDING_INVALID',
			'chart.removeSeries must be a function (required for swapLayout)',
			{}
		);
	}

	const userSeriesOptions =
		bindingOptions.userSeriesOptions !== undefined ? bindingOptions.userSeriesOptions : undefined;
	if (userSeriesOptions !== undefined && !isPlainObject(userSeriesOptions)) {
		throw new CompileLayoutError(
			'CHART_BINDING_INVALID',
			'bindingOptions.userSeriesOptions must be a plain object when provided',
			{}
		);
	}

	const viewportSegmentProfileOpt = bindingOptions.viewportSegmentProfile;

	const compiled = compileLayoutCatalog(catalog);
	const profileSelectorCached = profileSelectorFromCompiledLayout(compiled, initialLayoutId);
	const profileHostLayoutId = profileSelectorCached ? initialLayoutId : null;

	if (viewportSegmentProfileOpt !== undefined) {
		if (!isPlainObject(viewportSegmentProfileOpt)) {
			throw new CompileLayoutError(
				'CHART_BINDING_INVALID',
				'bindingOptions.viewportSegmentProfile must be a plain object when provided',
				{}
			);
		}
		if (!profileSelectorCached) {
			throw new CompileLayoutError(
				'CHART_BINDING_INVALID',
				'bindingOptions.viewportSegmentProfile requires initialLayoutId to reference a segment profile (segmentProfileRef)',
				{}
			);
		}
		const ctr = viewportSegmentProfileOpt.container;
		if (!ctr || typeof ctr !== 'object' || typeof ctr.clientWidth !== 'number') {
			throw new CompileLayoutError(
				'CHART_BINDING_INVALID',
				'viewportSegmentProfile.container must be a DOM element with clientWidth',
				{}
			);
		}
	}

	/** @type {{ lastCommittedLayoutId: string | null; lastWidthPx: number | null }} */
	let profileState = { lastCommittedLayoutId: null, lastWidthPx: null };

	let layoutId = initialLayoutId;
	if (profileSelectorCached) {
		const w0 =
			typeof bindingOptions.initialViewportWidthCss === 'number' && Number.isFinite(bindingOptions.initialViewportWidthCss)
				? bindingOptions.initialViewportWidthCss
				: 0;
		const r0 = resolveSegmentProfileLayoutId(w0, profileSelectorCached, profileState);
		profileState = {
			lastCommittedLayoutId: r0.lastCommittedLayoutId,
			lastWidthPx: r0.lastWidthPx,
		};
		layoutId = r0.layoutId;
	}

	/** @type {unknown} */
	let series = addHoneycombLayoutSeries(chart, layoutId, catalog, hc, userSeriesOptions);
	let segmentPlanMeta = segmentPlanMetaFromCompiledLayout(compiled, layoutId) ?? {
		segmentPlanVersion: 1,
		hasColumnOverlays: false,
		hasProfileSelector: false,
	};
	const lastRevisionByCandleId = new Map();
	/** @type {unknown[]} */
	let relayoutDataSnapshot = [];
	/** @type {Set<() => void>} */
	const layoutSwapListeners = new Set();

	function swapLayoutInternal(nextLayoutId) {
		if (typeof nextLayoutId !== 'string' || !nextLayoutId.trim()) {
			throw new CompileLayoutError('LAYOUT_ID_INVALID', 'layoutId must be a non-empty string', {});
		}
		const captured = extractSeriesData(series);
		if (captured.length > 0) {
			relayoutDataSnapshot = captured;
		}
		for (const listener of layoutSwapListeners) {
			listener();
		}
		chart.removeSeries(series);
		lastRevisionByCandleId.clear();
		layoutId = nextLayoutId;
		segmentPlanMeta = segmentPlanMetaFromCompiledLayout(compiled, nextLayoutId) ?? {
			segmentPlanVersion: 1,
			hasColumnOverlays: false,
			hasProfileSelector: false,
		};
		series = addHoneycombLayoutSeries(chart, nextLayoutId, catalog, hc, userSeriesOptions);
		return series;
	}

	const binding = {
		get layoutId() {
			return layoutId;
		},
		get series() {
			return series;
		},
		get lastRevisionByCandleId() {
			return lastRevisionByCandleId;
		},
		get profileHostLayoutId() {
			return profileHostLayoutId;
		},
		get segmentPlanVersion() {
			return segmentPlanMeta.segmentPlanVersion;
		},
		get hasColumnOverlays() {
			return segmentPlanMeta.hasColumnOverlays;
		},
		get hasProfileSelector() {
			return segmentPlanMeta.hasProfileSelector;
		},
		/**
		 * @param {number | string} candleId
		 * @param {MutationBatchBody} batch
		 * @param {{ strictRevision?: boolean; mode?: 'update' | 'setData' }} [ctx]
		 */
		applyMutationToBar(candleId, batch, ctx = {}) {
			return applyMutationToSeries(series, candleId, batch, { ...ctx, lastRevisionByCandleId });
		},
		/**
		 * @param {string} nextLayoutId
		 * @returns {unknown} new series handle
		 */
		swapLayout(nextLayoutId) {
			return swapLayoutInternal(nextLayoutId);
		},
		/**
		 * Series data for viewport relayout after autoswitch. Returns the current series data when non-empty,
		 * otherwise the snapshot captured before the last layout swap.
		 *
		 * @returns {unknown[]}
		 */
		getRelayoutData() {
			const current = extractSeriesData(series);
			return current.length > 0 ? current : relayoutDataSnapshot;
		},
		/**
		 * Register a callback invoked before each layout swap (e.g. mutation scheduler `clear()`).
		 *
		 * @param {() => void} listener
		 * @returns {() => void} unsubscribe
		 */
		onLayoutSwap(listener) {
			if (typeof listener !== 'function') {
				throw new CompileLayoutError('CHART_BINDING_INVALID', 'onLayoutSwap listener must be a function', {});
			}
			layoutSwapListeners.add(listener);
			return () => layoutSwapListeners.delete(listener);
		},
		/**
		 * Re-evaluates **`segmentPlan.profileSelector`** from the profile host layout (if any) and swaps when the resolved `layoutId` changes.
		 *
		 * @param {number} widthCss chart or pane width in CSS pixels
		 * @returns {string | null} new layout id when a swap occurred; otherwise `null`
		 */
		onViewportWidthCss(widthCss) {
			if (!profileSelectorCached) {
				return null;
			}
			if (typeof widthCss !== 'number' || !Number.isFinite(widthCss)) {
				throw new CompileLayoutError('CHART_BINDING_INVALID', 'onViewportWidthCss expects a finite number (CSS px)', {});
			}
			const out = resolveSegmentProfileLayoutId(widthCss, profileSelectorCached, profileState);
			profileState = {
				lastCommittedLayoutId: out.lastCommittedLayoutId,
				lastWidthPx: out.lastWidthPx,
			};
			if (out.layoutId !== layoutId) {
				swapLayoutInternal(out.layoutId);
				return out.layoutId;
			}
			return null;
		},
	};

	const catalogRecord = /** @type {Record<string, unknown>} */ (catalog);
	/** @type {{ detach: () => void; reconcileNow: () => void } | null} */
	let viewportHandle = null;
	if (viewportSegmentProfileOpt !== undefined) {
		const vp = viewportSegmentProfileOpt;
		viewportHandle = attachViewportSegmentProfile({
			chart,
			container: vp.container,
			catalog: catalogRecord,
			binding,
			getRelayoutData: vp.getRelayoutData,
			onViewportSignal: vp.onViewportSignal,
			nominalPxPerBar: vp.nominalPxPerBar,
			densityClamp: vp.densityClamp,
			preset: vp.preset,
			profileRules: vp.profileRules,
			scheduleInitialReconcile: vp.scheduleInitialReconcile !== false,
		});
		binding.detachViewport = () => {
			if (viewportHandle) {
				viewportHandle.detach();
				viewportHandle = null;
			}
		};
		Object.defineProperty(binding, 'viewport', {
			get() {
				return viewportHandle;
			},
			enumerable: true,
			configurable: true,
		});
	}

	return binding;
}

/**
 * Applies RFC-0002 ops to one bar in **`series`**, then **`series.update`** (default) or **`series.setData`**
 * (full-array replace) per [memo G0.3](../docs/engineering/memo-lwc-partial-bar-update.md).
 *
 * @param {unknown} series Lightweight Charts custom series API (`data`, `update`; optional `setData`)
 * @param {number | string} candleId Bar key: matches **`time`**, else **`id`** when present
 * @param {MutationBatchBody} batch
 * @param {{
 *   lastRevisionByCandleId?: Map<number | string, number>;
 *   strictRevision?: boolean;
 *   mode?: 'update' | 'setData';
 * }} [ctx]
 * @returns {{ applied: true } | { applied: false; reason: 'stale_revision' }}
 */
export function applyMutationToSeries(series, candleId, batch, ctx = {}) {
	if (!isSeriesWithDataAndUpdate(series)) {
		throw new CompileLayoutError(
			'CHART_BINDING_INVALID',
			'series must expose synchronous data() and update(bar)',
			{}
		);
	}
	if (!batch || typeof batch !== 'object' || !Array.isArray(batch.ops)) {
		throw new CompileLayoutError('MUTATION_INVALID_VALUE', 'batch.ops must be an array', {});
	}

	const data = series.data();
	if (!Array.isArray(data)) {
		throw new CompileLayoutError('CHART_BINDING_INVALID', 'series.data() must return an array', {});
	}

	const idx = findBarIndexByCandleId(data, candleId);
	if (idx < 0) {
		throw new CompileLayoutError('MUTATION_BAR_NOT_FOUND', `No bar for candleId ${String(candleId)}`, {});
	}

	const raw = data[idx];
	if (!isMutableBarShape(raw)) {
		throw new CompileLayoutError('CHART_BINDING_INVALID', 'Cannot mutate whitespace or non-OHLC bar', {});
	}

	const working = /** @type {Record<string, unknown>} */ (structuredClone(raw));
	const fullBatch = /** @type {import('./mutation.mjs').MutationBatch} */ ({
		candleId,
		revision: batch.revision,
		ops: batch.ops,
	});

	const out = applyMutationBatch(working, fullBatch, {
		lastRevisionByCandleId: ctx.lastRevisionByCandleId,
		strictRevision: ctx.strictRevision,
	});
	if (!out.applied) {
		return { applied: false, reason: out.reason };
	}

	const mode = ctx.mode ?? 'update';
	const isLastBar = idx === data.length - 1;
	// Lightweight Charts `update()` only mutates the trailing bar; earlier bars need setData.
	const useSetData = mode === 'setData' || !isLastBar;
	if (useSetData) {
		if (typeof series.setData !== 'function') {
			throw new CompileLayoutError('CHART_BINDING_INVALID', 'series.setData is required when mode is setData', {});
		}
		const copy = data.slice();
		copy[idx] = out.bar;
		series.setData(copy);
	} else {
		series.update(out.bar);
	}

	return { applied: true };
}
