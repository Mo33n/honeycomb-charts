import type { FootprintLayoutDirection } from '../layout/layout-direction.js';
import type {
	FootprintCandleStyle,
	FootprintColumnDef,
	FootprintColumnStyle,
} from '../options/footprint-series-options.js';
import { parseGenericCellOverlays } from '../generic-footprint/model.js';
import {
	defaultHoneycombSeriesOptions,
	mergeHoneycombSeriesOptions,
	type FootprintSegmentSide,
	type HoneycombSeriesOptions,
} from '../options/footprint-series-options.js';
import { FootprintRuleParseError, parseFootprintColumnColorRules, parseFootprintStylePatch } from '../rules/column-color-rules.js';

export const FOOTPRINT_PRESET_VERSION = 1 as const;

export interface FootprintPresetV1 {
	readonly version: typeof FOOTPRINT_PRESET_VERSION;
	readonly layoutDirection?: FootprintLayoutDirection;
	readonly left?: FootprintSegmentSide;
	readonly right?: FootprintSegmentSide;
	readonly bodyVisible?: boolean;
	readonly wicksVisible?: boolean;
	readonly candleStyle?: FootprintCandleStyle;
	readonly candleZOrder?: HoneycombSeriesOptions['candleZOrder'];
	readonly filteredBarTimeAxis?: HoneycombSeriesOptions['filteredBarTimeAxis'];
	readonly barAlignMode?: HoneycombSeriesOptions['barAlignMode'];
	readonly minFontPx?: number;
	readonly maxFontPx?: number;
	readonly minCellHeightPx?: number;
	readonly lodOmitNumberGlyphs?: boolean;
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null;
}

function parseColumn(x: unknown): FootprintColumnDef {
	if (!isRecord(x)) {
		throw new TypeError('Preset column must be an object');
	}
	const metricId = x['metricId'];
	const kind = x['kind'];
	const visible = x['visible'];
	if (typeof metricId !== 'string' || (kind !== 'number' && kind !== 'bar') || typeof visible !== 'boolean') {
		throw new TypeError('Invalid preset column shape');
	}
	const weight = x['weight'];
	const placeholder = x['placeholder'];
	const styleRaw = x['style'];
	let style: FootprintColumnStyle | undefined;
	if (styleRaw !== undefined) {
		try {
			style = parseFootprintStylePatch(styleRaw) as FootprintColumnStyle;
		} catch (e) {
			if (e instanceof FootprintRuleParseError) {
				throw new TypeError(`Invalid preset column style: ${e.message}`);
			}
			throw e;
		}
	}
	const colorRulesRaw = x['colorRules'];
	const colorRules = colorRulesRaw !== undefined ? parseFootprintColumnColorRules(colorRulesRaw) : undefined;
	const cellOverlays = parseGenericCellOverlays(x['cellOverlays'], 'preset.column.cellOverlays');
	return {
		metricId,
		kind,
		visible,
		...(typeof weight === 'number' && Number.isFinite(weight) ? { weight } : {}),
		...(typeof placeholder === 'string' ? { placeholder } : {}),
		...(style !== undefined ? { style } : {}),
		...(colorRules !== undefined ? { colorRules } : {}),
		...(cellOverlays !== undefined ? { cellOverlays } : {}),
	};
}

function parseSide(x: unknown): FootprintSegmentSide {
	if (!isRecord(x)) {
		throw new TypeError('Preset segment must be an object');
	}
	const cols = x['columns'];
	if (!Array.isArray(cols)) {
		throw new TypeError('Preset segment.columns must be an array');
	}
	return { columns: cols.map(parseColumn) };
}

function parseCandleStyle(x: unknown): FootprintCandleStyle | undefined {
	if (!isRecord(x)) {
		return undefined;
	}
	const wickColor = x['wickColor'];
	const bullWickColor = x['bullWickColor'];
	const bearWickColor = x['bearWickColor'];
	const bullBodyFill = x['bullBodyFill'];
	const bearBodyFill = x['bearBodyFill'];
	const bullBodyBorder = x['bullBodyBorder'];
	const bearBodyBorder = x['bearBodyBorder'];
	if (
		typeof wickColor !== 'string' ||
		(bullWickColor !== undefined && typeof bullWickColor !== 'string') ||
		(bearWickColor !== undefined && typeof bearWickColor !== 'string') ||
		typeof bullBodyFill !== 'string' ||
		typeof bearBodyFill !== 'string' ||
		typeof bullBodyBorder !== 'string' ||
		typeof bearBodyBorder !== 'string'
	) {
		throw new TypeError('preset.candleStyle requires wick/body fill/border color strings');
	}
	return {
		wickColor,
		...(typeof bullWickColor === 'string' ? { bullWickColor } : {}),
		...(typeof bearWickColor === 'string' ? { bearWickColor } : {}),
		bullBodyFill,
		bearBodyFill,
		bullBodyBorder,
		bearBodyBorder,
	};
}

function sortKeysDeep(x: unknown): unknown {
	if (Array.isArray(x)) {
		return x.map(sortKeysDeep);
	}
	if (x !== null && typeof x === 'object') {
		const o = x as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(o).sort()) {
			out[k] = sortKeysDeep(o[k]);
		}
		return out;
	}
	return x;
}

/**
 * Typed decoder for preset JSON (PRD FR-22 / RFC §12). No `eval` (NFR-4).
 * Unknown JSON keys are **stripped** (ignored); see `docs/presets-v1.2.md` §Unknown keys.
 */
export function parseFootprintPresetV1(json: unknown): FootprintPresetV1 {
	if (!isRecord(json)) {
		throw new TypeError('Preset root must be an object');
	}
	const version = json['version'];
	if (version !== FOOTPRINT_PRESET_VERSION) {
		throw new TypeError(`Unsupported preset version: ${String(version)}`);
	}

	const layoutDirection = json['layoutDirection'] === 'ltr' || json['layoutDirection'] === 'mirrorSegments'
		? json['layoutDirection']
		: undefined;

	const left = json['left'] !== undefined ? parseSide(json['left']) : undefined;
	const right = json['right'] !== undefined ? parseSide(json['right']) : undefined;

	const bodyVisible = typeof json['bodyVisible'] === 'boolean' ? json['bodyVisible'] : undefined;
	const wicksVisible = typeof json['wicksVisible'] === 'boolean' ? json['wicksVisible'] : undefined;
	const candleStyle = json['candleStyle'] !== undefined ? parseCandleStyle(json['candleStyle']) : undefined;

	const candleZOrder = json['candleZOrder'] === 'behind' || json['candleZOrder'] === 'outlineFront'
		? json['candleZOrder']
		: undefined;

	const filteredBarTimeAxis = json['filteredBarTimeAxis'] === 'compress' || json['filteredBarTimeAxis'] === 'retainGap'
		? json['filteredBarTimeAxis']
		: undefined;
	const barAlignMode =
		json['barAlignMode'] === 'positiveLeftNegativeRight' ||
		json['barAlignMode'] === 'positiveRightNegativeLeft' ||
		json['barAlignMode'] === 'centered' ||
		json['barAlignMode'] === 'leftOnly' ||
		json['barAlignMode'] === 'rightOnly'
			? json['barAlignMode']
			: undefined;

	const minFontPx = typeof json['minFontPx'] === 'number' && Number.isFinite(json['minFontPx']) ? json['minFontPx'] : undefined;
	const maxFontPx = typeof json['maxFontPx'] === 'number' && Number.isFinite(json['maxFontPx']) ? json['maxFontPx'] : undefined;
	const minCellHeightPx = typeof json['minCellHeightPx'] === 'number' && Number.isFinite(json['minCellHeightPx']) ? json['minCellHeightPx'] : undefined;

	const lodOmitNumberGlyphs = typeof json['lodOmitNumberGlyphs'] === 'boolean' ? json['lodOmitNumberGlyphs'] : undefined;

	return {
		version: FOOTPRINT_PRESET_VERSION,
		...(layoutDirection !== undefined ? { layoutDirection } : {}),
		...(left !== undefined ? { left } : {}),
		...(right !== undefined ? { right } : {}),
		...(bodyVisible !== undefined ? { bodyVisible } : {}),
		...(wicksVisible !== undefined ? { wicksVisible } : {}),
		...(candleStyle !== undefined ? { candleStyle } : {}),
		...(candleZOrder !== undefined ? { candleZOrder } : {}),
		...(filteredBarTimeAxis !== undefined ? { filteredBarTimeAxis } : {}),
		...(barAlignMode !== undefined ? { barAlignMode } : {}),
		...(minFontPx !== undefined ? { minFontPx } : {}),
		...(maxFontPx !== undefined ? { maxFontPx } : {}),
		...(minCellHeightPx !== undefined ? { minCellHeightPx } : {}),
		...(lodOmitNumberGlyphs !== undefined ? { lodOmitNumberGlyphs } : {}),
	};
}

export function presetToPartialOptions(preset: FootprintPresetV1): Partial<HoneycombSeriesOptions> {
	const partial: Record<string, unknown> = {};
	if (preset.layoutDirection !== undefined) {
		partial['layoutDirection'] = preset.layoutDirection;
	}
	if (preset.left !== undefined) {
		partial['left'] = preset.left;
	}
	if (preset.right !== undefined) {
		partial['right'] = preset.right;
	}
	if (preset.bodyVisible !== undefined) {
		partial['bodyVisible'] = preset.bodyVisible;
	}
	if (preset.wicksVisible !== undefined) {
		partial['wicksVisible'] = preset.wicksVisible;
	}
	if (preset.candleStyle !== undefined) {
		partial['candleStyle'] = preset.candleStyle;
	}
	if (preset.candleZOrder !== undefined) {
		partial['candleZOrder'] = preset.candleZOrder;
	}
	if (preset.filteredBarTimeAxis !== undefined) {
		partial['filteredBarTimeAxis'] = preset.filteredBarTimeAxis;
	}
	if (preset.barAlignMode !== undefined) {
		partial['barAlignMode'] = preset.barAlignMode;
	}
	if (preset.minFontPx !== undefined) {
		partial['minFontPx'] = preset.minFontPx;
	}
	if (preset.maxFontPx !== undefined) {
		partial['maxFontPx'] = preset.maxFontPx;
	}
	if (preset.minCellHeightPx !== undefined) {
		partial['minCellHeightPx'] = preset.minCellHeightPx;
	}
	if (preset.lodOmitNumberGlyphs !== undefined) {
		partial['lodOmitNumberGlyphs'] = preset.lodOmitNumberGlyphs;
	}
	return partial as Partial<HoneycombSeriesOptions>;
}

export function applyFootprintPresetToOptions(
	base: HoneycombSeriesOptions,
	preset: FootprintPresetV1
): HoneycombSeriesOptions {
	return mergeHoneycombSeriesOptions(base, presetToPartialOptions(preset));
}

export function defaultOptionsWithPreset(preset: FootprintPresetV1): HoneycombSeriesOptions {
	return mergeHoneycombSeriesOptions(defaultHoneycombSeriesOptions, presetToPartialOptions(preset));
}

/**
 * Stable JSON for **FootprintPresetV1** (sorted keys recursively). Used by AC-19 round-trip tests (`canonicalFootprintPresetV1Json`).
 */
export function footprintPresetV1ToRecord(preset: FootprintPresetV1): Record<string, unknown> {
	const o: Record<string, unknown> = { version: preset.version };
	if (preset.layoutDirection !== undefined) {
		o.layoutDirection = preset.layoutDirection;
	}
	if (preset.left !== undefined) {
		o.left = {
			columns: preset.left.columns.map(c => ({
				metricId: c.metricId,
				kind: c.kind,
				visible: c.visible,
				...(c.weight !== undefined ? { weight: c.weight } : {}),
				...(c.placeholder !== undefined ? { placeholder: c.placeholder } : {}),
				...(c.style !== undefined ? { style: c.style } : {}),
				...(c.colorRules !== undefined ? { colorRules: c.colorRules } : {}),
				...(c.cellOverlays !== undefined ? { cellOverlays: c.cellOverlays } : {}),
			})),
		};
	}
	if (preset.right !== undefined) {
		o.right = {
			columns: preset.right.columns.map(c => ({
				metricId: c.metricId,
				kind: c.kind,
				visible: c.visible,
				...(c.weight !== undefined ? { weight: c.weight } : {}),
				...(c.placeholder !== undefined ? { placeholder: c.placeholder } : {}),
				...(c.style !== undefined ? { style: c.style } : {}),
				...(c.colorRules !== undefined ? { colorRules: c.colorRules } : {}),
				...(c.cellOverlays !== undefined ? { cellOverlays: c.cellOverlays } : {}),
			})),
		};
	}
	if (preset.bodyVisible !== undefined) {
		o.bodyVisible = preset.bodyVisible;
	}
	if (preset.wicksVisible !== undefined) {
		o.wicksVisible = preset.wicksVisible;
	}
	if (preset.candleStyle !== undefined) {
		o.candleStyle = preset.candleStyle;
	}
	if (preset.candleZOrder !== undefined) {
		o.candleZOrder = preset.candleZOrder;
	}
	if (preset.filteredBarTimeAxis !== undefined) {
		o.filteredBarTimeAxis = preset.filteredBarTimeAxis;
	}
	if (preset.barAlignMode !== undefined) {
		o.barAlignMode = preset.barAlignMode;
	}
	if (preset.minFontPx !== undefined) {
		o.minFontPx = preset.minFontPx;
	}
	if (preset.maxFontPx !== undefined) {
		o.maxFontPx = preset.maxFontPx;
	}
	if (preset.minCellHeightPx !== undefined) {
		o.minCellHeightPx = preset.minCellHeightPx;
	}
	if (preset.lodOmitNumberGlyphs !== undefined) {
		o.lodOmitNumberGlyphs = preset.lodOmitNumberGlyphs;
	}
	return o;
}

/** Canonical JSON string for deterministic deep-equal comparisons (HC2-040). */
export function canonicalFootprintPresetV1Json(preset: FootprintPresetV1): string {
	return JSON.stringify(sortKeysDeep(footprintPresetV1ToRecord(preset)));
}
