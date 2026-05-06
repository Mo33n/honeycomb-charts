import type { CanvasLayout, CanvasScene } from '../../lib/canvas-host.js';
import { NUMBER_BAR_SAMPLE, type NumberBarCandle, type NumberBarLevel } from './sample-data.js';

const FONT = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const HEADER_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const HEADER_H = 18;
const GRID_COLOR = 'rgba(180, 180, 190, 0.12)';
const CELL_EDGE = 'rgba(0, 0, 0, 0.22)';
const METRIC_SEP = 'rgba(255, 255, 255, 0.1)';
const TEXT_DARK = '#1e222d';
const TEXT_LIGHT = '#f0f3fa';
const CANDLE_LANE_BG = 'rgba(255, 255, 255, 0.04)';
const CANDLE_LANE_EDGE = 'rgba(255, 255, 255, 0.12)';
const NUM_TO_CANDLE_GAP = 5;

/** Y mapping shared by grid, cells, and mini candles. */
interface PriceProjection {
	readonly top: number;
	readonly chartH: number;
	readonly pMin: number;
	readonly pMax: number;
}

interface NumberBlockParams {
	readonly ctx: CanvasRenderingContext2D;
	readonly candle: NumberBarCandle;
	readonly x0: number;
	readonly blockW: number;
	readonly proj: PriceProjection;
}

/** Heat: pale warm low → deep orange/red high (within each metric column’s max for the bar). */
function heatFill(t: number): string {
	const u = Math.max(0, Math.min(1, t));
	const r = Math.round(232 + u * (198 - 232));
	const g = Math.round(218 + u * (75 - 218));
	const b = Math.round(188 + u * (55 - 188));
	return `rgb(${String(r)},${String(g)},${String(b)})`;
}

function textColorForHeat(t: number): string {
	return t > 0.55 ? TEXT_LIGHT : TEXT_DARK;
}

function priceToY(price: number, proj: PriceProjection): number {
	const { top, chartH, pMin, pMax } = proj;
	if (pMax <= pMin) {
		return top + chartH * 0.5;
	}
	return top + ((pMax - price) / (pMax - pMin)) * chartH;
}

function metricCount(candle: NumberBarCandle): number {
	return candle.columnLabels.length;
}

function assertLevelShape(candle: NumberBarCandle): number {
	const m = metricCount(candle);
	for (const row of candle.levels) {
		if (row.cells.length !== m) {
			throw new Error('NumberBarLevel.cells length must match columnLabels');
		}
	}
	return m;
}

function maxPerMetricColumn(levels: readonly NumberBarLevel[], m: number): number[] {
	const max = Array.from({ length: m }, () => 0);
	for (const row of levels) {
		for (let j = 0; j < m; j++) {
			const v = row.cells[j] ?? 0;
			max[j] = Math.max(max[j], Math.abs(v));
		}
	}
	return max;
}

function rowActivity(row: NumberBarLevel): number {
	return row.cells.reduce((s, v) => s + Math.abs(v), 0);
}

/** Index of row with largest total |cell| activity (POC-style). */
function pocRowIndex(sorted: readonly NumberBarLevel[]): number {
	if (sorted.length === 0) {
		return 0;
	}
	let best = rowActivity(sorted[0]!);
	let idx = 0;
	for (let i = 1; i < sorted.length; i++) {
		const a = rowActivity(sorted[i]!);
		if (a > best) {
			best = a;
			idx = i;
		}
	}
	return idx;
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

function globalPriceBounds(candles: readonly NumberBarCandle[]): { pMin: number; pMax: number } {
	let pMin = Infinity;
	let pMax = -Infinity;
	for (const c of candles) {
		pMin = Math.min(pMin, c.low);
		pMax = Math.max(pMax, c.high);
	}
	if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) {
		return { pMin: 0, pMax: 1 };
	}
	const pad = (pMax - pMin) * 0.04 || 0.25;
	return { pMin: pMin - pad, pMax: pMax + pad };
}

function cellVerticalBand(
	candle: NumberBarCandle,
	levelsSortedHighFirst: readonly NumberBarLevel[],
	index: number,
	proj: PriceProjection
): { y0: number; y1: number } {
	const L = levelsSortedHighFirst;
	const p = L[index]!.price;
	const yP = priceToY(p, proj);
	const yAbove =
		index === 0
			? priceToY(candle.high, proj)
			: (priceToY(L[index - 1]!.price, proj) + yP) * 0.5;
	const yBelow =
		index === L.length - 1
			? priceToY(candle.low, proj)
			: (yP + priceToY(L[index + 1]!.price, proj)) * 0.5;
	const y0 = Math.min(yAbove, yBelow);
	const y1 = Math.max(yAbove, yBelow);
	return { y0, y1 };
}

function drawPriceGrid(
	ctx: CanvasRenderingContext2D,
	left: number,
	width: number,
	proj: PriceProjection
): void {
	const { pMin, pMax } = proj;
	const step = gridStep(pMin, pMax);
	ctx.save();
	ctx.strokeStyle = GRID_COLOR;
	ctx.lineWidth = 1;
	ctx.setLineDash([2, 4]);
	for (let p = Math.ceil(pMin / step) * step; p <= pMax + 1e-9; p += step) {
		const y = priceToY(p, proj);
		ctx.beginPath();
		ctx.moveTo(left, y);
		ctx.lineTo(left + width, y);
		ctx.stroke();
	}
	ctx.restore();
}

function drawColumnHeaders(
	ctx: CanvasRenderingContext2D,
	labels: readonly string[],
	x0: number,
	blockW: number,
	labelY: number,
	m: number
): void {
	const cw = blockW / m;
	ctx.save();
	ctx.font = HEADER_FONT;
	ctx.fillStyle = 'rgba(200, 203, 210, 0.85)';
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'center';
	for (let j = 0; j < m; j++) {
		const lab = labels[j] ?? '';
		ctx.fillText(lab, x0 + (j + 0.5) * cw, labelY);
	}
	ctx.restore();
}

function drawNumberBlock(p: NumberBlockParams): void {
	const { ctx, candle, x0, blockW, proj } = p;
	const m = assertLevelShape(candle);
	if (m === 0 || candle.levels.length === 0) {
		return;
	}
	const levels = [...candle.levels].sort((a, b) => b.price - a.price);
	const maxCol = maxPerMetricColumn(levels, m);
	const pocI = pocRowIndex(levels);
	const cw = blockW / m;

	for (let i = 0; i < levels.length; i++) {
		const row = levels[i]!;
		const { y0, y1 } = cellVerticalBand(candle, levels, i, proj);
		const h = Math.max(1, y1 - y0);

		for (let j = 0; j < m; j++) {
			const xCell = x0 + j * cw;
			const v = row.cells[j] ?? 0;
			const denom = maxCol[j] ?? 0;
			const t = denom > 0 ? Math.abs(v) / denom : 0;

			if (row.emphasis === true) {
				ctx.fillStyle = '#2962ff';
			} else {
				ctx.fillStyle = heatFill(t);
			}
			ctx.fillRect(xCell, y0, cw - 0.5, h);

			ctx.font = FONT;
			ctx.textBaseline = 'middle';
			ctx.textAlign = 'center';
			const ty = y0 + h * 0.5;
			if (row.emphasis === true) {
				ctx.fillStyle = TEXT_LIGHT;
			} else if (j === m - 1 && v < 0) {
				ctx.fillStyle = t > 0.55 ? '#ffcdd2' : '#b71c1c';
			} else {
				ctx.fillStyle = textColorForHeat(t);
			}
			ctx.fillText(String(v), xCell + cw * 0.5, ty);
		}

		for (let j = 1; j < m; j++) {
			const vx = x0 + j * cw;
			ctx.strokeStyle = METRIC_SEP;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(vx, y0);
			ctx.lineTo(vx, y1);
			ctx.stroke();
		}

		ctx.strokeStyle = CELL_EDGE;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x0, y1);
		ctx.lineTo(x0 + blockW, y1);
		ctx.stroke();

		if (i === pocI) {
			ctx.save();
			ctx.strokeStyle = '#0a0a0a';
			ctx.lineWidth = 2.5;
			ctx.strokeRect(x0 + 1, y0 + 1, blockW - 2, h - 2);
			ctx.restore();
		}
	}
}

function drawCandleLaneBackdrop(
	ctx: CanvasRenderingContext2D,
	x: number,
	w: number,
	top: number,
	height: number
): void {
	ctx.save();
	ctx.fillStyle = CANDLE_LANE_BG;
	ctx.fillRect(x, top, w, height);
	ctx.strokeStyle = CANDLE_LANE_EDGE;
	ctx.lineWidth = 1;
	ctx.strokeRect(x + 0.5, top + 0.5, Math.max(0, w - 1), Math.max(0, height - 1));
	ctx.restore();
}

function drawMiniCandle(
	ctx: CanvasRenderingContext2D,
	candle: NumberBarCandle,
	cx: number,
	candleW: number,
	proj: PriceProjection
): void {
	const yH = priceToY(candle.high, proj);
	const yL = priceToY(candle.low, proj);
	const yO = priceToY(candle.open, proj);
	const yC = priceToY(candle.close, proj);
	const xMid = cx + candleW * 0.5;
	const xL = cx + 1;
	const xR = cx + candleW - 1;

	ctx.save();
	ctx.strokeStyle = 'rgba(200, 203, 210, 0.55)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(xMid, yH);
	ctx.lineTo(xMid, yL);
	ctx.stroke();

	const bodyTop = Math.min(yO, yC);
	const bodyBot = Math.max(yO, yC);
	const bull = candle.close >= candle.open;
	ctx.fillStyle = bull ? 'rgba(46, 160, 130, 0.85)' : 'rgba(220, 90, 90, 0.88)';
	ctx.strokeStyle = bull ? 'rgba(120, 220, 190, 0.5)' : 'rgba(255, 160, 160, 0.45)';
	const bw = Math.max(2, xR - xL);
	ctx.fillRect(xL, bodyTop, bw, Math.max(1, bodyBot - bodyTop));
	ctx.strokeRect(xL, bodyTop, bw, Math.max(1, bodyBot - bodyTop));
	ctx.restore();
}

export class NumberBarChartScene implements CanvasScene {
	public readonly id = 'number_bar';
	public readonly title = 'Number bar (footprint-style)';
	private readonly _candles: readonly NumberBarCandle[];

	public constructor(candles: readonly NumberBarCandle[] = NUMBER_BAR_SAMPLE) {
		this._candles = candles;
	}

	public draw(ctx: CanvasRenderingContext2D, layout: CanvasLayout): void {
		const { cssWidth: W, cssHeight: H } = layout;
		const padL = 12;
		const padR = 12;
		const padT = 8;
		const padB = 10;
		const innerW = W - padL - padR;
		const innerH = H - padT - padB;
		const { pMin, pMax } = globalPriceBounds(this._candles);
		const chartTop = padT + HEADER_H;
		const chartH = Math.max(40, innerH - HEADER_H);
		const proj: PriceProjection = { top: chartTop, chartH, pMin, pMax };
		const n = this._candles.length;
		const gap = 6;
		const perBar = n > 0 ? (innerW - gap * (n + 1)) / n : innerW;
		const candleW = Math.max(8, Math.min(14, Math.floor(perBar * 0.13)));
		const numBlockW = Math.max(48, Math.floor(perBar - candleW - NUM_TO_CANDLE_GAP));
		let x = padL + gap;
		const labelY = padT + HEADER_H * 0.5;

		drawPriceGrid(ctx, padL, innerW, proj);

		for (const c of this._candles) {
			const m = metricCount(c);
			drawColumnHeaders(ctx, c.columnLabels, x, numBlockW, labelY, m);
			drawNumberBlock({ ctx, candle: c, x0: x, blockW: numBlockW, proj });

			const candleX = x + numBlockW + NUM_TO_CANDLE_GAP;
			drawCandleLaneBackdrop(ctx, candleX, candleW, chartTop, chartH);
			drawMiniCandle(ctx, c, candleX, candleW, proj);

			x += perBar + gap;
		}
	}
}

export const numberBarDemoScene: CanvasScene = new NumberBarChartScene();
