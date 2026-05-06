import type { FootprintLayoutDirection } from './layout-direction.js';
import { segmentOrder } from './layout-direction.js';
import type { FootprintColumnDef, FootprintSegmentSide } from '../options/footprint-series-options.js';
import { computeSegmentColumnWidths } from './segment-widths.js';

/**
 * One visible column’s horizontal span inside a bar slot (CSS px space, y from price scale elsewhere).
 */
export interface FootprintColumnCssSlot {
	readonly segment: 'L' | 'R';
	/** Index into `options.left.columns` or `options.right.columns` per `segment`. */
	readonly columnIndex: number;
	readonly colLeftCss: number;
	readonly colRightCss: number;
}

/**
 * Computes left→right column rectangles for one footprint bar slot (paint order matches
 * {@link FootprintRenderer} / `segmentOrder`).
 */
export function computeFootprintColumnCssSlots(
	centerCssX: number,
	slotCss: number,
	layoutDirection: FootprintLayoutDirection,
	left: FootprintSegmentSide,
	right: FootprintSegmentSide
): readonly FootprintColumnCssSlot[] {
	const widths = computeSegmentColumnWidths({
		slotWidthPx: slotCss,
		leftColumns: left.columns,
		rightColumns: right.columns,
	});

	const order = segmentOrder(left, right, layoutDirection);
	const sides: { columns: readonly FootprintColumnDef[]; widths: readonly number[]; seg: 'L' | 'R' }[] =
		order.first === left
			? [
				{ columns: left.columns, widths: widths.leftWidths, seg: 'L' },
				{ columns: right.columns, widths: widths.rightWidths, seg: 'R' },
			]
			: [
				{ columns: right.columns, widths: widths.rightWidths, seg: 'R' },
				{ columns: left.columns, widths: widths.leftWidths, seg: 'L' },
			];

	const boxLeftCss = centerCssX - slotCss * 0.5;
	let xCursorCss = boxLeftCss;
	const out: FootprintColumnCssSlot[] = [];

	for (const side of sides) {
		for (let c = 0; c < side.columns.length; c++) {
			const col = side.columns[c]!;
			const colW = side.widths[c] ?? 0;
			if (!col.visible || colW <= 0) {
				continue;
			}
			const colLeft = xCursorCss;
			const colRight = xCursorCss + colW;
			xCursorCss += colW;
			out.push({
				segment: side.seg,
				columnIndex: c,
				colLeftCss: colLeft,
				colRightCss: colRight,
			});
		}
	}

	return out;
}
