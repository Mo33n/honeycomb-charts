/**
 * Pure catalog → compile artifacts (no fs). See RFC-0001.
 * @module honeycomb/lib/compiler-core
 */
import { CompileLayoutError } from './errors.mjs';

export const RENDER_PLAN_VERSION = '1.0.0';

/**
 * FNV-1a 32-bit digest so renderers can fold layout identity into skip-cache signatures (CT-P1-13).
 *
 * @param {string} layoutId
 * @param {'genericFootprint' | 'footprint'} engine
 * @returns {number} unsigned 32-bit integer
 */
export function segmentLayoutRevision(layoutId, engine) {
	let h = 2166136261 >>> 0;
	const str = `${String(engine)}\n${String(layoutId)}`;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
}

const ALLOWED_GENERIC_ROLES = new Set(['histogram', 'number', 'ratio', 'heatmapCell', 'bar', 'candle']);
const ALLOWED_FOOTPRINT_KINDS = new Set(['number', 'bar']);

function deepMerge(a, b) {
	if (b === null || b === undefined) {
		return a;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		return b;
	}
	if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && !Array.isArray(b)) {
		const o = { ...a };
		for (const k of Object.keys(b)) {
			o[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
		}
		return o;
	}
	return b;
}

function resolveTrack(templates, track, layoutId) {
	const { templateRef, ...rest } = track;
	if (templateRef === undefined) {
		return rest;
	}
	const tpl = templates[templateRef];
	if (tpl === undefined || typeof tpl !== 'object') {
		throw new CompileLayoutError('TEMPLATE_REF_UNKNOWN', `Unknown templateRef: ${String(templateRef)}`, {
			layoutId,
		});
	}
	const { description: _d, ...tplRest } = tpl;
	return deepMerge(tplRest, rest);
}

/**
 * @param {unknown} track
 * @param {string} layoutId
 * @param {number} index
 */
function assertGenericTrackRole(track, layoutId, index) {
	const role = track && track.role;
	if (!ALLOWED_GENERIC_ROLES.has(role)) {
		throw new CompileLayoutError(
			'UNKNOWN_GENERIC_ROLE',
			`track[${String(index)}]: unknown role ${String(role)} (allowed: histogram, number, ratio, heatmapCell, bar, candle)`,
			{ layoutId, trackIndex: index }
		);
	}
}

/**
 * @param {unknown[]} columns
 * @param {string} layoutId
 * @param {'left' | 'right'} side
 */
function assertFootprintColumnKinds(columns, layoutId, side) {
	if (!Array.isArray(columns)) {
		return;
	}
	for (let i = 0; i < columns.length; i++) {
		const col = columns[i];
		if (!isRecord(col)) {
			throw new CompileLayoutError('CATALOG_INVALID', `${side} column[${String(i)}] must be an object`, {
				layoutId,
			});
		}
		if (!ALLOWED_FOOTPRINT_KINDS.has(col.kind)) {
			throw new CompileLayoutError(
				'UNKNOWN_FOOTPRINT_KIND',
				`${side} column[${String(i)}]: unknown kind ${String(col.kind)} (allowed: number, bar)`,
				{ layoutId }
			);
		}
	}
}

/** @param {string[]} keys */
function sortUniqueStrings(keys) {
	return [...new Set(keys.filter(k => typeof k === 'string' && k.length > 0))].sort((a, b) =>
		a.localeCompare(b)
	);
}

/** @param {unknown} pred */
function collectMetricsFromPredicate(pred) {
	if (!isRecord(pred)) {
		return [];
	}
	const op = pred.op;
	if (op === 'cmp' && typeof pred.metric === 'string') {
		return [pred.metric.trim()].filter(Boolean);
	}
	if ((op === 'and' || op === 'or') && pred.a !== undefined && pred.b !== undefined) {
		return [...collectMetricsFromPredicate(pred.a), ...collectMetricsFromPredicate(pred.b)];
	}
	return [];
}

/**
 * @param {unknown} col raw footprint column (before strip)
 * @returns {string[]}
 */
function collectFootprintColumnDataKeys(col) {
	if (!isRecord(col)) {
		return [];
	}
	const keys = [effectiveFootprintColumnKey(col)];
	const nh = col.style?.numberHistogram;
	if (nh && typeof nh === 'object') {
		const sk = typeof nh.sourceBinding?.key === 'string' ? nh.sourceBinding.key.trim() : '';
		const sm = typeof nh.sourceMetricId === 'string' ? nh.sourceMetricId.trim() : '';
		if (sk && sm && sk !== sm) {
			throw new CompileLayoutError(
				'NUMBER_HISTOGRAM_STYLE',
				'style.numberHistogram: sourceBinding.key must match sourceMetricId when both set',
				{}
			);
		}
		const src = sk || sm;
		if (src) {
			keys.push(src);
		}
	}
	const rules = col.colorRules;
	if (Array.isArray(rules)) {
		for (const r of rules) {
			if (isRecord(r) && r.when !== undefined) {
				keys.push(...collectMetricsFromPredicate(r.when));
			}
		}
	}
	return keys;
}

/**
 * @param {unknown} side
 * @returns {string[]}
 */
function collectFootprintSideKeys(side) {
	if (!isRecord(side) || !Array.isArray(side.columns)) {
		return [];
	}
	const out = [];
	for (const col of side.columns) {
		out.push(...collectFootprintColumnDataKeys(col));
	}
	return out;
}

/**
 * @param {readonly { binding: { key: string }; denominatorBinding?: { key: string } }[]} planColumns
 * @param {Record<string, unknown>} lwcPartial
 * @param {unknown} segment
 */
function buildGenericRequiredKeys(planColumns, lwcPartial, segment) {
	const keys = new Set();
	for (const pc of planColumns) {
		if (pc.binding && typeof pc.binding.key === 'string') {
			keys.add(pc.binding.key);
		}
		if (pc.denominatorBinding && typeof pc.denominatorBinding.key === 'string') {
			keys.add(pc.denominatorBinding.key);
		}
		if (pc.weightBinding && typeof pc.weightBinding.key === 'string') {
			keys.add(pc.weightBinding.key.trim());
		}
		if (pc.secondaryBinding && typeof pc.secondaryBinding.key === 'string') {
			keys.add(pc.secondaryBinding.key.trim());
		}
	}
	const poc = segment.poc;
	if (isRecord(poc) && typeof poc.metricId === 'string') {
		keys.add(poc.metricId.trim());
	}
	if (typeof lwcPartial.pocMetricId === 'string') {
		keys.add(lwcPartial.pocMetricId.trim());
	}
	const header = lwcPartial.barHeaderLines;
	if (Array.isArray(header)) {
		for (const line of header) {
			if (isRecord(line) && typeof line.metricId === 'string') {
				keys.add(line.metricId.trim());
			}
		}
	}
	const footer = lwcPartial.barFooterLines;
	if (Array.isArray(footer)) {
		for (const line of footer) {
			if (isRecord(line) && typeof line.metricId === 'string') {
				keys.add(line.metricId.trim());
			}
		}
	}
	return sortUniqueStrings([...keys]);
}

/**
 * @param {unknown} segment
 */
function buildFootprintRequiredKeys(segment) {
	const keys = [];
	if (isRecord(segment.left)) {
		keys.push(...collectFootprintSideKeys(segment.left));
	}
	if (isRecord(segment.right)) {
		keys.push(...collectFootprintSideKeys(segment.right));
	}
	return sortUniqueStrings(keys);
}

function effectiveLevelKey(track, layoutId, index) {
	const b = track.binding;
	const bk = b && typeof b.key === 'string' ? b.key.trim() : '';
	const mk = typeof track.metricId === 'string' ? track.metricId.trim() : '';
	if (bk && mk && bk !== mk) {
		throw new CompileLayoutError(
			'BINDING_METRIC_MISMATCH',
			`track[${String(index)}]: binding.key (${bk}) must match metricId (${mk}) when both are set`,
			{ layoutId, trackIndex: index }
		);
	}
	const key = bk || mk;
	if (!key) {
		throw new CompileLayoutError(
			'TRACK_BINDING_MISSING',
			`track[${String(index)}]: set binding.key and/or metricId (same string)`,
			{ layoutId, trackIndex: index }
		);
	}
	return key;
}

function effectiveDenominatorKey(track, layoutId, index) {
	const db = track.denominatorBinding;
	const dk = db && typeof db.key === 'string' ? db.key.trim() : '';
	const rk = typeof track.ratioDenominatorId === 'string' ? track.ratioDenominatorId.trim() : '';
	if (dk && rk && dk !== rk) {
		throw new CompileLayoutError(
			'BINDING_DENOMINATOR_MISMATCH',
			`track[${String(index)}]: denominatorBinding.key (${dk}) must match ratioDenominatorId (${rk}) when both are set`,
			{ layoutId, trackIndex: index }
		);
	}
	const key = dk || rk;
	if (track.role === 'ratio' && !key) {
		throw new CompileLayoutError(
			'RATIO_DENOMINATOR_MISSING',
			`track[${String(index)}]: ratio requires denominatorBinding.key or ratioDenominatorId`,
			{ layoutId, trackIndex: index }
		);
	}
	return key;
}

function bindingScopeOrDefault(track, layoutId, index) {
	const s = track.binding?.scope;
	if (s === undefined || s === null) {
		return 'level';
	}
	if (s === 'level' || s === 'bar') {
		return s;
	}
	throw new CompileLayoutError(
		'BINDING_SCOPE_INVALID',
		`Invalid binding.scope: ${String(s)} (use "level" | "bar")`,
		{ layoutId, trackIndex: index }
	);
}

function genericTrackToSlotAndPlanColumn(track, layoutId, index, weight) {
	const role = track.role;
	const metricId = effectiveLevelKey(track, layoutId, index);
	const binding = {
		key: metricId,
		scope: bindingScopeOrDefault(track, layoutId, index),
	};

	const spacingPatch = {
		...(typeof track.insetLeftCss === 'number' && Number.isFinite(track.insetLeftCss) && track.insetLeftCss >= 0
			? { insetLeftCss: track.insetLeftCss }
			: {}),
		...(typeof track.insetRightCss === 'number' && Number.isFinite(track.insetRightCss) && track.insetRightCss >= 0
			? { insetRightCss: track.insetRightCss }
			: {}),
		...(typeof track.gapAfterCss === 'number' && Number.isFinite(track.gapAfterCss) && track.gapAfterCss >= 0
			? { gapAfterCss: track.gapAfterCss }
			: {}),
	};

	let slot;
	if (role === 'histogram') {
		const grow = track.grow;
		if (grow !== 'left' && grow !== 'right' && grow !== 'center') {
			throw new CompileLayoutError(
				'HISTOGRAM_GROW_INVALID',
				`track[${String(index)}]: histogram requires grow "left"|"right"|"center"`,
				{ layoutId, trackIndex: index }
			);
		}
		slot = {
			role: 'histogram',
			metricId,
			grow,
			...(track.histogramColor !== undefined ? { histogramColor: track.histogramColor } : {}),
			...(track.colorizeBySign === true ? { colorizeBySign: true } : {}),
			...(typeof track.histogramMaxFillFrac === 'number' && Number.isFinite(track.histogramMaxFillFrac)
				? { histogramMaxFillFrac: track.histogramMaxFillFrac }
				: {}),
			...(typeof track.histogramLengthGamma === 'number' && Number.isFinite(track.histogramLengthGamma)
				? { histogramLengthGamma: track.histogramLengthGamma }
				: {}),
			...spacingPatch,
		};
	} else if (role === 'number') {
		slot = {
			role: 'number',
			metricId,
			...(track.colorBySign === true ? { colorBySign: true } : {}),
			...(typeof track.cellBackground === 'string' ? { cellBackground: track.cellBackground } : {}),
			...spacingPatch,
		};
	} else if (role === 'heatmapCell') {
		const cm = track.colorMode;
		const colorMode =
			cm === 'sequential' || cm === 'diverging' || cm === 'valueSecondary' ? cm : undefined;
		const scaleRef = typeof track.scaleRef === 'string' && track.scaleRef.trim() ? track.scaleRef.trim() : undefined;
		const secRaw = typeof track.secondaryMetricId === 'string' ? track.secondaryMetricId.trim() : '';
		if (colorMode === 'valueSecondary' && secRaw === '') {
			throw new CompileLayoutError(
				'CATALOG_INVALID',
				`track[${String(index)}]: heatmapCell colorMode valueSecondary requires secondaryMetricId`,
				{ layoutId, trackIndex: index }
			);
		}
		slot = {
			role: 'heatmapCell',
			metricId,
			...(colorMode !== undefined ? { colorMode } : {}),
			...(typeof track.heatmapColor === 'string' && track.heatmapColor.trim()
				? { heatmapColor: track.heatmapColor.trim() }
				: {}),
			...(scaleRef !== undefined ? { scaleRef } : {}),
			...(secRaw !== '' ? { secondaryMetricId: secRaw } : {}),
			...spacingPatch,
		};
	} else if (role === 'bar') {
		slot = {
			role: 'bar',
			metricId,
			...(typeof track.barAlignMode === 'string' ? { barAlignMode: track.barAlignMode } : {}),
			...(typeof track.barPositiveColor === 'string' ? { barPositiveColor: track.barPositiveColor } : {}),
			...(typeof track.barNegativeColor === 'string' ? { barNegativeColor: track.barNegativeColor } : {}),
			...spacingPatch,
		};
	} else {
		const ratioDenominatorId = effectiveDenominatorKey(track, layoutId, index);
		slot = {
			role: 'ratio',
			metricId,
			ratioDenominatorId,
			...spacingPatch,
		};
	}

	const denominatorBinding =
		role === 'ratio'
			? { key: slot.ratioDenominatorId, scope: track.denominatorBinding?.scope === 'bar' ? 'bar' : 'level' }
			: null;

	/** @type {{ key: string; scope: string } | null} */
	let weightBinding = null;
	/** @type {{ key: string; scope: string } | null} */
	let secondaryBinding = null;
	if (role === 'heatmapCell') {
		const wb = track.weightBinding;
		if (isRecord(wb) && typeof wb.key === 'string' && wb.key.trim()) {
			weightBinding = { key: wb.key.trim(), scope: wb.scope === 'bar' ? 'bar' : 'level' };
		}
		if (typeof track.secondaryMetricId === 'string' && track.secondaryMetricId.trim()) {
			secondaryBinding = { key: track.secondaryMetricId.trim(), scope: 'level' };
		}
	}

	const extensions = {};
	if (track.presentation !== undefined && typeof track.presentation === 'object') {
		extensions.presentation = track.presentation;
	}
	if (typeof track.id === 'string') {
		extensions.columnId = track.id;
	}

	const overlays = normalizeCellOverlays(track.overlays, layoutId, `track[${String(index)}].overlays`);

	const planColumn = {
		order: index,
		binding,
		...(denominatorBinding ? { denominatorBinding } : {}),
		...(weightBinding ? { weightBinding } : {}),
		...(secondaryBinding ? { secondaryBinding } : {}),
		weight,
		lwcGenericFootprintSlot: slot,
		...(Object.keys(extensions).length ? { extensions } : {}),
		...(overlays ? { overlays } : {}),
	};

	return { slot, planColumn };
}

function stripFootprintColumnForPreset(col) {
	const metricId = effectiveFootprintColumnKey(col);
	const out = { ...col, metricId };
	delete out.binding;
	delete out.denominatorBinding;
	delete out.presentation;
	delete out.overlays;

	if (out.style && typeof out.style === 'object' && out.style.numberHistogram && typeof out.style.numberHistogram === 'object') {
		const nh = out.style.numberHistogram;
		const sk = typeof nh.sourceBinding?.key === 'string' ? nh.sourceBinding.key.trim() : '';
		const sm = typeof nh.sourceMetricId === 'string' ? nh.sourceMetricId.trim() : '';
		if (sk && sm && sk !== sm) {
			throw new CompileLayoutError(
				'NUMBER_HISTOGRAM_STYLE',
				'style.numberHistogram: sourceBinding.key must match sourceMetricId when both set',
				{}
			);
		}
		if (sk || sm || nh.sourceBinding !== undefined) {
			const sourceMetricId = sk || sm;
			if (!sourceMetricId) {
				throw new CompileLayoutError(
					'NUMBER_HISTOGRAM_STYLE',
					'style.numberHistogram: set sourceMetricId or sourceBinding.key',
					{}
				);
			}
			const { sourceBinding: _sb, ...nhRest } = nh;
			out.style = { ...out.style, numberHistogram: { ...nhRest, sourceMetricId } };
		}
	}
	return out;
}

function effectiveFootprintColumnKey(col) {
	const bk = col.binding && typeof col.binding.key === 'string' ? col.binding.key.trim() : '';
	const mk = typeof col.metricId === 'string' ? col.metricId.trim() : '';
	if (bk && mk && bk !== mk) {
		throw new CompileLayoutError(
			'FOOTPRINT_COLUMN_BINDING',
			`binding.key (${bk}) must match metricId (${mk}) when both set`,
			{}
		);
	}
	const key = bk || mk;
	if (!key) {
		throw new CompileLayoutError('FOOTPRINT_COLUMN_BINDING', 'set binding.key and/or metricId', {});
	}
	return key;
}

function footprintColumnBinding(col) {
	return {
		key: effectiveFootprintColumnKey(col),
		scope: col.binding?.scope === 'bar' ? 'bar' : 'level',
	};
}

function isRecord(x) {
	return typeof x === 'object' && x !== null;
}

/**
 * @param {unknown} raw
 * @param {string} layoutId
 * @param {string} contextPath
 * @returns {Array<{ id: string; kind: string; fill: string; opacity: number; zOrder: number }> | undefined}
 */
function normalizeCellOverlays(raw, layoutId, contextPath) {
	if (raw === undefined) {
		return undefined;
	}
	if (!Array.isArray(raw)) {
		throw new CompileLayoutError('OVERLAY_INVALID', `${contextPath}: overlays must be an array`, { layoutId });
	}
	if (raw.length === 0) {
		return undefined;
	}
	const out = [];
	for (let i = 0; i < raw.length; i++) {
		const o = raw[i];
		if (!isRecord(o)) {
			throw new CompileLayoutError('OVERLAY_INVALID', `${contextPath}[${String(i)}] must be an object`, { layoutId });
		}
		const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : '';
		if (!id || id.includes('|')) {
			throw new CompileLayoutError(
				'OVERLAY_INVALID',
				`${contextPath}[${String(i)}].id must be a non-empty string without '|'`,
				{ layoutId }
			);
		}
		const kind = o.kind;
		if (kind === 'cellBand') {
			const fill = typeof o.fill === 'string' && o.fill.trim() ? o.fill.trim() : '';
			if (!fill) {
				throw new CompileLayoutError(
					'OVERLAY_INVALID',
					`${contextPath}[${String(i)}] cellBand requires fill`,
					{ layoutId }
				);
			}
			let opacity = 1;
			if (o.opacity !== undefined) {
				if (typeof o.opacity !== 'number' || !Number.isFinite(o.opacity) || o.opacity < 0 || o.opacity > 1) {
					throw new CompileLayoutError(
						'OVERLAY_INVALID',
						`${contextPath}[${String(i)}].opacity must be a finite number in [0,1]`,
						{ layoutId }
					);
				}
				opacity = o.opacity;
			}
			let zOrder = 0;
			if (o.zOrder !== undefined) {
				if (typeof o.zOrder !== 'number' || !Number.isInteger(o.zOrder)) {
					throw new CompileLayoutError(
						'OVERLAY_INVALID',
						`${contextPath}[${String(i)}].zOrder must be an integer`,
						{ layoutId }
					);
				}
				zOrder = o.zOrder;
			}
			out.push({ id, kind: 'cellBand', fill, opacity, zOrder });
			continue;
		}
		throw new CompileLayoutError(
			'OVERLAY_KIND_UNKNOWN',
			`${contextPath}[${String(i)}]: unknown overlay kind ${String(kind)}`,
			{ layoutId }
		);
	}
	return out.slice().sort((a, b) => a.zOrder - b.zOrder);
}

/**
 * @param {Set<string>} validLayoutIds
 * @param {unknown} catalogProfiles
 * @param {string} ref
 * @param {string} layoutId
 * @returns {{ hysteresisPx: number; rules: { minWidthPx: number; layoutId: string }[] } | undefined}
 */
function normalizeProfileSelector(validLayoutIds, catalogProfiles, ref, layoutId) {
	if (ref === undefined) {
		return undefined;
	}
	if (typeof ref !== 'string' || !ref.trim()) {
		throw new CompileLayoutError('PROFILE_REF_INVALID', 'segmentProfileRef must be a non-empty string', { layoutId });
	}
	const key = ref.trim();
	const prof = catalogProfiles[key];
	if (!isRecord(prof)) {
		throw new CompileLayoutError('PROFILE_REF_UNKNOWN', `Unknown segmentProfileRef: ${key}`, { layoutId });
	}
	const rulesRaw = prof.rules;
	if (!Array.isArray(rulesRaw) || rulesRaw.length < 1) {
		throw new CompileLayoutError('PROFILE_RULES_INVALID', `segmentProfiles.${key}.rules must be a non-empty array`, {
			layoutId,
		});
	}
	let hysteresisPx = 4;
	if (prof.hysteresisPx !== undefined) {
		if (typeof prof.hysteresisPx !== 'number' || !Number.isFinite(prof.hysteresisPx) || prof.hysteresisPx < 0) {
			throw new CompileLayoutError(
				'PROFILE_RULES_INVALID',
				`segmentProfiles.${key}.hysteresisPx must be a non-negative finite number`,
				{ layoutId }
			);
		}
		hysteresisPx = prof.hysteresisPx;
	}
	const rules = [];
	for (let i = 0; i < rulesRaw.length; i++) {
		const r = rulesRaw[i];
		if (!isRecord(r)) {
			throw new CompileLayoutError('PROFILE_RULES_INVALID', `segmentProfiles.${key}.rules[${String(i)}] must be an object`, {
				layoutId,
			});
		}
		const minWidthPx = r.minWidthPx;
		if (typeof minWidthPx !== 'number' || !Number.isFinite(minWidthPx) || minWidthPx < 0) {
			throw new CompileLayoutError(
				'PROFILE_RULES_INVALID',
				`segmentProfiles.${key}.rules[${String(i)}].minWidthPx must be a non-negative finite number`,
				{ layoutId }
			);
		}
		const lid = typeof r.layoutId === 'string' && r.layoutId.trim() ? r.layoutId.trim() : '';
		if (!lid) {
			throw new CompileLayoutError(
				'PROFILE_RULES_INVALID',
				`segmentProfiles.${key}.rules[${String(i)}].layoutId must be a non-empty string`,
				{ layoutId }
			);
		}
		if (!validLayoutIds.has(lid)) {
			throw new CompileLayoutError('PROFILE_RULE_LAYOUT_UNKNOWN', `Profile rule references unknown layoutId: ${lid}`, {
				layoutId,
			});
		}
		rules.push({ minWidthPx, layoutId: lid });
	}
	rules.sort((a, b) => a.minWidthPx - b.minWidthPx);
	return { hysteresisPx, rules };
}

/**
 * Footprint preset columns merge {@link stripFootprintColumnForPreset} output with normalized
 * `cellOverlays` from the plan (ADR-0005 / segment plan v2).
 * @param {string} layoutId
 * @param {ReadonlyArray<Record<string, unknown>>} planColumns
 * @returns {{ columns: unknown[] }}
 */
function segmentSideFromPlanColumns(layoutId, planColumns) {
	return {
		columns: [...planColumns]
			.sort((a, b) => {
				const ao = typeof a.order === 'number' ? a.order : 0;
				const bo = typeof b.order === 'number' ? b.order : 0;
				return ao - bo;
			})
			.map(pc => {
				const lwc = pc.lwcFootprintColumn;
				if (lwc === undefined || typeof lwc !== 'object' || lwc === null) {
					throw new CompileLayoutError(
						'CATALOG_INVALID',
						`Layout ${layoutId}: footprint plan column missing lwcFootprintColumn`,
						{ layoutId }
					);
				}
				/** @type {Record<string, unknown>} */
				const col = structuredClone(/** @type {Record<string, unknown>} */ (lwc));
				const ovs = pc.overlays;
				if (Array.isArray(ovs) && ovs.length > 0) {
					col.cellOverlays = ovs;
				}
				return col;
			}),
	};
}

function footprintPlanColumns(columns, layoutId, sideLabel) {
	return columns.map((col, order) => {
		const overlays = normalizeCellOverlays(
			col.overlays,
			layoutId,
			`${sideLabel}.columns[${String(order)}].overlays`
		);
		return {
			order,
			binding: footprintColumnBinding(col),
			weight: typeof col.weight === 'number' ? col.weight : 1,
			visible: col.visible !== false,
			kind: col.kind,
			lwcFootprintColumn: stripFootprintColumnForPreset(col),
			...(col.presentation !== undefined ? { extensions: { presentation: col.presentation } } : {}),
			...(overlays ? { overlays } : {}),
		};
	});
}

/**
 * @param {unknown} catalog - Parsed `config.json` root object
 * @returns {{
 *   schemaVersion: string;
 *   renderPlanVersion: string;
 *   layouts: ReadonlyArray<{
 *     id: string;
 *     engine: string;
 *     artifacts: Record<string, string>;
 *     segmentPlan: Record<string, unknown> & { requiredKeys: string[] };
 *     lwcGenericFootprintPartial?: Record<string, unknown>;
 *     footprintPresetV1?: Record<string, unknown>;
 *   }>;
 *   index: { schemaVersion: string; layouts: ReadonlyArray<{ id: string; engine: string; artifacts: Record<string, string> }> };
 * }}
 */
export function compileLayoutCatalog(catalog) {
	if (!isRecord(catalog)) {
		throw new CompileLayoutError('CATALOG_INVALID', 'Catalog root must be an object', {});
	}
	const schemaVersion = catalog.schemaVersion;
	if (typeof schemaVersion !== 'string') {
		throw new CompileLayoutError('CATALOG_INVALID', 'schemaVersion must be a string', {});
	}
	const layouts = catalog.layouts;
	if (!Array.isArray(layouts) || layouts.length < 1) {
		throw new CompileLayoutError('CATALOG_INVALID', 'layouts must be a non-empty array', {});
	}
	const templates = isRecord(catalog.templates) ? catalog.templates : {};
	const themes = isRecord(catalog.themes) ? catalog.themes : {};

	const ids = new Set();
	for (const L of layouts) {
		if (!isRecord(L) || typeof L.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(L.id)) {
			throw new CompileLayoutError('LAYOUT_ID_INVALID', `Invalid layout id: ${JSON.stringify(L && L.id)}`, {
				layoutId: typeof L?.id === 'string' ? L.id : undefined,
			});
		}
		if (ids.has(L.id)) {
			throw new CompileLayoutError('LAYOUT_DUPLICATE', `Duplicate layout id: ${L.id}`, { layoutId: L.id });
		}
		ids.add(L.id);
	}

	const outLayouts = [];
	const indexLayouts = [];

	const validLayoutIds = new Set();
	for (const L of layouts) {
		if (isRecord(L) && typeof L.id === 'string') {
			validLayoutIds.add(L.id);
		}
	}
	const catalogProfiles = isRecord(catalog.segmentProfiles) ? catalog.segmentProfiles : {};

	for (const layout of layouts) {
		const { id, engine, segment, themeRef, segmentProfileRef } = layout;
		if (!isRecord(segment)) {
			throw new CompileLayoutError('CATALOG_INVALID', `Layout ${id}: segment must be an object`, { layoutId: id });
		}
		const baseTheme = typeof themeRef === 'string' && themes[themeRef] ? themes[themeRef] : {};

		if (engine === 'genericFootprint') {
			const tracks = segment.tracks;
			if (!Array.isArray(tracks) || tracks.length < 1) {
				throw new CompileLayoutError('TRACKS_EMPTY', `Layout ${id}: segment.tracks must be a non-empty array`, {
					layoutId: id,
				});
			}
			const merged = tracks.map(t => resolveTrack(templates, t, id));
			const candleTrackIndexes = [];
			for (let i = 0; i < merged.length; i++) {
				if (merged[i].role === 'candle') {
					candleTrackIndexes.push(i);
				}
			}
			if (candleTrackIndexes.length > 1) {
				throw new CompileLayoutError(
					'CATALOG_INVALID',
					`Layout ${id}: at most one candle track is allowed`,
					{ layoutId: id }
				);
			}
			const candleTrackIndex = candleTrackIndexes.length === 1 ? candleTrackIndexes[0] : -1;
			const candleTrack = candleTrackIndex >= 0 ? merged[candleTrackIndex] : null;
			const dataTracks = merged.filter(t => t.role !== 'candle');
			const weights = segment.trackWeights;
			if (!Array.isArray(weights) || weights.length !== dataTracks.length) {
				throw new CompileLayoutError(
					'TRACK_WEIGHT_MISMATCH',
					`Layout ${id}: trackWeights length must match non-candle tracks`,
					{ layoutId: id }
				);
			}
			const slots = [];
			const planColumns = [];
			for (let i = 0; i < dataTracks.length; i++) {
				assertGenericTrackRole(dataTracks[i], id, i);
				const { slot, planColumn } = genericTrackToSlotAndPlanColumn(dataTracks[i], id, i, weights[i]);
				slots.push(slot);
				planColumns.push(planColumn);
			}
			const chromeRaw = segment.chrome ?? {};
			const candleStripFractionFromTrack =
				candleTrack && typeof candleTrack.candleStripFraction === 'number' && Number.isFinite(candleTrack.candleStripFraction)
					? candleTrack.candleStripFraction
					: undefined;
			const candleInsetLeftFromTrack =
				candleTrack && typeof candleTrack.insetLeftCss === 'number' && Number.isFinite(candleTrack.insetLeftCss)
					? Math.max(0, candleTrack.insetLeftCss)
					: undefined;
			const candleInsetRightFromTrack =
				candleTrack && typeof candleTrack.insetRightCss === 'number' && Number.isFinite(candleTrack.insetRightCss)
					? Math.max(0, candleTrack.insetRightCss)
					: undefined;
			const candleGapAfterFromTrack =
				candleTrack && typeof candleTrack.gapAfterCss === 'number' && Number.isFinite(candleTrack.gapAfterCss)
					? Math.max(0, candleTrack.gapAfterCss)
					: undefined;
			const resolvedCandleVisible = candleTrackIndex >= 0;
			const resolvedCandleIndex = candleTrackIndex >= 0 ? candleTrackIndex : undefined;
			const candleThemePatch = {
				...(candleTrack && typeof candleTrack.candleLaneBg === 'string' ? { candleLaneBg: candleTrack.candleLaneBg } : {}),
				...(candleTrack && typeof candleTrack.candleLaneEdge === 'string' ? { candleLaneEdge: candleTrack.candleLaneEdge } : {}),
				...(candleTrack && typeof candleTrack.candleWick === 'string' ? { candleWick: candleTrack.candleWick } : {}),
				...(candleTrack && typeof candleTrack.candleBull === 'string' ? { candleBull: candleTrack.candleBull } : {}),
				...(candleTrack && typeof candleTrack.candleBear === 'string' ? { candleBear: candleTrack.candleBear } : {}),
				...(candleTrack && typeof candleTrack.candleBullStroke === 'string'
					? { candleBullStroke: candleTrack.candleBullStroke }
					: {}),
				...(candleTrack && typeof candleTrack.candleBearStroke === 'string'
					? { candleBearStroke: candleTrack.candleBearStroke }
					: {}),
			};
			const mergedTheme = {
				...baseTheme,
				...candleThemePatch,
			};
			const chrome = {
				...chromeRaw,
				candleLaneVisible: resolvedCandleVisible,
				...(resolvedCandleIndex !== undefined ? { candleLaneIndex: resolvedCandleIndex } : {}),
				...(candleStripFractionFromTrack !== undefined
					? { candleStripFraction: candleStripFractionFromTrack }
					: {}),
				...(candleInsetLeftFromTrack !== undefined ? { candleInsetLeftCss: candleInsetLeftFromTrack } : {}),
				...(candleInsetRightFromTrack !== undefined ? { candleInsetRightCss: candleInsetRightFromTrack } : {}),
				...(candleGapAfterFromTrack !== undefined ? { candleGapAfterCss: candleGapAfterFromTrack } : {}),
				...(candleTrack && typeof candleTrack.candleLaneBg === 'string' ? { candleLaneBg: candleTrack.candleLaneBg } : {}),
				...(candleTrack && typeof candleTrack.candleLaneEdge === 'string'
					? { candleLaneEdge: candleTrack.candleLaneEdge }
					: {}),
				...(candleTrack && typeof candleTrack.candleWick === 'string' ? { candleWick: candleTrack.candleWick } : {}),
				...(candleTrack && typeof candleTrack.candleBull === 'string' ? { candleBull: candleTrack.candleBull } : {}),
				...(candleTrack && typeof candleTrack.candleBear === 'string' ? { candleBear: candleTrack.candleBear } : {}),
				...(candleTrack && typeof candleTrack.candleBullStroke === 'string'
					? { candleBullStroke: candleTrack.candleBullStroke }
					: {}),
				...(candleTrack && typeof candleTrack.candleBearStroke === 'string'
					? { candleBearStroke: candleTrack.candleBearStroke }
					: {}),
			};
			const chromeThemeKeys = new Set([
				'candleLaneBg',
				'candleLaneEdge',
				'candleWick',
				'candleBull',
				'candleBear',
				'candleBullStroke',
				'candleBearStroke',
			]);
			const chromeForOptions = {};
			for (const [k, v] of Object.entries(chrome)) {
				if (!chromeThemeKeys.has(k)) {
					chromeForOptions[k] = v;
				}
			}

			const layoutRevisionGf = segmentLayoutRevision(id, 'genericFootprint');
			const columnOverlays = planColumns.map(c => (Array.isArray(c.overlays) ? c.overlays : []));
			const hasGenericOverlays = columnOverlays.some(a => a.length > 0);
			const profileSelector = normalizeProfileSelector(validLayoutIds, catalogProfiles, segmentProfileRef, id);
			let segmentPlanVersion = 1;
			if (hasGenericOverlays || profileSelector !== undefined) {
				segmentPlanVersion = 2;
			}

			const lwcGenericFootprintPartial = {
				slots,
				slotWeights: weights,
				honeycombLayoutRevision: layoutRevisionGf,
				...(hasGenericOverlays ? { columnOverlays } : {}),
				...chromeForOptions,
				...(Object.keys(mergedTheme).length ? { theme: mergedTheme } : {}),
				...(segment.summaries?.header !== undefined ? { barHeaderLines: segment.summaries.header } : {}),
				...(segment.summaries?.footer !== undefined ? { barFooterLines: segment.summaries.footer } : {}),
				...(segment.poc?.metricId !== undefined ? { pocMetricId: segment.poc.metricId } : {}),
				...(segment.typography?.minFontPx !== undefined
					? { minFontPx: segment.typography.minFontPx }
					: {}),
				...(segment.typography?.maxFontPx !== undefined
					? { maxFontPx: segment.typography.maxFontPx }
					: {}),
				...(segment.typography?.minCellHeightPx !== undefined
					? { minCellHeightPx: segment.typography.minCellHeightPx }
					: {}),
				...(segment.spacing?.barSummaryLabelGapCss !== undefined
					? { barSummaryLabelGapCss: segment.spacing.barSummaryLabelGapCss }
					: {}),
				...(segment.spacing?.barSummaryLineHeightCss !== undefined
					? { barSummaryLineHeightCss: segment.spacing.barSummaryLineHeightCss }
					: {}),
			};

			const requiredKeys = buildGenericRequiredKeys(planColumns, lwcGenericFootprintPartial, segment);
			const segmentPlan = {
				segmentPlanVersion,
				renderPlanVersion: RENDER_PLAN_VERSION,
				layoutId: id,
				engine: 'genericFootprint',
				layoutRevision: layoutRevisionGf,
				themeRef: typeof themeRef === 'string' ? themeRef : null,
				columns: planColumns,
				requiredKeys,
				chrome,
				summaries: segment.summaries ?? {},
				poc: segment.poc ?? null,
				typography: segment.typography ?? {},
				spacing: segment.spacing ?? {},
				...(profileSelector ? { profileSelector } : {}),
			};

			const artifacts = {
				lwcPartial: `compiled/${id}.generic.partial.json`,
				segmentPlan: `compiled/${id}.segmentPlan.json`,
			};
			outLayouts.push({
				id,
				engine,
				artifacts,
				segmentPlan,
				lwcGenericFootprintPartial,
			});
			indexLayouts.push({ id, engine, artifacts });
		} else {
			throw new CompileLayoutError('ENGINE_UNKNOWN', `Layout ${id}: unknown engine ${String(engine)}`, {
				layoutId: id,
			});
		}
	}

	return {
		schemaVersion,
		renderPlanVersion: RENDER_PLAN_VERSION,
		layouts: outLayouts,
		index: {
			schemaVersion,
			layouts: indexLayouts,
		},
	};
}
