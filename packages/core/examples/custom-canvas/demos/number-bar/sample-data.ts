/**
 * Footprint-style “number bar” sample: each time column has **multiple number metrics**
 * (e.g. bid / ask / delta) in one block, then a **separate** mini-candle lane to the right.
 */

export interface NumberBarLevel {
	readonly price: number;
	/** One value per metric column, left → right (same length as {@link NumberBarCandle.columnLabels}). */
	readonly cells: readonly number[];
	/** Highlight the whole row (e.g. absorption / imbalance). */
	readonly emphasis?: boolean;
}

export interface NumberBarCandle {
	readonly open: number;
	readonly high: number;
	readonly low: number;
	readonly close: number;
	/** Short labels drawn above each number sub-column (bid · ask · Δ). */
	readonly columnLabels: readonly string[];
	readonly levels: readonly NumberBarLevel[];
}

/** Compact row constructor for samples. */
function sampleLevel(price: number, bid: number, ask: number, delta: number, emphasis?: boolean): NumberBarLevel {
	return emphasis === true
		? { price, cells: [bid, ask, delta], emphasis: true }
		: { price, cells: [bid, ask, delta] };
}

const LABELS = ['bid', 'ask', 'Δ'] as const;

export const NUMBER_BAR_SAMPLE: readonly NumberBarCandle[] = [
	{
		open: 100.0,
		high: 101.5,
		low: 99.0,
		close: 100.75,
		columnLabels: LABELS,
		levels: [
			sampleLevel(101.5, 22, 9, 4),
			sampleLevel(101.0, 88, 41, 12),
			sampleLevel(100.5, 134, 62, -8),
			sampleLevel(100.0, 476, 120, 55, true),
			sampleLevel(99.5, 201, 88, -22),
			sampleLevel(99.0, 64, 31, -5),
		],
	},
	{
		open: 100.75,
		high: 101.25,
		low: 99.75,
		close: 100.25,
		columnLabels: LABELS,
		levels: [
			sampleLevel(101.25, 31, 14, 2),
			sampleLevel(101.0, 112, 48, 15),
			sampleLevel(100.75, 295, 102, -35),
			sampleLevel(100.5, 178, 71, -9),
			sampleLevel(100.25, 90, 44, 6),
			sampleLevel(100.0, 55, 28, -4),
			sampleLevel(99.75, 40, 19, -3),
		],
	},
	{
		open: 100.25,
		high: 100.75,
		low: 99.5,
		close: 100.5,
		columnLabels: LABELS,
		levels: [
			sampleLevel(100.75, 18, 11, 1),
			sampleLevel(100.5, 203, 91, -18),
			sampleLevel(100.25, 412, 140, -28),
			sampleLevel(100.0, 151, 66, -12),
			sampleLevel(99.75, 97, 41, -7),
			sampleLevel(99.5, 33, 18, -2),
		],
	},
	{
		open: 100.5,
		high: 101.0,
		low: 100.0,
		close: 100.875,
		columnLabels: LABELS,
		levels: [
			sampleLevel(101.0, 44, 21, 6),
			sampleLevel(100.75, 128, 55, 10),
			sampleLevel(100.5, 360, 118, -25),
			sampleLevel(100.25, 220, 95, -14),
			sampleLevel(100.0, 73, 36, -5),
		],
	},
	{
		open: 100.875,
		high: 101.75,
		low: 100.5,
		close: 101.5,
		columnLabels: LABELS,
		levels: [
			sampleLevel(101.75, 27, 12, 3),
			sampleLevel(101.5, 156, 58, 18),
			sampleLevel(101.25, 288, 101, -22),
			sampleLevel(101.0, 341, 112, -31),
			sampleLevel(100.75, 190, 79, -15),
			sampleLevel(100.5, 102, 48, -9),
		],
	},
];
