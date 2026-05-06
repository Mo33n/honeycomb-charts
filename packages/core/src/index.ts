export type { EnrichedCandle, FootprintLevelRow } from './schema/types.js';

export type { FootprintReplayDomain } from './replay/footprint-replay-data.js';
export {
	deriveFootprintReplayDomain,
	clampFootprintReplayPlayhead,
	filterEnrichedCandlesAtOrBeforePlayhead,
	assertFootprintReplayHasNoFutureBars,
} from './replay/footprint-replay-data.js';
export { sanitizeEnrichedCandle, MAX_LEVELS_PER_BAR } from './schema/sanitize.js';
export type { SanitizeFootprintResult, SanitizeFootprintOptions } from './schema/sanitize.js';

export type {
	HoneycombSeriesOptions,
	HoneycombStyleExtension,
	FootprintColumnDef,
	FootprintColumnKind,
	FootprintColumnStyle,
	FootprintNumberHistogramStyle,
	FootprintCellOutlineStyle,
	FootprintSegmentSide,
	FootprintRevisionEvent,
	FilteredBarTimeAxisPolicy,
	BarMetricScope,
	CorrectionFlashMode,
} from './options/footprint-series-options.js';
export {
	defaultHoneycombSeriesOptions,
	mergeHoneycombSeriesOptions,
	honeycombStyleDefaults,
} from './options/footprint-series-options.js';

export { HoneycombSeries } from './series/footprint-series.js';

export type {
	GenericFootprintBarSummaryLine,
	GenericFootprintSeriesOptions,
	GenericFootprintSlot,
	GenericFootprintStyleExtension,
	GenericFootprintTheme,
} from './options/generic-footprint-series-options.js';
export {
	defaultGenericFootprintSeriesOptions,
	defaultGenericFootprintTheme,
	genericFootprintStyleDefaults,
	mergeGenericFootprintSeriesOptions,
	validateGenericFootprintSlots,
} from './options/generic-footprint-series-options.js';
export { GenericFootprintSeries } from './series/generic-footprint-series.js';
export { GenericFootprintRenderer } from './render/generic-footprint-renderer.js';

export { optimalCandlestickWidth } from './layout/optimal-column-width.js';
export { computeSegmentColumnWidths, MAX_VISIBLE_COLUMNS } from './layout/segment-widths.js';
export type { SegmentWidthInput, SegmentWidthResult, VisibleColumn } from './layout/segment-widths.js';
export { buildRowVerticalBands } from './layout/row-geometry.js';
export type { RowVerticalBand, PriceToY } from './layout/row-geometry.js';
export { segmentOrder } from './layout/layout-direction.js';
export type { FootprintLayoutDirection } from './layout/layout-direction.js';
export {
	computeFootprintColumnCssSlots,
} from './layout/footprint-column-css-slots.js';
export type { FootprintColumnCssSlot } from './layout/footprint-column-css-slots.js';

export { FootprintRenderer, setFootprintCorrectionFlashClockForTests } from './render/footprint-renderer.js';
export type { FootprintHitCell } from './render/footprint-renderer.js';
export { formatNumberCellText } from './render/format-cell-text.js';
export {
	footprintCellRawFontPxFromHeight,
	shouldDrawFootprintNumberGlyph,
	FOOTPRINT_LOD_FONT_HEIGHT_RATIO,
} from './render/lod-number-glyph.js';
export {
	TextMeasureCache,
	resetTextMeasureCacheDevStats,
	getTextMeasureCacheDevEvictionCount,
} from './render/text-measure-cache.js';
export { maxAbsMetricInBar, maxAbsBarMetricsVisibleWindow, normalizedBarValue } from './render/bar-metric-scale.js';

export {
	parseFootprintPresetV1,
	presetToPartialOptions,
	applyFootprintPresetToOptions,
	defaultOptionsWithPreset,
	FOOTPRINT_PRESET_VERSION,
	canonicalFootprintPresetV1Json,
	footprintPresetV1ToRecord,
} from './preset/footprint-preset-v1.js';
export type { FootprintPresetV1 } from './preset/footprint-preset-v1.js';

export {
	parseFootprintRulePredicate,
	parseFootprintColumnColorRules,
	parseFootprintStylePatch,
	evaluateFootprintRulePredicate,
	resolveColumnStyleForCell,
	FOOTPRINT_COLOR_RULE_MAX_DEPTH,
	FOOTPRINT_COLOR_RULE_MAX_AST_NODES,
	FOOTPRINT_COLOR_RULE_MAX_RULES,
	FootprintRuleParseError,
} from './rules/column-color-rules.js';
export type {
	FootprintRuleCmpOp,
	FootprintRulePredicateAst,
	FootprintColumnColorRule,
	FootprintRuleStylePatch,
	FootprintRuleParseErrorCode,
} from './rules/column-color-rules.js';

export type { FootprintTickLike, FootprintBarKeyFn } from './pipeline/footprint-tick.js';
export type { IFootprintDataAdapter } from './pipeline/footprint-adapter-contract.js';
export { NoopFootprintDataAdapter } from './pipeline/footprint-adapter-contract.js';
export { FootprintDataAdapter } from './pipeline/footprint-data-adapter.js';
export type { FootprintDataAdapterOptions } from './pipeline/footprint-data-adapter.js';
export { FootprintSeriesBinding } from './pipeline/series-binding.js';
export {
	applyFootprintLevelPatch,
	type ApplyFootprintLevelPatchInput,
	type FootprintPatchSeriesApi,
} from './pipeline/apply-level-patch.js';

export type {
	FootprintBrushInterval,
	FootprintReducerId,
	FootprintReducerResult,
	FootprintBrushCompleteEvent,
	FootprintBrushCompleteHandler,
	FootprintCustomReducerContext,
	FootprintCustomReducerFn,
} from './brush/footprint-brush-contract.js';
export {
	normalizeFootprintBrushInterval,
	filterBarsByFootprintBrush,
	resolveDefaultBrushTargetMetricId,
	runFootprintBrushReducers,
} from './brush/footprint-brush-reducers.js';
export type { FootprintBrushReducerRunOptions } from './brush/footprint-brush-reducers.js';

export {
	parseFootprintObjectId,
	buildFootprintCrosshairPayload,
	parseGenericFootprintObjectId,
	buildGenericFootprintCrosshairPayload,
} from './interaction/crosshair-adapter.js';
export type {
	ParsedFootprintHit,
	FootprintCrosshairPayload,
	ParsedGenericFootprintHit,
	GenericFootprintCrosshairPayload,
} from './interaction/crosshair-adapter.js';

export {
	createEmptyFootprintLayoutSnapshot,
	buildFootprintLayoutSnapshot,
	FOOTPRINT_LAYOUT_SNAPSHOT_VERSION,
} from './export/layout-snapshot.js';
export type {
	FootprintLayoutSnapshot,
	FootprintLayoutBarSnapshot,
	FootprintLayoutCellSnapshot,
	FootprintLayoutCandleChromeSnapshot,
	BuildFootprintLayoutSnapshotInput,
} from './export/layout-snapshot.js';
