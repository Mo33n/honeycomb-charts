/**
 * Declarative slot model for {@link GenericFootprintSeries} (LWC custom series).
 * Mirrors the `examples/custom-canvas/demos/footprint-generic` prototype.
 */

/** Declarative per-cell overlay (ADR-0005). v1: `cellBand` only. */
export type GenericCellOverlay = {
	readonly id: string;
	readonly kind: 'cellBand';
	readonly fill: string;
	readonly opacity?: number;
	readonly zOrder?: number;
};

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Parse `cellOverlays` on a **footprint** column (preset JSON) or validate compiler output.
 * Generic series uses `validateGenericFootprintColumnOverlays` for the array-of-arrays shape.
 */
export function parseGenericCellOverlays(raw: unknown, ctx: string): readonly GenericCellOverlay[] | undefined {
	if (raw === undefined) {
		return undefined;
	}
	if (!Array.isArray(raw)) {
		throw new TypeError(`${ctx}: cellOverlays must be an array`);
	}
	if (raw.length === 0) {
		return undefined;
	}
	const out: GenericCellOverlay[] = [];
	for (let i = 0; i < raw.length; i++) {
		const item = raw[i];
		if (!isRecord(item)) {
			throw new TypeError(`${ctx}[${String(i)}] must be an object`);
		}
		const id = item['id'];
		const kind = item['kind'];
		if (typeof id !== 'string' || !id.trim()) {
			throw new TypeError(`${ctx}[${String(i)}].id must be a non-empty string`);
		}
		if (id.includes('|')) {
			throw new TypeError(`${ctx}[${String(i)}].id must not contain '|'`);
		}
		if (kind !== 'cellBand') {
			throw new TypeError(`${ctx}[${String(i)}]: unknown overlay kind ${String(kind)}`);
		}
		const fill = item['fill'];
		if (typeof fill !== 'string' || !fill.trim()) {
			throw new TypeError(`${ctx}[${String(i)}].fill required`);
		}
		const opacity = item['opacity'];
		const zOrder = item['zOrder'];
		if (typeof opacity === 'number') {
			if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
				throw new TypeError(`${ctx}[${String(i)}].opacity must be in [0,1]`);
			}
		} else if (opacity !== undefined) {
			throw new TypeError(`${ctx}[${String(i)}].opacity must be a number or omitted`);
		}
		out.push({
			id: id.trim(),
			kind: 'cellBand',
			fill: fill.trim(),
			...(typeof opacity === 'number' && Number.isFinite(opacity) ? { opacity } : {}),
			...(typeof zOrder === 'number' && Number.isFinite(zOrder) ? { zOrder } : {}),
		});
	}
	return out;
}

export type GenericFootprintSlot =
	| {
		readonly role: 'histogram';
		readonly metricId: string;
		/** Bar anchor: grow from slot edge inward (`left`/`right`) or centered in the slot (`center`). */
		readonly grow: 'left' | 'right' | 'center';
		readonly histogramColor?: string;
		/** When set, bar fill uses sign colors instead of `histogramColor` / default grow colors. */
		readonly colorizeBySign?: boolean;
		/**
		 * Max share of the slot inner width used when value equals the bar max (default **1**).
		 * Values below 1 keep the longest histogram short of the cell edge (calmer volume profile).
		 */
		readonly histogramMaxFillFrac?: number;
		/**
		 * Length exponent after normalizing to **[0,1]** by bar max: `frac = (|v|/max)^gamma` (default **1** = linear).
		 * Gamma above 1 compresses mid values (only peaks reach the max fill width).
		 */
		readonly histogramLengthGamma?: number;
		readonly insetLeftCss?: number;
		readonly insetRightCss?: number;
		readonly gapAfterCss?: number;
	}
	| {
		readonly role: 'number';
		readonly metricId: string;
		/** Color text by sign of the cell value (uses theme number* colors). */
		readonly colorBySign?: boolean;
		/** Optional per-cell background (CSS color) behind the number. */
		readonly cellBackground?: string;
		readonly insetLeftCss?: number;
		readonly insetRightCss?: number;
		readonly gapAfterCss?: number;
	}
	| {
		readonly role: 'ratio';
		readonly metricId: string;
		readonly ratioDenominatorId: string;
		readonly insetLeftCss?: number;
		readonly insetRightCss?: number;
		readonly gapAfterCss?: number;
	}
	| {
		readonly role: 'bar';
		readonly metricId: string;
		readonly barAlignMode?:
			| 'positiveLeftNegativeRight'
			| 'positiveRightNegativeLeft'
			| 'centered'
			| 'leftOnly'
			| 'rightOnly';
		readonly barPositiveColor?: string;
		readonly barNegativeColor?: string;
		readonly insetLeftCss?: number;
		readonly insetRightCss?: number;
		readonly gapAfterCss?: number;
	}
	| {
		/**
		 * P1 heatmap cell (see honeycomb ADR-0004). Until a dedicated fill pass ships,
		 * {@link GenericFootprintRenderer} draws this like a **`number`** slot using `metricId` as intensity.
		 */
		readonly role: 'heatmapCell';
		readonly metricId: string;
		readonly colorMode?: 'sequential' | 'diverging' | 'valueSecondary';
		/** Optional slot-specific base fill color (intensity still follows normalized value). */
		readonly heatmapColor?: string;
		readonly scaleRef?: string;
		/** Required when `colorMode` is `valueSecondary` (validated in {@link validateGenericFootprintSlots}). */
		readonly secondaryMetricId?: string;
		readonly insetLeftCss?: number;
		readonly insetRightCss?: number;
		readonly gapAfterCss?: number;
	};

export interface GenericFootprintTheme {
	readonly gridColor: string;
	readonly gridDash: readonly number[];
	readonly cellSeparator: string;
	readonly numberFont: string;
	readonly headerFont: string;
	readonly footerFont: string;
	readonly textPrimary: string;
	readonly textOnDark: string;
	readonly numberPositive: string;
	readonly numberNegative: string;
	readonly numberZero: string;
	readonly histogramLeft: string;
	readonly histogramRight: string;
	readonly histogramSignPositive: string;
	readonly histogramSignNegative: string;
	readonly histogramSignNeutral: string;
	readonly histogramValueFont?: string;
	readonly histogramValueColor?: string;
	readonly histogramValueOutline?: string;
	readonly candleLaneBg: string;
	readonly candleLaneEdge: string;
	readonly candleWick: string;
	readonly candleBull: string;
	readonly candleBear: string;
	readonly candleBullStroke: string;
	readonly candleBearStroke: string;
	readonly pocBorder: string;
}

export const defaultGenericFootprintTheme: GenericFootprintTheme = {
	gridColor: 'rgba(180, 180, 190, 0.1)',
	gridDash: [2, 4],
	cellSeparator: 'rgba(0, 0, 0, 0.25)',
	numberFont: '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
	headerFont: '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
	footerFont: '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
	textPrimary: '#d1d4dc',
	textOnDark: '#f0f3fa',
	numberPositive: '#a5d6a7',
	numberNegative: '#ef9a9a',
	numberZero: '#e0e3eb',
	histogramLeft: 'rgba(100, 181, 246, 0.55)',
	histogramRight: 'rgba(239, 154, 154, 0.6)',
	histogramSignPositive: 'rgba(100, 181, 246, 0.85)',
	histogramSignNegative: 'rgba(244, 143, 177, 0.88)',
	histogramSignNeutral: 'rgba(158, 158, 170, 0.45)',
	histogramValueFont: '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
	histogramValueColor: 'rgba(252, 252, 255, 0.96)',
	histogramValueOutline: 'rgba(0, 0, 0, 0.62)',
	candleLaneBg: 'rgba(255, 255, 255, 0.04)',
	candleLaneEdge: 'rgba(255, 255, 255, 0.12)',
	candleWick: 'rgba(200, 203, 210, 0.55)',
	candleBull: 'rgba(46, 160, 130, 0.88)',
	candleBear: 'rgba(220, 90, 90, 0.9)',
	candleBullStroke: 'rgba(120, 220, 190, 0.45)',
	candleBearStroke: 'rgba(255, 160, 160, 0.45)',
	pocBorder: '#ffb74d',
};

export function validateGenericFootprintColumnOverlays(
	slots: readonly GenericFootprintSlot[],
	columnOverlays: readonly (readonly GenericCellOverlay[])[] | undefined
): void {
	if (columnOverlays === undefined) {
		return;
	}
	if (columnOverlays.length !== slots.length) {
		throw new Error(
			`GenericFootprintSeries: columnOverlays length (${String(columnOverlays.length)}) must match slots (${String(slots.length)})`
		);
	}
	for (let c = 0; c < columnOverlays.length; c++) {
		const list = columnOverlays[c]!;
		for (let k = 0; k < list.length; k++) {
			const o = list[k]!;
			if (o.id.includes('|')) {
				throw new Error(`GenericFootprintSeries: overlay id must not contain '|' (column ${String(c)})`);
			}
			if (o.kind === 'cellBand') {
				if (!o.fill.trim()) {
					throw new Error(`GenericFootprintSeries: cellBand.fill required (column ${String(c)}, overlay ${String(k)})`);
				}
				if (o.opacity !== undefined && (o.opacity < 0 || o.opacity > 1 || !Number.isFinite(o.opacity))) {
					throw new Error(`GenericFootprintSeries: cellBand.opacity must be in [0,1] (column ${String(c)})`);
				}
			}
		}
	}
}

export function validateGenericFootprintSlots(
	slots: readonly GenericFootprintSlot[],
	weights: readonly number[]
): void {
	if (weights.length !== slots.length) {
		throw new Error('GenericFootprintSeries: slotWeights.length must match slots.length');
	}
	for (let i = 0; i < slots.length; i++) {
		const s = slots[i]!;
		if (s.role === 'ratio' && s.ratioDenominatorId.trim() === '') {
			throw new Error(`GenericFootprintSeries: slot ${String(i)} ratio requires ratioDenominatorId`);
		}
		if (s.role === 'heatmapCell') {
			if (s.metricId.trim() === '') {
				throw new Error(`GenericFootprintSeries: slot ${String(i)} heatmapCell requires metricId`);
			}
			if (s.colorMode === 'valueSecondary') {
				const sec = s.secondaryMetricId?.trim() ?? '';
				if (sec === '') {
					throw new Error(
						`GenericFootprintSeries: slot ${String(i)} heatmapCell colorMode valueSecondary requires secondaryMetricId`
					);
				}
			}
		}
		if (s.role === 'bar' && s.metricId.trim() === '') {
			throw new Error(`GenericFootprintSeries: slot ${String(i)} bar requires metricId`);
		}
		if (s.role === 'histogram') {
			if (s.grow !== 'left' && s.grow !== 'right' && s.grow !== 'center') {
				throw new Error(`GenericFootprintSeries: slot ${String(i)} histogram grow must be left, right, or center`);
			}
			const mf = s.histogramMaxFillFrac;
			if (mf !== undefined && (!Number.isFinite(mf) || mf <= 0 || mf > 1)) {
				throw new Error(`GenericFootprintSeries: slot ${String(i)} histogramMaxFillFrac must be in (0,1]`);
			}
			const g = s.histogramLengthGamma;
			if (g !== undefined && (!Number.isFinite(g) || g < 0.25 || g > 4)) {
				throw new Error(`GenericFootprintSeries: slot ${String(i)} histogramLengthGamma must be in [0.25,4]`);
			}
		}
		const leftInset = (s as { insetLeftCss?: number }).insetLeftCss;
		const rightInset = (s as { insetRightCss?: number }).insetRightCss;
		const gapAfter = (s as { gapAfterCss?: number }).gapAfterCss;
		if (leftInset !== undefined && (!Number.isFinite(leftInset) || leftInset < 0)) {
			throw new Error(`GenericFootprintSeries: slot ${String(i)} insetLeftCss must be >= 0`);
		}
		if (rightInset !== undefined && (!Number.isFinite(rightInset) || rightInset < 0)) {
			throw new Error(`GenericFootprintSeries: slot ${String(i)} insetRightCss must be >= 0`);
		}
		if (gapAfter !== undefined && (!Number.isFinite(gapAfter) || gapAfter < 0)) {
			throw new Error(`GenericFootprintSeries: slot ${String(i)} gapAfterCss must be >= 0`);
		}
	}
}
