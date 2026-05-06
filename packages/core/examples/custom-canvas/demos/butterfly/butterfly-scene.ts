import type { CanvasLayout, CanvasScene } from '../../lib/canvas-host.js';
import { BUTTERFLY_SAMPLE_PANELS, type ButterflyPanel, type ButterflyRow } from './sample-data.js';

const FONT = '13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/** Olive “alert” band: fraction of panel max used to switch to highlight fill. */
const HIGHLIGHT_FRACTION = 0.82;

function maxAbsLeft(rows: readonly ButterflyRow[]): number {
	let m = 0;
	for (const r of rows) {
		m = Math.max(m, Math.abs(r.left));
	}
	return m;
}

function maxAbsRight(rows: readonly ButterflyRow[]): number {
	let m = 0;
	for (const r of rows) {
		m = Math.max(m, Math.abs(r.right));
	}
	return m;
}

function leftBarColor(value: number, maxL: number): string {
	const t = maxL > 0 ? Math.abs(value) / maxL : 0;
	if (t >= HIGHLIGHT_FRACTION) {
		return '#8d8b55';
	}
	return 'rgba(100, 181, 246, 0.85)';
}

function rightBarColor(value: number, maxR: number): string {
	const t = maxR > 0 ? Math.abs(value) / maxR : 0;
	if (t >= HIGHLIGHT_FRACTION) {
		return '#8d8b55';
	}
	return value >= 0 ? 'rgba(129, 199, 132, 0.9)' : 'rgba(239, 154, 154, 0.95)';
}

function drawPanel(
	ctx: CanvasRenderingContext2D,
	panel: ButterflyPanel,
	x0: number,
	width: number,
	top: number,
	height: number
): void {
	const padX = 10;
	const padY = 8;
	const innerW = Math.max(40, width - padX * 2);
	const innerH = Math.max(20, height - padY * 2);
	const cx = x0 + padX + innerW * 0.5;
	const rowCount = panel.rows.length;
	const rowH = innerH / Math.max(1, rowCount);
	const barH = Math.max(6, rowH * 0.55);
	const maxL = maxAbsLeft(panel.rows);
	const maxR = maxAbsRight(panel.rows);
	const half = innerW * 0.5 - 14;

	ctx.save();
	ctx.strokeStyle = panel.spineColor;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(cx, top + padY);
	ctx.lineTo(cx, top + padY + innerH);
	ctx.stroke();
	ctx.restore();

	for (let i = 0; i < rowCount; i++) {
		const row = panel.rows[i]!;
		const yMid = top + padY + rowH * (i + 0.5);
		const y = yMid - barH * 0.5;

		const lw = maxL > 0 ? (Math.abs(row.left) / maxL) * half : 0;
		ctx.fillStyle = leftBarColor(row.left, maxL);
		ctx.fillRect(cx - lw, y, lw, barH);

		const rw = maxR > 0 ? (Math.abs(row.right) / maxR) * half : 0;
		ctx.fillStyle = rightBarColor(row.right, maxR);
		if (row.right >= 0) {
			ctx.fillRect(cx, y, rw, barH);
		} else {
			ctx.fillRect(cx - rw, y, rw, barH);
		}

		ctx.fillStyle = '#d1d4dc';
		ctx.font = FONT;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'right';
		ctx.fillText(String(row.left), cx - lw - 6, yMid);
		const rightLabel = String(row.right);
		if (row.right >= 0) {
			ctx.textAlign = 'left';
			ctx.fillText(rightLabel, cx + rw + 6, yMid);
		} else {
			ctx.textAlign = 'right';
			ctx.fillText(rightLabel, cx - rw - 6, yMid);
		}
	}
}

export class ButterflyChartScene implements CanvasScene {
	public readonly id = 'butterfly';
	public readonly title = 'Diverging bars (butterfly)';
	private readonly _panels: readonly ButterflyPanel[];

	public constructor(panels: readonly ButterflyPanel[] = BUTTERFLY_SAMPLE_PANELS) {
		this._panels = panels;
	}

	public draw(ctx: CanvasRenderingContext2D, layout: CanvasLayout): void {
		const { cssWidth: w, cssHeight: h } = layout;
		const n = this._panels.length;
		const gap = 12;
		const slice = (w - gap * (n + 1)) / Math.max(1, n);
		let x = gap;
		for (const panel of this._panels) {
			drawPanel(ctx, panel, x, slice, 0, h);
			x += slice + gap;
		}
	}
}

/** Default export for the registry (single shared instance is fine for static data). */
export const butterflyDemoScene: CanvasScene = new ButterflyChartScene();
