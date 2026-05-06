/** One row: magnitude on the left of the spine, signed delta on the right (mirrors reference screenshots). */
export interface ButterflyRow {
	readonly left: number;
	readonly right: number;
}

export interface ButterflyPanel {
	readonly id: string;
	/** Stroke color for the vertical spine (and optional title accent). */
	readonly spineColor: string;
	readonly rows: readonly ButterflyRow[];
}

/** Static sample shaped like three side-by-side diverging panels. */
export const BUTTERFLY_SAMPLE_PANELS: readonly ButterflyPanel[] = [
	{
		id: 'A',
		spineColor: '#26a69a',
		rows: [
			{ left: 14, right: 32 },
			{ left: 123, right: -33 },
			{ left: 200, right: 48 },
			{ left: 450, right: -69 },
			{ left: 600, right: -74 },
			{ left: 897, right: -346 },
		],
	},
	{
		id: 'B',
		spineColor: '#787b86',
		rows: [
			{ left: 153, right: 7 },
			{ left: 312, right: -8 },
			{ left: 487, right: 63 },
			{ left: 659, right: -102 },
			{ left: 830, right: 121 },
			{ left: 855, right: -53 },
		],
	},
	{
		id: 'C',
		spineColor: '#ef5350',
		rows: [
			{ left: 400, right: -125 },
			{ left: 512, right: -20 },
			{ left: 640, right: 239 },
			{ left: 720, right: -96 },
			{ left: 900, right: -217 },
			{ left: 1024, right: -85 },
			{ left: 1118, right: -50 },
		],
	},
];
