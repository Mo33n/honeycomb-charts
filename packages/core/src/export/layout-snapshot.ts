/**
 * Serializable layout snapshot for host PNG/SVG pipelines (RFC §5.11, PM Q25).
 * Values are **logical** (CSS px space intent); rasterization is host-owned.
 */
import type { FootprintLayoutDirection } from '../layout/layout-direction.js';

export const FOOTPRINT_LAYOUT_SNAPSHOT_VERSION = 1;

export interface FootprintLayoutCellSnapshot {
	readonly price: number;
	readonly metricId: string;
	readonly segment: 'L' | 'R';
	readonly text: string;
	readonly barNormalized: number;
}

export interface FootprintLayoutBarSnapshot {
	readonly logicalBarIndex: number;
	readonly revision?: number;
	readonly cells: readonly FootprintLayoutCellSnapshot[];
}

/** Optional render-style token for host pipelines (T-033 / candle chrome toggles). */
export interface FootprintLayoutCandleChromeSnapshot {
	readonly bodyVisible: boolean;
	readonly wicksVisible: boolean;
	readonly candleZOrder: 'behind' | 'outlineFront';
}

export interface FootprintLayoutSnapshot {
	readonly version: typeof FOOTPRINT_LAYOUT_SNAPSHOT_VERSION;
	readonly generatedAtMs: number;
	readonly devicePixelRatio: number;
	readonly bars: readonly FootprintLayoutBarSnapshot[];
	readonly candleChrome?: FootprintLayoutCandleChromeSnapshot;
	/** Present when not `'ltr'` (HC1-040 / mirror segments). */
	readonly layoutDirection?: FootprintLayoutDirection;
}

export function createEmptyFootprintLayoutSnapshot(): FootprintLayoutSnapshot {
	return {
		version: FOOTPRINT_LAYOUT_SNAPSHOT_VERSION,
		generatedAtMs: Date.now(),
		devicePixelRatio: 1,
		bars: [],
	};
}

export interface BuildFootprintLayoutSnapshotInput {
	readonly generatedAtMs: number;
	readonly devicePixelRatio: number;
	readonly bars: readonly {
		readonly logicalBarIndex: number;
		readonly revision?: number;
		readonly cells: readonly {
			readonly price: number;
			readonly metricId: string;
			readonly segment: 'L' | 'R';
			readonly text: string;
			readonly barNormalized: number;
		}[];
	}[];
	readonly candleChrome?: FootprintLayoutCandleChromeSnapshot;
	readonly layoutDirection?: FootprintLayoutDirection;
}

/** Deterministic builder for tests and host export hooks (T-080). */
export function buildFootprintLayoutSnapshot(input: BuildFootprintLayoutSnapshotInput): FootprintLayoutSnapshot {
	return {
		version: FOOTPRINT_LAYOUT_SNAPSHOT_VERSION,
		generatedAtMs: input.generatedAtMs,
		devicePixelRatio: input.devicePixelRatio,
		bars: input.bars.map(b => ({
			logicalBarIndex: b.logicalBarIndex,
			...(b.revision !== undefined ? { revision: b.revision } : {}),
			cells: b.cells.map(c => ({ ...c })),
		})),
		...(input.candleChrome !== undefined ? { candleChrome: { ...input.candleChrome } } : {}),
		...(input.layoutDirection !== undefined && input.layoutDirection !== 'ltr'
			? { layoutDirection: input.layoutDirection }
			: {}),
	};
}
