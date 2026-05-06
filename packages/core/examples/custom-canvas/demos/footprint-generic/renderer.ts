import { footprintGridStep } from './layout.js';
import type {
	FootprintBar,
	FootprintBarGeometry,
	FootprintGenericViewModel,
	FootprintLayout,
	FootprintLevelRow,
	FootprintPriceProjection,
	FootprintSlotDef,
	FootprintTheme,
} from './types.js';

export interface FootprintRenderInput {
	readonly ctx: CanvasRenderingContext2D;
	readonly vm: FootprintGenericViewModel;
	readonly layout: FootprintLayout;
}

type HistogramSlot = Extract<FootprintSlotDef, { role: 'histogram' }>;

function readMetric(values: Readonly<Record<string, number>>, id: string): number {
	const v = values[id];
	return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function priceToY(price: number, proj: FootprintPriceProjection): number {
	if (proj.pMax <= proj.pMin) {
		return proj.top + proj.height * 0.5;
	}
	return proj.top + ((proj.pMax - price) / (proj.pMax - proj.pMin)) * proj.height;
}

function cellVerticalBand(
	bar: FootprintBar,
	sortedHighFirst: readonly FootprintLevelRow[],
	index: number,
	proj: FootprintPriceProjection
): { y0: number; y1: number } {
	const L = sortedHighFirst;
	const p = L[index]!.price;
	const yP = priceToY(p, proj);
	const yAbove =
		index === 0 ? priceToY(bar.high, proj) : (priceToY(L[index - 1]!.price, proj) + yP) * 0.5;
	const yBelow =
		index === L.length - 1
			? priceToY(bar.low, proj)
			: (yP + priceToY(L[index + 1]!.price, proj)) * 0.5;
	return { y0: Math.min(yAbove, yBelow), y1: Math.max(yAbove, yBelow) };
}

function maxAbsMetricInBar(levels: readonly FootprintLevelRow[], metricId: string): number {
	let m = 0;
	for (const r of levels) {
		m = Math.max(m, Math.abs(readMetric(r.values, metricId)));
	}
	return m;
}

function rowActivity(row: FootprintLevelRow, slots: readonly FootprintSlotDef[]): number {
	let s = 0;
	for (const sl of slots) {
		if (sl.role === 'histogram' || sl.role === 'number') {
			s += Math.abs(readMetric(row.values, sl.metricId));
		} else {
			s += Math.abs(readMetric(row.values, sl.metricId));
			s += Math.abs(readMetric(row.values, sl.ratioDenominatorId));
		}
	}
	return s;
}

function pocRowIndex(sorted: readonly FootprintLevelRow[], slots: readonly FootprintSlotDef[]): number {
	if (sorted.length === 0) {
		return 0;
	}
	let best = rowActivity(sorted[0]!, slots);
	let idx = 0;
	for (let i = 1; i < sorted.length; i++) {
		const a = rowActivity(sorted[i]!, slots);
		if (a > best) {
			best = a;
			idx = i;
		}
	}
	return idx;
}

function pocRowIndexByMetric(
	sorted: readonly FootprintLevelRow[],
	metricId: string
): number {
	if (sorted.length === 0) {
		return 0;
	}
	let best = Math.abs(readMetric(sorted[0]!.values, metricId));
	let idx = 0;
	for (let i = 1; i < sorted.length; i++) {
		const v = Math.abs(readMetric(sorted[i]!.values, metricId));
		if (v > best) {
			best = v;
			idx = i;
		}
	}
	return idx;
}

function resolvePocRowIndex(vm: FootprintGenericViewModel, sorted: readonly FootprintLevelRow[]): number {
	const id = vm.pocMetricId?.trim();
	if (id !== undefined && id !== '') {
		return pocRowIndexByMetric(sorted, id);
	}
	return pocRowIndex(sorted, vm.slots);
}

function histogramColor(slot: HistogramSlot, theme: FootprintTheme): string {
	if (slot.histogramColor !== undefined) {
		return slot.histogramColor;
	}
	if (slot.grow === 'left' || slot.grow === 'center') {
		return theme.histogramLeft;
	}
	return theme.histogramRight;
}

function drawGrid(ctx: CanvasRenderingContext2D, layout: FootprintLayout, theme: FootprintTheme): void {
	const { pMin, pMax } = layout.price;
	const step = footprintGridStep(pMin, pMax);
	ctx.save();
	ctx.strokeStyle = theme.gridColor;
	ctx.lineWidth = 1;
	ctx.setLineDash([...theme.gridDash]);
	for (let p = Math.ceil(pMin / step) * step; p <= pMax + 1e-9; p += step) {
		const y = priceToY(p, layout.price);
		ctx.beginPath();
		ctx.moveTo(layout.innerX, y);
		ctx.lineTo(layout.innerX + layout.innerW, y);
		ctx.stroke();
	}
	ctx.restore();
}

function drawCandleLane(
	ctx: CanvasRenderingContext2D,
	theme: FootprintTheme,
	x: number,
	w: number,
	top: number,
	h: number
): void {
	ctx.save();
	ctx.fillStyle = theme.candleLaneBg;
	ctx.fillRect(x, top, w, h);
	ctx.strokeStyle = theme.candleLaneEdge;
	ctx.lineWidth = 1;
	ctx.strokeRect(x + 0.5, top + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
	ctx.restore();
}

function drawMiniCandle(
	ctx: CanvasRenderingContext2D,
	bar: FootprintBar,
	theme: FootprintTheme,
	cx: number,
	cw: number,
	proj: FootprintPriceProjection
): void {
	const yH = priceToY(bar.high, proj);
	const yL = priceToY(bar.low, proj);
	const yO = priceToY(bar.open, proj);
	const yC = priceToY(bar.close, proj);
	const xMid = cx + cw * 0.5;
	const xL = cx + 1;
	const xR = cx + cw - 1;

	ctx.save();
	ctx.strokeStyle = theme.candleWick;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(xMid, yH);
	ctx.lineTo(xMid, yL);
	ctx.stroke();

	const bodyTop = Math.min(yO, yC);
	const bodyBot = Math.max(yO, yC);
	const bull = bar.close >= bar.open;
	ctx.fillStyle = bull ? theme.candleBull : theme.candleBear;
	ctx.strokeStyle = bull ? theme.candleBullStroke : theme.candleBearStroke;
	const bw = Math.max(2, xR - xL);
	ctx.fillRect(xL, bodyTop, bw, Math.max(1, bodyBot - bodyTop));
	ctx.strokeRect(xL, bodyTop, bw, Math.max(1, bodyBot - bodyTop));
	ctx.restore();
}

interface HistogramSlotDraw {
	readonly ctx: CanvasRenderingContext2D;
	readonly slot: HistogramSlot;
	readonly theme: FootprintTheme;
	readonly x: number;
	readonly y0: number;
	readonly w: number;
	readonly h: number;
	readonly value: number;
	readonly denom: number;
	readonly showValues: boolean;
}

function formatHistogramGlyph(value: number): string {
	if (!Number.isFinite(value)) {
		return '';
	}
	return String(Math.round(value));
}

function drawHistogramSlot(p: HistogramSlotDraw): void {
	const { ctx, slot, theme, x, y0, w, h, value, denom, showValues } = p;
	const frac = denom > 0 ? Math.min(1, Math.abs(value) / denom) : 0;
	const bh = Math.max(1, h * 0.55);
	const by = y0 + (h - bh) * 0.5;
	const bw = Math.max(0, (w - 2) * frac);
	const fill = histogramColor(slot, theme);
	ctx.fillStyle = fill;
	if (slot.grow === 'left') {
		const x1 = x + w - 1;
		ctx.fillRect(x1 - bw, by, bw, bh);
	} else if (slot.grow === 'center') {
		const cx = x + w * 0.5;
		ctx.fillRect(cx - bw * 0.5, by, bw, bh);
	} else {
		ctx.fillRect(x + 1, by, bw, bh);
	}

	if (showValues) {
		const text = formatHistogramGlyph(value);
		if (text !== '') {
			const tx = x + w * 0.5;
			const ty = by + bh * 0.5;
			ctx.save();
			ctx.font = theme.histogramValueFont ?? theme.numberFont;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.lineJoin = 'round';
			ctx.lineWidth = 2.5;
			ctx.strokeStyle = theme.histogramValueOutline ?? 'rgba(0,0,0,0.6)';
			ctx.strokeText(text, tx, ty);
			ctx.fillStyle = theme.histogramValueColor ?? 'rgba(252,252,255,0.96)';
			ctx.fillText(text, tx, ty);
			ctx.restore();
		}
	}
}

interface NumberSlotDraw {
	readonly ctx: CanvasRenderingContext2D;
	readonly theme: FootprintTheme;
	readonly x: number;
	readonly y0: number;
	readonly w: number;
	readonly h: number;
	readonly value: number;
}

function drawNumberSlot(p: NumberSlotDraw): void {
	const { ctx, theme, x, y0, w, h, value } = p;
	ctx.save();
	ctx.font = theme.numberFont;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = theme.textPrimary;
	ctx.fillText(String(value), x + w * 0.5, y0 + h * 0.5);
	ctx.restore();
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

interface RatioSlotDraw {
	readonly ctx: CanvasRenderingContext2D;
	readonly theme: FootprintTheme;
	readonly x: number;
	readonly y0: number;
	readonly w: number;
	readonly h: number;
	readonly numerator: number;
	readonly denominator: number;
}

function drawRatioSlot(p: RatioSlotDraw): void {
	const { ctx, theme, x, y0, w, h, numerator, denominator } = p;
	const text = formatRatio(numerator, denominator);
	const r =
		denominator !== 0 && Number.isFinite(numerator) && Number.isFinite(denominator)
			? numerator / denominator
			: 0;
	ctx.save();
	ctx.font = theme.numberFont;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	if (r < 0) {
		ctx.fillStyle = '#ef9a9a';
	} else if (r > 0) {
		ctx.fillStyle = '#a5d6a7';
	} else {
		ctx.fillStyle = theme.textPrimary;
	}
	ctx.fillText(text, x + w * 0.5, y0 + h * 0.5);
	ctx.restore();
}

function drawBarChrome(
	ctx: CanvasRenderingContext2D,
	vm: FootprintGenericViewModel,
	bar: FootprintBar,
	geo: FootprintBarGeometry,
	layout: FootprintLayout
): void {
	const theme = vm.theme;
	const top = layout.innerY;
	const footTop = layout.chartTop + layout.chartHeight;

	if (bar.header !== undefined) {
		ctx.save();
		ctx.font = theme.headerFont;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = bar.header.color ?? theme.textPrimary;
		const hx = geo.x + geo.width * 0.5;
		const hy = top + vm.headerBandHeight * 0.5;
		ctx.fillText(bar.header.text, hx, hy);
		ctx.restore();
	}

	if (bar.footer !== undefined) {
		ctx.save();
		ctx.font = theme.footerFont;
		ctx.textBaseline = 'middle';
		const fy = footTop + vm.footerBandHeight * 0.5;
		ctx.textAlign = 'left';
		ctx.fillStyle = bar.footer.leftColor ?? theme.textPrimary;
		ctx.fillText(bar.footer.left, geo.x + 2, fy);
		ctx.textAlign = 'right';
		ctx.fillStyle = bar.footer.rightColor ?? theme.textPrimary;
		ctx.fillText(bar.footer.right, geo.x + geo.width - 2, fy);
		ctx.restore();
	}
}

function drawOneBar(
	ctx: CanvasRenderingContext2D,
	vm: FootprintGenericViewModel,
	layout: FootprintLayout,
	bar: FootprintBar,
	geo: FootprintBarGeometry
): void {
	const theme = vm.theme;
	const proj = layout.price;
	const sorted = [...bar.levels].sort((a, b) => b.price - a.price);
	if (sorted.length === 0) {
		drawCandleLane(ctx, theme, geo.candleX, geo.candleW, proj.top, proj.height);
		drawMiniCandle(ctx, bar, theme, geo.candleX, geo.candleW, proj);
		drawBarChrome(ctx, vm, bar, geo, layout);
		return;
	}

	const maxByMetric = new Map<string, number>();
	for (const sl of vm.slots) {
		if (sl.role === 'histogram') {
			maxByMetric.set(sl.metricId, maxAbsMetricInBar(sorted, sl.metricId));
		}
	}

	const pocI = resolvePocRowIndex(vm, sorted);

	const xSlots = geo.slotXs[0] ?? geo.x;
	const blockW = geo.slotWidths.reduce((a, b) => a + b, 0);

	for (let i = 0; i < sorted.length; i++) {
		const row = sorted[i]!;
		const { y0, y1 } = cellVerticalBand(bar, sorted, i, proj);
		const h = Math.max(1, y1 - y0);

		for (let s = 0; s < vm.slots.length; s++) {
			const slot = vm.slots[s]!;
			const sx = geo.slotXs[s] ?? geo.x;
			const sw = geo.slotWidths[s] ?? 0;
			if (slot.role === 'histogram') {
				const v = readMetric(row.values, slot.metricId);
				const denom = maxByMetric.get(slot.metricId) ?? 0;
				const showHist = vm.histogramShowValues !== false;
				drawHistogramSlot({
					ctx,
					slot,
					theme,
					x: sx,
					y0,
					w: sw,
					h,
					value: v,
					denom,
					showValues: showHist,
				});
			} else if (slot.role === 'number') {
				const v = readMetric(row.values, slot.metricId);
				drawNumberSlot({ ctx, theme, x: sx, y0, w: sw, h, value: v });
			} else {
				const num = readMetric(row.values, slot.metricId);
				const den = readMetric(row.values, slot.ratioDenominatorId);
				drawRatioSlot({ ctx, theme, x: sx, y0, w: sw, h, numerator: num, denominator: den });
			}
		}

		ctx.strokeStyle = theme.cellSeparator;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(xSlots, y1);
		ctx.lineTo(xSlots + blockW, y1);
		ctx.stroke();

		if (i === pocI) {
			ctx.save();
			ctx.strokeStyle = theme.pocBorder;
			ctx.lineWidth = 2;
			ctx.strokeRect(xSlots + 0.5, y0 + 0.5, blockW - 1, h - 1);
			ctx.restore();
		}

		for (let s = 1; s < vm.slots.length; s++) {
			const vx = geo.slotXs[s] ?? geo.x;
			ctx.strokeStyle = 'rgba(255,255,255,0.08)';
			ctx.beginPath();
			ctx.moveTo(vx, y0);
			ctx.lineTo(vx, y1);
			ctx.stroke();
		}
	}

	drawCandleLane(ctx, theme, geo.candleX, geo.candleW, proj.top, proj.height);
	drawMiniCandle(ctx, bar, theme, geo.candleX, geo.candleW, proj);
	drawBarChrome(ctx, vm, bar, geo, layout);
}

export function renderFootprintGeneric(inp: FootprintRenderInput): void {
	const { ctx, vm, layout } = inp;
	ctx.fillStyle = vm.theme.background;
	ctx.fillRect(layout.innerX, layout.innerY, layout.innerW, layout.innerH);
	drawGrid(ctx, layout, vm.theme);
	for (let i = 0; i < vm.bars.length; i++) {
		const b = vm.bars[i];
		const g = layout.barGeometries[i];
		if (b !== undefined && g !== undefined) {
			drawOneBar(ctx, vm, layout, b, g);
		}
	}
}
