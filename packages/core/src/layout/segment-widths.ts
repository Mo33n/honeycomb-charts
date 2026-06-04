import type { FootprintColumnDef } from '../options/footprint-series-options.js';

/** PM §16.11 Q20 — soft cap on visible columns. */
export const MAX_VISIBLE_COLUMNS = 8;

export interface VisibleColumn extends FootprintColumnDef {
	readonly segment: 'L' | 'R';
	/** Index of this column within its side's `columns` array (stable id for width keys). */
	readonly sideIndex: number;
}

export interface SegmentWidthInput {
	readonly slotWidthPx: number;
	readonly leftColumns: readonly FootprintColumnDef[];
	readonly rightColumns: readonly FootprintColumnDef[];
}

export interface SegmentWidthResult {
	readonly leftWidths: readonly number[];
	readonly rightWidths: readonly number[];
	readonly visibleColumns: readonly VisibleColumn[];
	readonly clampedColumnCount: number;
}

function isDevWarn(): boolean {
	return typeof process !== 'undefined' && process.env['NODE_ENV'] !== 'production';
}

function collectVisible(left: readonly FootprintColumnDef[], right: readonly FootprintColumnDef[]): VisibleColumn[] {
	const out: VisibleColumn[] = [];
	for (let i = 0; i < left.length; i++) {
		const c = left[i]!;
		if (c.visible) {
			out.push({ ...c, segment: 'L', sideIndex: i });
		}
	}
	for (let i = 0; i < right.length; i++) {
		const c = right[i]!;
		if (c.visible) {
			out.push({ ...c, segment: 'R', sideIndex: i });
		}
	}
	return out;
}

function weightOf(c: FootprintColumnDef): number {
	const w = c.weight;
	return w !== undefined && w > 0 ? w : 1;
}

/**
 * Proportional shrink (PRD C15): distribute `slotWidthPx` across visible columns by weight.
 * Hidden columns receive width 0. Emits a dev warning when more than {@link MAX_VISIBLE_COLUMNS} are visible.
 */
export function computeSegmentColumnWidths(input: SegmentWidthInput): SegmentWidthResult {
	const visible = collectVisible(input.leftColumns, input.rightColumns);
	let clampedColumnCount = 0;
	let working = visible;
	if (working.length > MAX_VISIBLE_COLUMNS) {
		clampedColumnCount = working.length - MAX_VISIBLE_COLUMNS;
		if (isDevWarn()) {
			// eslint-disable-next-line no-console -- intentional dev-only perf guard (RFC §16.11 Q20)
			console.warn(`[honeycomb-charts] Visible footprint columns clamped from ${working.length} to ${MAX_VISIBLE_COLUMNS}`);
		}
		working = [...working]
			.sort((a, b) => weightOf(b) - weightOf(a) || (a.segment === b.segment ? a.sideIndex - b.sideIndex : a.segment === 'L' ? -1 : 1))
			.slice(0, MAX_VISIBLE_COLUMNS);
	}

	const totalWeight = working.reduce((s, c) => s + weightOf(c), 0);
	const slot = Math.max(0, Math.floor(input.slotWidthPx));

	const widthsByKey = new Map<string, number>();
	if (totalWeight <= 0 || working.length === 0) {
		return {
			leftWidths: input.leftColumns.map(() => 0),
			rightWidths: input.rightColumns.map(() => 0),
			visibleColumns: working,
			clampedColumnCount,
		};
	}

	let allocated = 0;
	for (let i = 0; i < working.length; i++) {
		const c = working[i]!;
		const isLast = i === working.length - 1;
		const w = weightOf(c);
		const px = isLast ? slot - allocated : Math.floor((slot * w) / totalWeight);
		widthsByKey.set(`${c.segment}:${c.sideIndex}`, px);
		allocated += px;
	}

	const leftWidths = input.leftColumns.map((c, idx) => (c.visible ? (widthsByKey.get(`L:${idx}`) ?? 0) : 0));
	const rightWidths = input.rightColumns.map((c, idx) => (c.visible ? (widthsByKey.get(`R:${idx}`) ?? 0) : 0));

	const sum = [...leftWidths, ...rightWidths].reduce((a, b) => a + b, 0);
	if (sum > slot && isDevWarn()) {
		// eslint-disable-next-line no-console
		console.warn('[honeycomb-charts] Column width sum exceeds slot; check weights and slot width');
	}

	return { leftWidths, rightWidths, visibleColumns: working, clampedColumnCount };
}
