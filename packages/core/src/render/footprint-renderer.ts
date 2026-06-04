import type { BitmapCoordinatesRenderingScope } from 'fancy-canvas';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
	Coordinate,
	CustomSeriesHitTestResult,
	ICustomSeriesPaneRenderer,
	PaneRendererCustomData,
	PriceToCoordinateConverter,
	Time,
} from 'lightweight-charts';

import { buildRowVerticalBands, type RowVerticalBand } from '../layout/row-geometry.js';
import { computeFootprintColumnCssSlots, type FootprintColumnCssSlot } from '../layout/footprint-column-css-slots.js';
import { optimalCandlestickWidth } from '../layout/optimal-column-width.js';
import type { GenericCellOverlay } from '../generic-footprint/model.js';
import type { HoneycombSeriesOptions, FootprintColumnDef } from '../options/footprint-series-options.js';
import { buildFootprintObjectId } from '../interaction/hit-id-codec.js';
import type { EnrichedCandle } from '../schema/types.js';
import { maxAbsBarMetricsVisibleWindow, normalizedBarValue } from './bar-metric-scale.js';
import { formatNumberCellText } from './format-cell-text.js';
import { TextMeasureCache } from './text-measure-cache.js';
import { resolveColumnStyleForCell } from '../rules/column-color-rules.js';
import { shouldDrawFootprintNumberGlyph } from './lod-number-glyph.js';

/** @internal HC2-020 unit tests — override `Date.now()` for deterministic flash decay. */
let footprintCorrectionFlashClockMs: number | null = null;

export function setFootprintCorrectionFlashClockForTests(ms: number | null): void {
	footprintCorrectionFlashClockMs = ms;
}

function footprintCorrectionFlashNowMs(): number {
	return footprintCorrectionFlashClockMs ?? Date.now();
}

function footprintMotionFlashAllowed(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return true;
	}
	return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const CORRECTION_FLASH_DURATION_MS = 300;

export interface FootprintHitCell {
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
	readonly cx: number;
	readonly cy: number;
	readonly objectId: string;
}

function isEnrichedCandle(d: unknown): d is EnrichedCandle<Time> {
	if (typeof d !== 'object' || d === null) {
		return false;
	}
	const open = (d as { open?: unknown }).open;
	return typeof open === 'number';
}

function alignBarWidth(barWidth: number, horizontalPixelRatio: number): number {
	let w = barWidth;
	if (w >= 2) {
		const wickWidth = Math.floor(horizontalPixelRatio);
		if ((wickWidth % 2) !== (w % 2)) {
			w--;
		}
	}
	return w;
}

function clampFont(px: number, minPx: number, maxPx: number): number {
	return Math.max(minPx, Math.min(maxPx, px));
}

/** Max `|v|` per metric id across all price rows in one bar (for histogram normalization). */
function maxAbsPerMetricAcrossLevels(
	levels: readonly { readonly values: Readonly<Record<string, number>> }[]
): ReadonlyMap<string, number> {
	const acc = new Map<string, number>();
	for (const row of levels) {
		for (const [k, v] of Object.entries(row.values)) {
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				continue;
			}
			const a = Math.abs(v);
			const prev = acc.get(k) ?? 0;
			if (a > prev) {
				acc.set(k, a);
			}
		}
	}
	return acc;
}

/** Stable digest of footprint-relevant candle fields (HC1-012 per-bar skip when `barMetricScope === 'perBar'`). */
function barFootprintFingerprint(d: EnrichedCandle<Time>, options: HoneycombSeriesOptions): string {
	const parts: string[] = [
		String(d.revision ?? ''),
		String(d.open),
		String(d.high),
		String(d.low),
		String(d.close),
	];
		for (const row of d.levels) {
		parts.push(`@${String(row.price)}`);
		for (const side of [options.left, options.right]) {
			for (const col of side.columns) {
				if (!col.visible) {
					continue;
				}
				const v = row.values[col.metricId];
				parts.push(
					`${col.metricId}=${String(v ?? '')}|ph=${String(col.placeholder ?? '')}|st=${JSON.stringify(col.style ?? null)}`
				);
			}
		}
	}
	return parts.join(';');
}

/** Invalidate per-bar skip cache when declarative `colorRules` config changes (HC1-B / HC1-012). */
function colorRulesLayoutSig(options: HoneycombSeriesOptions): string {
	const chunks: string[] = [];
	for (const side of [options.left, options.right]) {
		for (const col of side.columns) {
			const rules = col.colorRules;
			if (rules === undefined || rules.length === 0) {
				chunks.push(`${col.metricId}:0`);
				continue;
			}
			chunks.push(
				`${col.metricId}:${String(rules.length)}:${rules
					.map(r => `${JSON.stringify(r.when)}|${JSON.stringify(r.style)}`)
					.join('~')}`
			);
		}
	}
	return chunks.join(';');
}

function cellOverlaysLayoutSig(options: HoneycombSeriesOptions): string {
	const chunks: string[] = [];
	for (const side of [options.left, options.right]) {
		for (const col of side.columns) {
			const ovs = col.cellOverlays;
			if (ovs === undefined || ovs.length === 0) {
				chunks.push(`${col.metricId}:0`);
				continue;
			}
			chunks.push(
				`${col.metricId}:${String(ovs.length)}:${ovs
					.map(
						(o: GenericCellOverlay) =>
							`${o.id}|${o.kind}|${o.fill}|${String(o.opacity ?? '')}|${String(o.zOrder ?? '')}`
					)
					.join('~')}`
			);
		}
	}
	return chunks.join(';');
}

function candleStyleLayoutSig(options: HoneycombSeriesOptions): string {
	const cs = options.candleStyle;
	return [
		cs.wickColor,
		cs.bullWickColor ?? '',
		cs.bearWickColor ?? '',
		cs.bullBodyFill,
		cs.bearBodyFill,
		cs.bullBodyBorder,
		cs.bearBodyBorder,
	].join('|');
}

function barAlignX(
	t: number,
	innerLeftB: number,
	innerRightB: number,
	barWidthB: number,
	mode: HoneycombSeriesOptions['barAlignMode']
): number {
	if (mode === 'leftOnly') {
		return innerLeftB;
	}
	if (mode === 'rightOnly') {
		return innerRightB - barWidthB;
	}
	if (mode === 'centered') {
		const center = (innerLeftB + innerRightB) * 0.5;
		return center - barWidthB * 0.5;
	}
	if (mode === 'positiveRightNegativeLeft') {
		return t >= 0 ? innerRightB - barWidthB : innerLeftB;
	}
	return t >= 0 ? innerLeftB : innerRightB - barWidthB;
}

function drawFootprintCellBandOverlays(
	ctx: CanvasRenderingContext2D,
	hpr: number,
	vpr: number,
	overlays: readonly GenericCellOverlay[],
	colLeft: number,
	colRight: number,
	cellTop: number,
	cellBottom: number
): void {
	const sorted = [...overlays].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
	for (const ov of sorted) {
		if (ov.kind !== 'cellBand') {
			continue;
		}
		const alpha = ov.opacity ?? 1;
		if (alpha <= 0) {
			continue;
		}
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.fillStyle = ov.fill;
		const x1b = Math.round(colLeft * hpr);
		const x2b = Math.round(colRight * hpr);
		const y1b = Math.round(cellTop * vpr);
		const y2b = Math.round(cellBottom * vpr);
		ctx.fillRect(x1b, y1b, Math.max(1, x2b - x1b), Math.max(1, y2b - y1b));
		ctx.restore();
	}
}

function topFootprintOverlayId(overlays: readonly GenericCellOverlay[] | undefined): string {
	if (overlays === undefined || overlays.length === 0) {
		return '__cell__';
	}
	const sorted = [...overlays].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
	return sorted[sorted.length - 1]?.id ?? '__cell__';
}

function columnDefForSlot(options: HoneycombSeriesOptions, slot: FootprintColumnCssSlot): FootprintColumnDef {
	const cols = slot.segment === 'L' ? options.left.columns : options.right.columns;
	const col = cols[slot.columnIndex];
	if (col === undefined) {
		throw new RangeError('Invalid FootprintColumnCssSlot index');
	}
	return col;
}

interface FootprintBarPaintContext {
	readonly scope: BitmapCoordinatesRenderingScope;
	readonly bar: NonNullable<PaneRendererCustomData<Time, EnrichedCandle<Time>>['bars'][number]>;
	readonly d: EnrichedCandle<Time>;
	readonly options: HoneycombSeriesOptions;
	readonly slotCss: number;
	readonly slotBitmap: number;
	readonly skipDraw: boolean;
	readonly windowMax: ReadonlyMap<string, number> | null;
	readonly priceToCoord: PriceToCoordinateConverter;
}

export class FootprintRenderer implements ICustomSeriesPaneRenderer {
	private _data: PaneRendererCustomData<Time, EnrichedCandle<Time>> | null = null;
	private _options: HoneycombSeriesOptions | null = null;
	private _hitCells: FootprintHitCell[] = [];
	private readonly _textMeasure = new TextMeasureCache();
	/** Cleared when viewport / spacing signature changes (HC1-012). */
	private readonly _barFpByCandleTime = new Map<unknown, string>();
	private _cachedSpacingSig: string | null = null;
	private readonly _lastRevisionForFlash = new Map<unknown, number>();
	private readonly _flashStartMsByTime = new Map<unknown, number>();

	/** Drop per-bar layout skip cache (e.g. series teardown). */
	public clearPerBarLayoutCache(): void {
		this._barFpByCandleTime.clear();
		this._cachedSpacingSig = null;
		this._lastRevisionForFlash.clear();
		this._flashStartMsByTime.clear();
	}

	/** @internal HC1-012 unit tests — `TextMeasureCache` miss counter (actual `ctx.measureText` calls). */
	public resetTextMeasureDiagnosticsForTests(): void {
		this._textMeasure.resetMeasureMissCountForTests();
	}

	/** @internal HC1-012 unit tests */
	public getTextMeasureMissCountForTests(): number {
		return this._textMeasure.getMeasureMissCountForTests();
	}

	/** @internal HC2-020 — overlay strength in **[0, 1]** for a bar `time` (UTC / `BusinessDay` key). */
	public getCorrectionFlashOverlayAlphaForTests(time: unknown): number {
		const options = this._options;
		if (options === null) {
			return 0;
		}
		return this._correctionFlashAlphaForTime(time, options);
	}

	public update(data: PaneRendererCustomData<Time, EnrichedCandle<Time>>, options: HoneycombSeriesOptions): void {
		this._data = data;
		this._options = options;
		this._hitCells = [];
		this._advanceCorrectionFlashOnRevisions();
	}

	public draw(
		target: CanvasRenderingTarget2D,
		priceConverter: PriceToCoordinateConverter,
		isHovered: boolean,
		hitTestData?: unknown
	): void {
		void isHovered;
		void hitTestData;
		target.useBitmapCoordinateSpace(scope => this._drawImpl(scope, priceConverter));
	}

	public hitTest(
		x: Coordinate,
		y: Coordinate,
		priceConverter: PriceToCoordinateConverter
	): CustomSeriesHitTestResult | null {
		void priceConverter;
		let best: { cell: FootprintHitCell; d2: number } | null = null;
		for (const cell of this._hitCells) {
			if (x >= cell.x1 && x <= cell.x2 && y >= cell.y1 && y <= cell.y2) {
				const dx = x - cell.cx;
				const dy = y - cell.cy;
				const d2 = dx * dx + dy * dy;
				if (best === null || d2 < best.d2) {
					best = { cell, d2 };
				}
			}
		}
		if (best === null) {
			return null;
		}
		return {
			distance: Math.sqrt(best.d2),
			objectId: best.cell.objectId,
			type: 'custom',
		};
	}

	private _resolveWindowMax(
		data: PaneRendererCustomData<Time, EnrichedCandle<Time>>,
		options: HoneycombSeriesOptions,
		from: number,
		to: number
	): ReadonlyMap<string, number> | null {
		const barMetricIds = new Set<string>();
		for (const side of [options.left, options.right]) {
			for (const col of side.columns) {
				if (col.visible && col.kind === 'bar') {
					barMetricIds.add(col.metricId);
				}
			}
		}
		if (options.barMetricScope !== 'perVisibleWindow' || barMetricIds.size === 0) {
			return null;
		}
		const levelLists: EnrichedCandle<Time>['levels'][] = [];
		for (let j = from; j < to; j++) {
			const b = data.bars[j];
			if (b === undefined) {
				continue;
			}
			const dd = b.originalData;
			if (!isEnrichedCandle(dd)) {
				continue;
			}
			levelLists.push(dd.levels);
		}
		return maxAbsBarMetricsVisibleWindow(levelLists, barMetricIds);
	}

	private _renderOneVisibleBar(paint: FootprintBarPaintContext, nextHits: FootprintHitCell[]): void {
		const { scope, bar, d, options, slotCss, slotBitmap, skipDraw, windowMax, priceToCoord } = paint;
		const { horizontalPixelRatio, verticalPixelRatio, context: ctx } = scope;
		const centerCssX = bar.x;

		const columnSlots = computeFootprintColumnCssSlots(
			centerCssX,
			slotCss,
			options.layoutDirection,
			options.left,
			options.right
		);

		const toCssY = (price: number): number | null => {
			const c = priceToCoord(price);
			return c === null ? null : c;
		};
		const bands = buildRowVerticalBands(d, d.levels, p => toCssY(p));

		if (!skipDraw && options.candleZOrder === 'behind') {
			this._drawCandleChrome(scope, centerCssX, slotBitmap, d, options, priceToCoord);
		}

		const levelMaxAbs = maxAbsPerMetricAcrossLevels(d.levels);

		for (const slot of columnSlots) {
			const col = columnDefForSlot(options, slot);
			const colLeft = slot.colLeftCss;
			const colRight = slot.colRightCss;

			for (const band of bands) {
				const cellTop = Math.min(band.topPx, band.bottomPx);
				const cellBottom = Math.max(band.topPx, band.bottomPx);
				const cellH = cellBottom - cellTop;
				if (cellH < options.minCellHeightPx * 0.25) {
					continue;
				}
				const pad = 1;
				const innerLeft = colLeft + pad;
				const innerRight = colRight - pad;
				const innerW = Math.max(0, innerRight - innerLeft);
				// Size by both row height and slot width, but keep configured readability floor.
				const widthBoundPx = innerW / 3.3;
				const fontPx = clampFont(
					Math.floor(Math.min(cellH * 0.75, widthBoundPx)),
					options.minFontPx,
					options.maxFontPx
				);
				const hasGlyphWidthBudget = !options.lodOmitNumberGlyphs || innerW >= fontPx * 1.6;
				const drawNumberGlyph =
					col.kind !== 'number' ||
					(
						hasGlyphWidthBudget &&
						shouldDrawFootprintNumberGlyph(cellH, options.minFontPx, options.maxFontPx, options.lodOmitNumberGlyphs)
					);

				const value = band.row.values[col.metricId];
				const text = value === undefined
					? (col.placeholder ?? '')
					: col.kind === 'number'
						? formatNumberCellText(value, { maxChars: Math.max(2, Math.floor(innerW / (fontPx * 0.55))) })
						: '';

				if (!skipDraw) {
					ctx.font = `${fontPx * verticalPixelRatio}px sans-serif`;
					const x1b = Math.round(colLeft * horizontalPixelRatio);
					const x2b = Math.round(colRight * horizontalPixelRatio);
					const y1b = Math.round(cellTop * verticalPixelRatio);
					const y2b = Math.round(cellBottom * verticalPixelRatio);

					ctx.fillStyle = 'rgba(128,128,128,0.08)';
					ctx.fillRect(x1b, y1b, x2b - x1b, y2b - y1b);

					const cellOvs = col.cellOverlays;
					if (cellOvs !== undefined && cellOvs.length > 0) {
						drawFootprintCellBandOverlays(
							ctx,
							horizontalPixelRatio,
							verticalPixelRatio,
							cellOvs,
							colLeft,
							colRight,
							cellTop,
							cellBottom
						);
					}

					const cellStyle = resolveColumnStyleForCell(col, band.row.values);
					const innerLeftB = innerLeft * horizontalPixelRatio;
					const innerRightB = innerRight * horizontalPixelRatio;
					const innerWB = Math.max(0, innerRightB - innerLeftB);

					if (col.kind === 'number') {
						const hist = cellStyle.numberHistogram;
						if (hist !== undefined) {
							const src = band.row.values[hist.sourceMetricId];
							const denom = levelMaxAbs.get(hist.sourceMetricId) ?? 0;
							if (typeof src === 'number' && Number.isFinite(src) && denom > 0) {
								const frac = Math.min(1, Math.abs(src) / denom);
								const bw = Math.floor(innerWB * frac);
								const bh = Math.max(1, Math.floor((cellH * 0.5) * verticalPixelRatio));
								const by = (cellTop + cellH * 0.5) * verticalPixelRatio - bh * 0.5;
								const bx =
									hist.direction === 'left'
										? innerLeftB
										: innerRightB - bw;
								ctx.fillStyle = hist.color;
								ctx.fillRect(bx, by, bw, bh);
							}
						}
						if (drawNumberGlyph) {
							ctx.fillStyle = cellStyle.textColor ?? '#d1d4dc';
							const tx = innerLeft * horizontalPixelRatio;
							const ty = (cellTop + cellH * 0.72) * verticalPixelRatio;
							this._textMeasure.measure(ctx, `${fontPx}|${text}`, text);
							ctx.fillText(text, tx, ty);
						}
					} else {
						const t = normalizedBarValue(
							value,
							col.metricId,
							options.barMetricScope,
							d.levels,
							windowMax
						);
						const barFill = t >= 0
							? (cellStyle.barPositiveColor ?? '#26a69a')
							: (cellStyle.barNegativeColor ?? '#ef5350');
						const bw = Math.floor(innerW * horizontalPixelRatio * Math.abs(t));
						const bh = Math.max(1, Math.floor((cellH * 0.35) * verticalPixelRatio));
						const bx = barAlignX(
							t,
							innerLeft * horizontalPixelRatio,
							innerRight * horizontalPixelRatio,
							bw,
							options.barAlignMode
						);
						const by = (cellTop + cellH * 0.5) * verticalPixelRatio - bh * 0.5;
						ctx.fillStyle = barFill;
						ctx.fillRect(bx, by, bw, bh);
					}

					const outline = cellStyle.cellOutline;
					if (outline !== undefined) {
						const lw = Math.max(1, outline.widthPx * Math.min(horizontalPixelRatio, verticalPixelRatio));
						const inset = lw * 0.5;
						ctx.save();
						ctx.strokeStyle = outline.color;
						ctx.lineWidth = lw;
						ctx.strokeRect(
							x1b + inset,
							y1b + inset,
							Math.max(0, x2b - x1b - lw),
							Math.max(0, y2b - y1b - lw)
						);
						ctx.restore();
					}
				}

				const cxCss = (colLeft + colRight) * 0.5;
				const cyCss = (cellTop + cellBottom) * 0.5;
				const overlayId = topFootprintOverlayId(col.cellOverlays);
				const objectId = buildFootprintObjectId({
					logicalBarIndex: bar.time,
					price: band.row.price,
					metricId: col.metricId,
					segment: slot.segment,
					overlayId,
				});
				nextHits.push({
					x1: colLeft,
					y1: cellTop,
					x2: colRight,
					y2: cellBottom,
					cx: cxCss,
					cy: cyCss,
					objectId,
				});
			}
		}

		if (!skipDraw && options.candleZOrder === 'outlineFront') {
			this._drawCandleChrome(scope, centerCssX, slotBitmap, d, options, priceToCoord);
		}

		if (!skipDraw) {
			this._drawCorrectionFlashOverlay(scope, d, options, columnSlots, bands);
		}
	}

	private _correctionFlashAlphaForTime(time: unknown, options: HoneycombSeriesOptions): number {
		if (options.correctionFlash !== 'subtle') {
			return 0;
		}
		const start = this._flashStartMsByTime.get(time);
		if (start === undefined) {
			return 0;
		}
		const elapsed = footprintCorrectionFlashNowMs() - start;
		if (elapsed >= CORRECTION_FLASH_DURATION_MS) {
			return 0;
		}
		return 1 - elapsed / CORRECTION_FLASH_DURATION_MS;
	}

	private _pruneExpiredFlash(now: number): void {
		for (const [t, start] of this._flashStartMsByTime) {
			if (now - start >= CORRECTION_FLASH_DURATION_MS) {
				this._flashStartMsByTime.delete(t);
			}
		}
	}

	private _advanceCorrectionFlashOnRevisions(): void {
		const data = this._data;
		const options = this._options;
		if (data === null || options === null || data.visibleRange === null) {
			return;
		}
		const now = footprintCorrectionFlashNowMs();
		this._pruneExpiredFlash(now);
		const vr = data.visibleRange;
		for (let i = vr.from; i < vr.to; i++) {
			const bar = data.bars[i];
			if (bar === undefined) {
				continue;
			}
			const d = bar.originalData;
			if (!isEnrichedCandle(d)) {
				continue;
			}
			const rev = d.revision;
			if (typeof rev !== 'number' || !Number.isFinite(rev)) {
				continue;
			}
			const t = d.time;
			const prev = this._lastRevisionForFlash.get(t);
			if (
				options.correctionFlash === 'subtle' &&
				footprintMotionFlashAllowed() &&
				prev !== undefined &&
				rev > prev
			) {
				this._flashStartMsByTime.set(t, now);
			}
			this._lastRevisionForFlash.set(t, rev);
		}
	}

	private _drawCorrectionFlashOverlay(
		scope: BitmapCoordinatesRenderingScope,
		d: EnrichedCandle<Time>,
		options: HoneycombSeriesOptions,
		columnSlots: readonly FootprintColumnCssSlot[],
		bands: readonly RowVerticalBand[]
	): void {
		const alpha = this._correctionFlashAlphaForTime(d.time, options);
		if (alpha <= 0 || bands.length === 0 || columnSlots.length === 0) {
			return;
		}
		let x1 = Infinity;
		let x2 = -Infinity;
		let y1 = Infinity;
		let y2 = -Infinity;
		for (const s of columnSlots) {
			x1 = Math.min(x1, s.colLeftCss);
			x2 = Math.max(x2, s.colRightCss);
		}
		for (const b of bands) {
			y1 = Math.min(y1, b.topPx, b.bottomPx);
			y2 = Math.max(y2, b.topPx, b.bottomPx);
		}
		if (!(x1 < x2) || !(y1 < y2)) {
			return;
		}
		const { horizontalPixelRatio, verticalPixelRatio, context: ctx } = scope;
		const x1b = Math.round(x1 * horizontalPixelRatio);
		const x2b = Math.round(x2 * horizontalPixelRatio);
		const y1b = Math.round(y1 * verticalPixelRatio);
		const y2b = Math.round(y2 * verticalPixelRatio);
		ctx.fillStyle = `rgba(255, 204, 128, ${0.14 * alpha})`;
		ctx.fillRect(x1b, y1b, Math.max(1, x2b - x1b), Math.max(1, y2b - y1b));
	}

	private _drawImpl(scope: BitmapCoordinatesRenderingScope, priceToCoord: PriceToCoordinateConverter): void {
		const data = this._data;
		const options = this._options;
		const nextHits: FootprintHitCell[] = [];
		if (data === null || options === null || data.visibleRange === null) {
			this._hitCells = [];
			return;
		}

		const { horizontalPixelRatio, bitmapSize } = scope;
		const { from, to } = data.visibleRange;

		const windowMax = this._resolveWindowMax(data, options, from, to);

		const effectiveBarSpacing = data.barSpacing * Math.max(1, data.conflationFactor);
		const slotBitmap = alignBarWidth(optimalCandlestickWidth(effectiveBarSpacing, horizontalPixelRatio), horizontalPixelRatio);
		const slotCss = slotBitmap / horizontalPixelRatio;

		const spacingSig = `${from}|${to}|${slotCss}|${effectiveBarSpacing}|${options.barMetricScope}|${options.layoutDirection}|${options.candleZOrder}|${String(options.bodyVisible)}|${String(options.wicksVisible)}|bam:${options.barAlignMode}|cc:${candleStyleLayoutSig(options)}|${colorRulesLayoutSig(options)}|co:${cellOverlaysLayoutSig(options)}|lod:${String(options.lodOmitNumberGlyphs)}|lodm:${String(options.minFontPx)}|lodM:${String(options.maxFontPx)}|cf:${options.correctionFlash}|hlr:${String(options.honeycombLayoutRevision ?? '')}`;
		if (this._cachedSpacingSig !== spacingSig) {
			this._barFpByCandleTime.clear();
			this._cachedSpacingSig = spacingSig;
		}

		for (let i = from; i < to; i++) {
			const bar = data.bars[i];
			if (bar === undefined) {
				continue;
			}
			const d = bar.originalData;
			if (!isEnrichedCandle(d)) {
				continue;
			}

			const fpNow = barFootprintFingerprint(d, options);
			const skipDraw =
				options.barMetricScope === 'perBar' && this._barFpByCandleTime.get(d.time) === fpNow;

			this._renderOneVisibleBar(
				{ scope, bar, d, options, slotCss, slotBitmap, skipDraw, windowMax, priceToCoord },
				nextHits
			);

			this._barFpByCandleTime.set(d.time, fpNow);
		}

		void bitmapSize;
		this._hitCells = nextHits;
	}

	private _drawCandleChrome(
		scope: BitmapCoordinatesRenderingScope,
		centerCssX: number,
		slotBitmap: number,
		d: EnrichedCandle<Time>,
		options: HoneycombSeriesOptions,
		priceToCoord: PriceToCoordinateConverter
	): void {
		if (!options.bodyVisible && !options.wicksVisible) {
			return;
		}
		const { horizontalPixelRatio, verticalPixelRatio, context: ctx } = scope;
		const yO = priceToCoord(d.open);
		const yH = priceToCoord(d.high);
		const yL = priceToCoord(d.low);
		const yC = priceToCoord(d.close);
		if (yO === null || yH === null || yL === null || yC === null) {
			return;
		}
		const xMid = Math.round(centerCssX * horizontalPixelRatio);
		const xLeft = Math.round((centerCssX - slotBitmap / horizontalPixelRatio * 0.35) * horizontalPixelRatio);
		const xRight = Math.round((centerCssX + slotBitmap / horizontalPixelRatio * 0.35) * horizontalPixelRatio);
		const top = Math.round(Math.min(yH, yL) * verticalPixelRatio);
		const bottom = Math.round(Math.max(yH, yL) * verticalPixelRatio);
		const bodyTop = Math.round(Math.min(yO, yC) * verticalPixelRatio);
		const bodyBot = Math.round(Math.max(yO, yC) * verticalPixelRatio);
		const bull = d.close >= d.open;
		const wickColor = bull
			? (options.candleStyle.bullWickColor ?? options.candleStyle.wickColor)
			: (options.candleStyle.bearWickColor ?? options.candleStyle.wickColor);

		ctx.strokeStyle = wickColor;
		ctx.lineWidth = Math.max(1, Math.floor(horizontalPixelRatio));
		if (options.wicksVisible) {
			if (options.bodyVisible) {
				if (top < bodyTop) {
					ctx.beginPath();
					ctx.moveTo(xMid, top);
					ctx.lineTo(xMid, bodyTop);
					ctx.stroke();
				}
				if (bodyBot < bottom) {
					ctx.beginPath();
					ctx.moveTo(xMid, bodyBot);
					ctx.lineTo(xMid, bottom);
					ctx.stroke();
				}
			} else {
				ctx.beginPath();
				ctx.moveTo(xMid, top);
				ctx.lineTo(xMid, bottom);
				ctx.stroke();
			}
		}
		if (options.bodyVisible) {
			ctx.fillStyle = bull ? options.candleStyle.bullBodyFill : options.candleStyle.bearBodyFill;
			ctx.strokeStyle = bull
				? options.candleStyle.bullBodyBorder
				: options.candleStyle.bearBodyBorder;
			ctx.fillRect(xLeft, bodyTop, xRight - xLeft, Math.max(1, bodyBot - bodyTop));
			ctx.strokeRect(xLeft, bodyTop, xRight - xLeft, Math.max(1, bodyBot - bodyTop));
		}
	}
}
