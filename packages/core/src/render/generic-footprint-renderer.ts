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

import { buildGenericFootprintObjectId } from '../interaction/hit-id-codec.js';
import type { GenericFootprintSlot, GenericFootprintTheme } from '../generic-footprint/model.js';
import { buildRowVerticalBands } from '../layout/row-geometry.js';
import { optimalCandlestickWidth } from '../layout/optimal-column-width.js';
import type { GenericFootprintSeriesOptions } from '../options/generic-footprint-series-options.js';
import type { EnrichedCandle, FootprintLevelRow } from '../schema/types.js';
import { formatNumberCellText } from './format-cell-text.js';

type HistogramSlot = Extract<GenericFootprintSlot, { role: 'histogram' }>;
type NumberSlot = Extract<GenericFootprintSlot, { role: 'number' }>;
type HeatmapSlot = Extract<GenericFootprintSlot, { role: 'heatmapCell' }>;

function slotPrimaryMetricId(slot: GenericFootprintSlot): string {
	return slot.metricId;
}

export function shouldHideGenericSlotForLod(
	slot: GenericFootprintSlot,
	options: Pick<GenericFootprintSeriesOptions, 'lodHideRatioMinSlotAreaPx' | 'lodHideNumberMinSlotAreaPx'>,
	slotAreaWCss: number
): boolean {
	if (slot.role === 'ratio' && slotAreaWCss < options.lodHideRatioMinSlotAreaPx) {
		return true;
	}
	if (slot.role === 'number' && slotAreaWCss < options.lodHideNumberMinSlotAreaPx) {
		return true;
	}
	return false;
}

interface GenericHitCell {
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
	readonly cx: number;
	readonly cy: number;
	readonly objectId: string;
}

function clamp01(t: number): number {
	if (!Number.isFinite(t)) {
		return 0;
	}
	return Math.max(0, Math.min(1, t));
}

/**
 * Normalized fill for one heatmap cell (ADR-0004 `normalize: barMaxAbs` — `denom` is max |metric| in the bar).
 */
function heatmapCellBackground(slot: HeatmapSlot, _theme: GenericFootprintTheme, value: number, denom: number): string {
	const d = denom > 0 && Number.isFinite(denom) ? denom : 0;
	const t = d > 0 ? clamp01(Math.abs(value) / d) : 0;
	const mode = slot.colorMode ?? 'sequential';
	if (mode === 'diverging') {
		const s = d > 0 ? clamp01(Math.abs(value) / d) : 0;
		if (value >= 0) {
			return `hsl(145, 52%, ${24 + 40 * s}%)`;
		}
		return `hsl(350, 58%, ${30 + 36 * s}%)`;
	}
	if (mode === 'valueSecondary') {
		return `hsl(205, 72%, ${26 + 34 * t}%)`;
	}
	return `hsl(210, 70%, ${22 + 40 * t}%)`;
}

function heatmapIntensity(value: number, denom: number): number {
	const d = denom > 0 && Number.isFinite(denom) ? denom : 0;
	return d > 0 ? clamp01(Math.abs(value) / d) : 0;
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

function gridStep(pMin: number, pMax: number): number {
	const span = pMax - pMin;
	if (span <= 0.75) {
		return 0.125;
	}
	if (span <= 2) {
		return 0.25;
	}
	if (span <= 5) {
		return 0.5;
	}
	return 1;
}

function readMetric(values: Readonly<Record<string, number>>, id: string): number {
	const v = values[id];
	return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function maxAbsMetricInBar(levels: readonly FootprintLevelRow[], metricId: string): number {
	let m = 0;
	for (const r of levels) {
		m = Math.max(m, Math.abs(readMetric(r.values, metricId)));
	}
	return m;
}

function pocRowIndexByMetric(sortedHighFirst: readonly FootprintLevelRow[], metricId: string): number {
	if (sortedHighFirst.length === 0) {
		return 0;
	}
	let best = Math.abs(readMetric(sortedHighFirst[0]!.values, metricId));
	let idx = 0;
	for (let i = 1; i < sortedHighFirst.length; i++) {
		const v = Math.abs(readMetric(sortedHighFirst[i]!.values, metricId));
		if (v > best) {
			best = v;
			idx = i;
		}
	}
	return idx;
}

function resolvePocRowIndex(
	options: GenericFootprintSeriesOptions,
	sortedHighFirst: readonly FootprintLevelRow[]
): number | null {
	const id = options.pocMetricId?.trim();
	if (id === undefined || id === '') {
		// Require explicit user intent for POC highlighting.
		return null;
	}
	return pocRowIndexByMetric(sortedHighFirst, id);
}

function histogramColor(slot: HistogramSlot, theme: GenericFootprintTheme): string {
	if (slot.histogramColor !== undefined) {
		return slot.histogramColor;
	}
	if (slot.grow === 'left') {
		return theme.histogramLeft;
	}
	if (slot.grow === 'center') {
		return theme.histogramLeft;
	}
	return theme.histogramRight;
}

function histogramBarFill(slot: HistogramSlot, theme: GenericFootprintTheme, value: number): string {
	if (slot.colorizeBySign === true) {
		if (value > 0) {
			return theme.histogramSignPositive;
		}
		if (value < 0) {
			return theme.histogramSignNegative;
		}
		return theme.histogramSignNeutral;
	}
	return histogramColor(slot, theme);
}

function sumMetricInLevels(levels: readonly FootprintLevelRow[], metricId: string): number {
	let t = 0;
	for (const row of levels) {
		t += readMetric(row.values, metricId);
	}
	return t;
}

function barSummaryTextColor(theme: GenericFootprintTheme, value: number, colorBySign: boolean): string {
	if (!colorBySign) {
		return theme.textPrimary;
	}
	if (value > 0) {
		return theme.numberPositive;
	}
	if (value < 0) {
		return theme.numberNegative;
	}
	return theme.numberZero;
}

function numberSlotTextColor(theme: GenericFootprintTheme, value: number, slot: NumberSlot): string {
	if (slot.colorBySign === true) {
		return barSummaryTextColor(theme, value, true);
	}
	return theme.textPrimary;
}

function formatHistogramGlyph(value: number): string {
	if (!Number.isFinite(value)) {
		return '';
	}
	return String(Math.round(value));
}

function scaleMonoFont(fontCss: string, vpr: number): string {
	const m = /^(\d+(?:\.\d+)?)px/.exec(fontCss);
	if (m === null) {
		return fontCss;
	}
	const px = Math.max(5, Math.round(Number.parseFloat(m[1]!) * vpr));
	return fontCss.replace(/^(\d+(?:\.\d+)?)px/, `${String(px)}px`);
}

function clampGenericFontPx(rawPx: number, minPx: number, maxPx: number): number {
	const lo = Math.max(5, Math.min(minPx, maxPx));
	const hi = Math.max(lo, Math.max(minPx, maxPx));
	return Math.max(lo, Math.min(rawPx, hi));
}

function scaleMonoFontAtPx(fontCss: string, cssPx: number, vpr: number): string {
	const m = /^(\d+(?:\.\d+)?)px/.exec(fontCss);
	if (m === null) {
		return scaleMonoFont(fontCss, vpr);
	}
	const px = Math.max(5, Math.round(cssPx * vpr));
	return fontCss.replace(/^(\d+(?:\.\d+)?)px/, `${String(px)}px`);
}

function formatRatio(numerator: number, denominator: number): string {
	if (!Number.isFinite(denominator) || denominator === 0) {
		return '—';
	}
	const r = numerator / denominator;
	if (!Number.isFinite(r)) {
		return '—';
	}
	if (Math.abs(r) >= 100) {
		return r.toFixed(0);
	}
	if (Math.abs(r) >= 10) {
		return r.toFixed(1);
	}
	return r.toFixed(2);
}

function genericBarAlignX(
	mode:
		| 'positiveLeftNegativeRight'
		| 'positiveRightNegativeLeft'
		| 'centered'
		| 'leftOnly'
		| 'rightOnly'
		| undefined,
	value: number,
	left: number,
	right: number,
	width: number
): number {
	if (mode === 'leftOnly') {
		return left;
	}
	if (mode === 'rightOnly') {
		return right - width;
	}
	if (mode === 'centered') {
		return (left + right) * 0.5 - width * 0.5;
	}
	if (mode === 'positiveRightNegativeLeft') {
		return value >= 0 ? right - width : left;
	}
	return value >= 0 ? left : right - width;
}

function visiblePriceBounds(
	data: PaneRendererCustomData<Time, EnrichedCandle<Time>>,
	from: number,
	to: number
): { pMin: number; pMax: number } {
	let pMin = Infinity;
	let pMax = -Infinity;
	for (let i = from; i < to; i++) {
		const b = data.bars[i];
		if (b === undefined) {
			continue;
		}
		const d = b.originalData;
		if (!isEnrichedCandle(d)) {
			continue;
		}
		pMin = Math.min(pMin, d.low);
		pMax = Math.max(pMax, d.high);
	}
	if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) {
		return { pMin: 0, pMax: 1 };
	}
	return { pMin, pMax };
}

export class GenericFootprintRenderer implements ICustomSeriesPaneRenderer {
	private _data: PaneRendererCustomData<Time, EnrichedCandle<Time>> | null = null;
	private _options: GenericFootprintSeriesOptions | null = null;
	/** Bumps when `honeycombLayoutRevision` changes so future per-bar/text caches can reset (CT-P1-13). */
	private _layoutDependencyGeneration = 0;
	private _hitCells: GenericHitCell[] = [];

	public update(data: PaneRendererCustomData<Time, EnrichedCandle<Time>>, options: GenericFootprintSeriesOptions): void {
		this._data = data;
		const prevRev = this._options?.honeycombLayoutRevision;
		const nextRev = options.honeycombLayoutRevision;
		if (prevRev !== nextRev) {
			this._layoutDependencyGeneration += 1;
		}
		this._options = options;
		this._hitCells = [];
	}

	/** Drop renderer caches (e.g. series teardown). */
	public clearRendererState(): void {
		this._data = null;
		this._options = null;
		this._hitCells = [];
		this._layoutDependencyGeneration = 0;
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
		for (let i = this._hitCells.length - 1; i >= 0; i--) {
			const cell = this._hitCells[i]!;
			if (x >= cell.x1 && x <= cell.x2 && y >= cell.y1 && y <= cell.y2) {
				const dx = x - cell.cx;
				const dy = y - cell.cy;
				return {
					distance: Math.sqrt(dx * dx + dy * dy),
					objectId: cell.objectId,
					type: 'custom',
				};
			}
		}
		return null;
	}

	private _drawImpl(scope: BitmapCoordinatesRenderingScope, priceToCoord: PriceToCoordinateConverter): void {
		const data = this._data;
		const options = this._options;
		if (data === null || options === null || data.visibleRange === null) {
			this._hitCells = [];
			return;
		}
		const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr, bitmapSize } = scope;
		const { from, to } = data.visibleRange;
		const nextHits: GenericHitCell[] = [];

		const { pMin, pMax } = visiblePriceBounds(data, from, to);

		if (options.showPriceGrid) {
			ctx.save();
			ctx.strokeStyle = options.theme.gridColor;
			ctx.lineWidth = Math.max(1, Math.floor(hpr));
			ctx.setLineDash([...options.theme.gridDash]);
			const step = gridStep(pMin, pMax);
			for (let p = Math.ceil(pMin / step) * step; p <= pMax + 1e-9; p += step) {
				const y = priceToCoord(p);
				if (y === null) {
					continue;
				}
				const yb = Math.round(y * vpr);
				ctx.beginPath();
				ctx.moveTo(0, yb);
				ctx.lineTo(bitmapSize.width, yb);
				ctx.stroke();
			}
			ctx.restore();
		}

		const effectiveBarSpacing = data.barSpacing * Math.max(1, data.conflationFactor);
		const slotBitmap = alignBarWidth(optimalCandlestickWidth(effectiveBarSpacing, hpr), hpr);
		const slotCss = slotBitmap / hpr;

		for (let i = from; i < to; i++) {
			const bar = data.bars[i];
			if (bar === undefined) {
				continue;
			}
			const d = bar.originalData;
			if (!isEnrichedCandle(d)) {
				continue;
			}
			this._drawOneBar(scope, bar.x, slotCss, d, options, priceToCoord, i, nextHits);
		}
		this._hitCells = nextHits;
	}

	private _pushGenericHit(
		nextHits: GenericHitCell[],
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		objectId: string
	): void {
		const cx = (x1 + x2) * 0.5;
		const cy = (y1 + y2) * 0.5;
		nextHits.push({ x1, y1, x2, y2, cx, cy, objectId });
	}

	private _drawOneBar(
		scope: BitmapCoordinatesRenderingScope,
		centerCssX: number,
		slotCss: number,
		d: EnrichedCandle<Time>,
		options: GenericFootprintSeriesOptions,
		priceToCoord: PriceToCoordinateConverter,
		logicalIndex: number,
		nextHits: GenericHitCell[]
	): void {
		const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
		const theme = options.theme;
		const f = Math.max(0, Math.min(0.35, options.candleStripFraction));
		const gap = 0;
		const slotAreaW = Math.max(24, slotCss * (1 - f) - gap);
		const candleW = Math.max(4, slotCss - slotAreaW - gap);
		const boxLeft = centerCssX - slotCss * 0.5;
		const candleGapAfterCss = Math.max(0, Number(options.candleGapAfterCss ?? 0));
		const candleInsetLeftCss = Math.max(0, Number(options.candleInsetLeftCss ?? 0));
		const candleInsetRightCss = Math.max(0, Number(options.candleInsetRightCss ?? 0));

		const gapAfterBySlot = options.slots.map((s, i) =>
			i < options.slots.length - 1 ? Math.max(0, Number((s as { gapAfterCss?: number }).gapAfterCss ?? 0)) : 0
		);
		const totalTrackGap = gapAfterBySlot.reduce((a, b) => a + b, 0);
		const slotDrawableW = Math.max(4, slotAreaW - totalTrackGap);
		const wSum = options.slotWeights.reduce((a, b) => a + b, 0) || 1;
		const slotWidths = options.slotWeights.map(w => (slotDrawableW * w) / wSum);
		const rawLaneIndex = options.candleLaneIndex ?? options.slots.length;
		const laneIndex = Math.max(0, Math.min(options.slots.length, Math.floor(rawLaneIndex)));
		let leftSlotW = 0;
		for (let i = 0; i < laneIndex; i++) {
			leftSlotW += slotWidths[i] ?? 0;
		}
		const candleLeftCss = boxLeft + leftSlotW;
		const slotXs: number[] = [];
		let sx = boxLeft;
		for (let s = 0; s < slotWidths.length; s++) {
			const sw = slotWidths[s] ?? 0;
			slotXs.push(s < laneIndex ? sx : sx + candleW + gap + candleGapAfterCss);
			sx += sw + (gapAfterBySlot[s] ?? 0);
		}
		const candleDrawLeftCss = candleLeftCss + candleInsetLeftCss;
		const candleDrawW = Math.max(1, candleW - candleInsetLeftCss - candleInsetRightCss);

		const toY = (price: number): number | null => priceToCoord(price);

		const slotBlockCenterCss = boxLeft + slotAreaW * 0.5;

		const bands = buildRowVerticalBands(d, d.levels, toY);
		if (bands.length === 0) {
			if (options.candleLaneVisible !== false) {
				this._drawCandleStrip({
					ctx,
					hpr,
					vpr,
					d,
					theme,
					candleLeftCss: candleDrawLeftCss,
					candleWCss: candleDrawW,
					priceToCoord,
				});
			}
			this._drawBarSummaryLines({
				ctx,
				hpr,
				vpr,
				theme,
				centerXCss: slotBlockCenterCss,
				d,
				options,
				priceToCoord,
				slotAreaWCss: slotAreaW,
			});
			return;
		}

		const sortedHigh = [...d.levels].sort((a, b) => b.price - a.price);
		const maxByMetric = new Map<string, number>();
		for (const sl of options.slots) {
			if (shouldHideGenericSlotForLod(sl, options, slotAreaW)) {
				continue;
			}
			if (sl.role === 'histogram' || sl.role === 'heatmapCell' || sl.role === 'bar') {
				maxByMetric.set(sl.metricId, maxAbsMetricInBar(d.levels, sl.metricId));
			}
		}
		const pocI = resolvePocRowIndex(options, sortedHigh);
		const pocPrice = pocI === null ? undefined : sortedHigh[pocI]?.price;

		const xSlotsCss = slotXs[0] ?? boxLeft;
		const blockWCss = slotWidths.reduce((a, b) => a + b, 0);

		for (const band of bands) {
			const cellTop = Math.min(band.topPx, band.bottomPx);
			const cellBottom = Math.max(band.topPx, band.bottomPx);
			const cellH = cellBottom - cellTop;
			if (cellH < options.minCellHeightPx * 0.35) {
				continue;
			}

			const row = band.row;
			for (let s = 0; s < options.slots.length; s++) {
				const slot = options.slots[s]!;
				if (shouldHideGenericSlotForLod(slot, options, slotAreaW)) {
					continue;
				}
				const slotLeftCss = slotXs[s] ?? boxLeft;
				const sw = slotWidths[s] ?? 0;
				const insetLeftCss = Math.max(0, Number((slot as { insetLeftCss?: number }).insetLeftCss ?? 0));
				const insetRightCss = Math.max(0, Number((slot as { insetRightCss?: number }).insetRightCss ?? 0));
				const slotInnerLeftCss = slotLeftCss + insetLeftCss;
				const slotInnerW = Math.max(1, sw - insetLeftCss - insetRightCss);
				// React to both vertical row height and horizontal slot width so time-scale zoom-out
				// can reduce text size as columns get tighter.
				const rawFromHeightPx = cellH * 0.72;
				const rawFromWidthPx = slotInnerW * 0.36;
				const rawFontPx = Math.max(6, Math.min(rawFromHeightPx, rawFromWidthPx));
				const fontPxCss = clampGenericFontPx(rawFontPx, options.minFontPx, options.maxFontPx);
				const colOvs = options.columnOverlays?.[s];
				if (colOvs !== undefined && colOvs.length > 0) {
					for (const ov of colOvs) {
						if (ov.kind === 'cellBand') {
							const alpha = ov.opacity ?? 1;
							if (alpha > 0) {
								ctx.save();
								ctx.globalAlpha = alpha;
								ctx.fillStyle = ov.fill;
								const x0b = Math.round(slotInnerLeftCss * hpr);
								const y0b = Math.round(cellTop * vpr);
								const w0b = Math.max(1, Math.round(slotInnerW * hpr));
								const h0b = Math.max(1, Math.round(cellH * vpr));
								ctx.fillRect(x0b, y0b, w0b, h0b);
								ctx.restore();
							}
						}
					}
				}
				if (slot.role === 'histogram') {
					const v = readMetric(row.values, slot.metricId);
					const denom = maxByMetric.get(slot.metricId) ?? 0;
					this._drawHistogramSlotCss({
						ctx,
						hpr,
						vpr,
						slot,
						theme,
						x: slotInnerLeftCss,
						y0: cellTop,
						w: slotInnerW,
						h: cellH,
						value: v,
						denom,
						showValues: options.histogramShowValues,
						fontPxCss,
					});
				} else if (slot.role === 'number') {
					const v = readMetric(row.values, slot.metricId);
					this._drawNumberSlotCss({
						ctx,
						hpr,
						vpr,
						theme,
						slot,
						x: slotInnerLeftCss,
						y0: cellTop,
						w: slotInnerW,
						h: cellH,
						value: v,
						fontPxCss,
					});
				} else if (slot.role === 'heatmapCell') {
					const v = readMetric(row.values, slot.metricId);
					const denom = maxByMetric.get(slot.metricId) ?? 0;
					this._drawHeatmapSlotCss({
						ctx,
						hpr,
						vpr,
						theme,
						slot,
						x: slotInnerLeftCss,
						y0: cellTop,
						w: slotInnerW,
						h: cellH,
						value: v,
						denom,
						fontPxCss,
					});
				} else if (slot.role === 'ratio') {
					const num = readMetric(row.values, slot.metricId);
					const den = readMetric(row.values, slot.ratioDenominatorId);
					this._drawRatioSlotCss({
						ctx,
						hpr,
						vpr,
						theme,
						x: slotInnerLeftCss,
						y0: cellTop,
						w: slotInnerW,
						h: cellH,
						numerator: num,
						denominator: den,
						fontPxCss,
					});
				} else {
					const v = readMetric(row.values, slot.metricId);
					const denom = maxByMetric.get(slot.metricId) ?? 0;
					const t = denom > 0 ? Math.max(-1, Math.min(1, v / denom)) : 0;
					const bw = Math.max(1, Math.floor(slotInnerW * hpr * Math.abs(t)));
					const bh = Math.max(1, Math.floor((cellH * 0.38) * vpr));
					const xL = slotInnerLeftCss * hpr;
					const xR = (slotInnerLeftCss + slotInnerW) * hpr;
					const bx = genericBarAlignX(slot.barAlignMode, t, xL, xR, bw);
					const by = (cellTop + cellH * 0.5) * vpr - bh * 0.5;
					ctx.fillStyle = t >= 0
						? (slot.barPositiveColor ?? '#26a69a')
						: (slot.barNegativeColor ?? '#ef5350');
					ctx.fillRect(bx, by, bw, bh);
				}
				const mId = slotPrimaryMetricId(slot);
				const baseId = buildGenericFootprintObjectId({
					logicalBarIndex: logicalIndex,
					price: row.price,
					slotIndex: s,
					overlayId: '__cell__',
					metricId: mId,
				});
				this._pushGenericHit(nextHits, slotInnerLeftCss, cellTop, slotInnerLeftCss + slotInnerW, cellBottom, baseId);
				if (colOvs !== undefined) {
					for (const ov of colOvs) {
						if (ov.kind === 'cellBand') {
							const oid = buildGenericFootprintObjectId({
								logicalBarIndex: logicalIndex,
								price: row.price,
								slotIndex: s,
								overlayId: ov.id,
								metricId: mId,
							});
							this._pushGenericHit(nextHits, slotInnerLeftCss, cellTop, slotInnerLeftCss + slotInnerW, cellBottom, oid);
						}
					}
				}
			}

			const y1b = Math.round(cellBottom * vpr);
			ctx.strokeStyle = theme.cellSeparator;
			ctx.lineWidth = Math.max(1, Math.floor(hpr));
			ctx.beginPath();
			ctx.moveTo(Math.round(xSlotsCss * hpr), y1b);
			ctx.lineTo(Math.round((xSlotsCss + blockWCss) * hpr), y1b);
			ctx.stroke();

			if (pocPrice !== undefined && row.price === pocPrice) {
				const y0b = Math.round(cellTop * vpr);
				const x0b = Math.round(xSlotsCss * hpr);
				const wB = Math.round(blockWCss * hpr);
				const hB = Math.max(1, y1b - y0b);
				ctx.save();
				ctx.strokeStyle = theme.pocBorder;
				ctx.lineWidth = Math.max(2, Math.floor(hpr * 2));
				ctx.strokeRect(x0b + 0.5, y0b + 0.5, Math.max(1, wB - 1), Math.max(1, hB - 1));
				ctx.restore();
			}

			for (let s = 1; s < options.slots.length; s++) {
				const vx = slotXs[s] ?? boxLeft;
				const xb = Math.round(vx * hpr);
				ctx.strokeStyle = 'rgba(255,255,255,0.08)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(xb, Math.round(cellTop * vpr));
				ctx.lineTo(xb, y1b);
				ctx.stroke();
			}
		}

		if (options.candleLaneVisible !== false) {
			this._drawCandleStrip({
				ctx,
				hpr,
				vpr,
				d,
				theme,
				candleLeftCss: candleDrawLeftCss,
				candleWCss: candleDrawW,
				priceToCoord,
			});
		}

		this._drawBarSummaryLines({
			ctx,
			hpr,
			vpr,
			theme,
			centerXCss: slotBlockCenterCss,
			d,
			options,
			priceToCoord,
			slotAreaWCss: slotAreaW,
		});
	}

	private _drawBarSummaryLines(args: {
		ctx: CanvasRenderingContext2D;
		hpr: number;
		vpr: number;
		theme: GenericFootprintTheme;
		centerXCss: number;
		d: EnrichedCandle<Time>;
		options: GenericFootprintSeriesOptions;
		priceToCoord: PriceToCoordinateConverter;
		slotAreaWCss: number;
	}): void {
		const { ctx, hpr, vpr, theme, centerXCss, d, options, priceToCoord, slotAreaWCss } = args;
		const headers = options.barHeaderLines;
		const footers = options.barFooterLines;
		if (
			(headers === undefined || headers.length === 0) &&
			(footers === undefined || footers.length === 0)
		) {
			return;
		}
		if (slotAreaWCss < options.lodSummaryMinSlotAreaPx) {
			return;
		}
		const yH = priceToCoord(d.high);
		const yL = priceToCoord(d.low);
		if (yH === null || yL === null) {
			return;
		}
		const gap = options.barSummaryLabelGapCss;
		const lineH = options.barSummaryLineHeightCss;
		const levels = d.levels;
		const xPx = Math.round(centerXCss * hpr);

		ctx.save();

		if (headers !== undefined && headers.length > 0) {
			ctx.font = scaleMonoFont(theme.headerFont, vpr);
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			for (let i = 0; i < headers.length; i++) {
				const line = headers[i]!;
				const v = sumMetricInLevels(levels, line.metricId);
				const yCss = yH - gap - lineH * 0.5 - i * lineH;
				ctx.fillStyle = barSummaryTextColor(theme, v, line.colorBySign);
				ctx.fillText(String(Math.round(v)), xPx, Math.round(yCss * vpr));
			}
		}

		if (footers !== undefined && footers.length > 0) {
			ctx.font = scaleMonoFont(theme.footerFont, vpr);
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			for (let i = 0; i < footers.length; i++) {
				const line = footers[i]!;
				const v = sumMetricInLevels(levels, line.metricId);
				const yCss = yL + gap + lineH * 0.5 + i * lineH;
				ctx.fillStyle = barSummaryTextColor(theme, v, line.colorBySign);
				ctx.fillText(String(Math.round(v)), xPx, Math.round(yCss * vpr));
			}
		}

		ctx.restore();
	}

	private _drawHistogramSlotCss(args: {
		ctx: CanvasRenderingContext2D;
		hpr: number;
		vpr: number;
		slot: HistogramSlot;
		theme: GenericFootprintTheme;
		x: number;
		y0: number;
		w: number;
		h: number;
		value: number;
		denom: number;
		showValues: boolean;
		fontPxCss: number;
	}): void {
		const { ctx, hpr, vpr, slot, theme, x, y0, w, h, value, denom, showValues, fontPxCss } = args;
		const tLin = denom > 0 ? Math.min(1, Math.abs(value) / denom) : 0;
		const gammaRaw = slot.histogramLengthGamma;
		const gamma =
			gammaRaw !== undefined && Number.isFinite(gammaRaw)
				? Math.max(0.25, Math.min(4, gammaRaw))
				: 1;
		const frac = Math.min(1, Math.pow(tLin, gamma));
		const maxFillRaw = slot.histogramMaxFillFrac;
		const maxFill =
			maxFillRaw !== undefined && Number.isFinite(maxFillRaw)
				? Math.max(0.05, Math.min(1, maxFillRaw))
				: 1;
		const bh = Math.max(1, h * 0.55);
		const by = y0 + (h - bh) * 0.5;
		const bw = Math.max(0, (w - 2) * frac * maxFill);
		ctx.fillStyle = histogramBarFill(slot, theme, value);
		const yT = Math.round(by * vpr);
		const yB = Math.round((by + bh) * vpr);
		const hB = Math.max(1, yB - yT);
		if (slot.grow === 'left') {
			const x1 = Math.round((x + w - 1) * hpr);
			const x0 = x1 - Math.round(bw * hpr);
			ctx.fillRect(x0, yT, Math.max(1, x1 - x0), hB);
		} else if (slot.grow === 'center') {
			const bwPx = Math.max(1, Math.round(bw * hpr));
			const cxPx = Math.round((x + w * 0.5) * hpr);
			const x0 = cxPx - Math.floor(bwPx / 2);
			ctx.fillRect(x0, yT, bwPx, hB);
		} else {
			const x0 = Math.round((x + 1) * hpr);
			ctx.fillRect(x0, yT, Math.max(1, Math.round(bw * hpr)), hB);
		}

		if (showValues) {
			const text = formatHistogramGlyph(value);
			if (text !== '') {
				const tx = Math.round((x + w * 0.5) * hpr);
				const ty = Math.round((by + bh * 0.5) * vpr);
				ctx.save();
				ctx.font = scaleMonoFontAtPx(theme.histogramValueFont ?? theme.numberFont, fontPxCss, vpr);
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.lineJoin = 'round';
				ctx.lineWidth = Math.max(2, 2 * hpr);
				ctx.strokeStyle = theme.histogramValueOutline ?? 'rgba(0,0,0,0.6)';
				ctx.strokeText(text, tx, ty);
				ctx.fillStyle = theme.histogramValueColor ?? 'rgba(252,252,255,0.96)';
				ctx.fillText(text, tx, ty);
				ctx.restore();
			}
		}
	}

	private _drawNumberSlotCss(args: {
		ctx: CanvasRenderingContext2D;
		hpr: number;
		vpr: number;
		theme: GenericFootprintTheme;
		slot: NumberSlot;
		x: number;
		y0: number;
		w: number;
		h: number;
		value: number;
		fontPxCss: number;
	}): void {
		const { ctx, hpr, vpr, theme, slot, x, y0, w, h, value, fontPxCss } = args;
		const x0 = Math.round(x * hpr);
		const y0b = Math.round(y0 * vpr);
		const w0 = Math.max(1, Math.round(w * hpr));
		const h0b = Math.max(1, Math.round(h * vpr));
		const bg = slot.cellBackground;
		ctx.save();
		if (bg !== undefined && bg !== '') {
			ctx.fillStyle = bg;
			ctx.fillRect(x0, y0b, w0, h0b);
		}
		ctx.font = scaleMonoFontAtPx(theme.numberFont, fontPxCss, vpr);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = numberSlotTextColor(theme, value, slot);
		const maxChars = Math.max(2, Math.floor(w / (fontPxCss * 0.55)));
		const text = formatNumberCellText(value, { maxChars });
		ctx.fillText(text, Math.round((x + w * 0.5) * hpr), Math.round((y0 + h * 0.5) * vpr));
		ctx.restore();
	}

	private _drawHeatmapSlotCss(args: {
		ctx: CanvasRenderingContext2D;
		hpr: number;
		vpr: number;
		theme: GenericFootprintTheme;
		slot: HeatmapSlot;
		x: number;
		y0: number;
		w: number;
		h: number;
		value: number;
		denom: number;
		fontPxCss: number;
	}): void {
		const { ctx, hpr, vpr, theme, slot, x, y0, w, h, value, denom, fontPxCss } = args;
		const pad = 1;
		const x0 = Math.round((x + pad) * hpr);
		const y0b = Math.round((y0 + pad) * vpr);
		const w0 = Math.max(1, Math.round((w - pad * 2) * hpr));
		const h0b = Math.max(1, Math.round((h - pad * 2) * vpr));
		ctx.save();
		if (typeof slot.heatmapColor === 'string' && slot.heatmapColor.trim() !== '') {
			ctx.globalAlpha = 0.2 + 0.8 * heatmapIntensity(value, denom);
			ctx.fillStyle = slot.heatmapColor;
			ctx.fillRect(x0, y0b, w0, h0b);
			ctx.globalAlpha = 1;
		} else {
			ctx.fillStyle = heatmapCellBackground(slot, theme, value, denom);
			ctx.fillRect(x0, y0b, w0, h0b);
		}
		ctx.strokeStyle = 'rgba(255,255,255,0.08)';
		ctx.lineWidth = 1;
		ctx.strokeRect(x0 + 0.5, y0b + 0.5, Math.max(0, w0 - 1), Math.max(0, h0b - 1));
		if (h * vpr >= 13) {
			ctx.font = scaleMonoFontAtPx(theme.numberFont, fontPxCss, vpr);
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = theme.textOnDark;
			ctx.fillText(String(Math.round(value)), Math.round((x + w * 0.5) * hpr), Math.round((y0 + h * 0.5) * vpr));
		}
		ctx.restore();
	}

	private _drawRatioSlotCss(args: {
		ctx: CanvasRenderingContext2D;
		hpr: number;
		vpr: number;
		theme: GenericFootprintTheme;
		x: number;
		y0: number;
		w: number;
		h: number;
		numerator: number;
		denominator: number;
		fontPxCss: number;
	}): void {
		const { ctx, hpr, vpr, theme, x, y0, w, h, numerator, denominator, fontPxCss } = args;
		const text = formatRatio(numerator, denominator);
		const r =
			denominator !== 0 && Number.isFinite(numerator) && Number.isFinite(denominator)
				? numerator / denominator
				: 0;
		ctx.save();
		ctx.font = scaleMonoFontAtPx(theme.numberFont, fontPxCss, vpr);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		if (r < 0) {
			ctx.fillStyle = '#ef9a9a';
		} else if (r > 0) {
			ctx.fillStyle = '#a5d6a7';
		} else {
			ctx.fillStyle = theme.textPrimary;
		}
		ctx.fillText(text, Math.round((x + w * 0.5) * hpr), Math.round((y0 + h * 0.5) * vpr));
		ctx.restore();
	}

	private _drawCandleStrip(args: {
		ctx: CanvasRenderingContext2D;
		hpr: number;
		vpr: number;
		d: EnrichedCandle<Time>;
		theme: GenericFootprintTheme;
		candleLeftCss: number;
		candleWCss: number;
		priceToCoord: PriceToCoordinateConverter;
	}): void {
		const { ctx, hpr, vpr, d, theme, candleLeftCss, candleWCss, priceToCoord } = args;
		const yH = priceToCoord(d.high);
		const yL = priceToCoord(d.low);
		if (yH === null || yL === null) {
			return;
		}
		const top = Math.min(yH, yL);
		const bot = Math.max(yH, yL);
		const hPx = Math.max(1, bot - top);
		const x0 = Math.round(candleLeftCss * hpr);
		const w0 = Math.max(2, Math.round(candleWCss * hpr));
		const y0b = Math.round(top * vpr);
		const h0b = Math.max(1, Math.round(hPx * vpr));

		ctx.save();
		ctx.fillStyle = theme.candleLaneBg;
		ctx.fillRect(x0, y0b, w0, h0b);
		ctx.strokeStyle = theme.candleLaneEdge;
		ctx.lineWidth = 1;
		ctx.strokeRect(x0 + 0.5, y0b + 0.5, Math.max(0, w0 - 1), Math.max(0, h0b - 1));
		ctx.restore();

		const yO = priceToCoord(d.open);
		const yC = priceToCoord(d.close);
		if (yO === null || yC === null) {
			return;
		}
		const xMid = x0 + w0 * 0.5;
		const xL = x0 + 1;
		const xR = x0 + w0 - 1;

		ctx.save();
		ctx.strokeStyle = theme.candleWick;
		ctx.lineWidth = Math.max(1, Math.floor(hpr));
		const bodyTop = Math.min(yO, yC);
		const bodyBot = Math.max(yO, yC);
		const wickTop = Math.round(yH * vpr);
		const wickBottom = Math.round(yL * vpr);
		const bw = Math.max(2, xR - xL);
		const bt = Math.round(bodyTop * vpr);
		const bb = Math.round(bodyBot * vpr);
		if (wickTop < bt) {
			ctx.beginPath();
			ctx.moveTo(xMid, wickTop);
			ctx.lineTo(xMid, bt);
			ctx.stroke();
		}
		if (bb < wickBottom) {
			ctx.beginPath();
			ctx.moveTo(xMid, bb);
			ctx.lineTo(xMid, wickBottom);
			ctx.stroke();
		}
		const bull = d.close >= d.open;
		ctx.fillStyle = bull ? theme.candleBull : theme.candleBear;
		ctx.strokeStyle = bull ? theme.candleBullStroke : theme.candleBearStroke;
		ctx.fillRect(xL, bt, bw, Math.max(1, bb - bt));
		ctx.strokeRect(xL, bt, bw, Math.max(1, bb - bt));
		ctx.restore();
	}
}
