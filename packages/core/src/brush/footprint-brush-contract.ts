import type { UTCTimestamp } from 'lightweight-charts';

import type { EnrichedCandle } from '../schema/types.js';

/**
 * Inclusive brush interval in **Lightweight Charts UTC time** (seconds since Unix epoch).
 *
 * v1.2 fixes this as the **only** normative brush coordinate space (see `docs/brush-reducers-v1.2.md`).
 * Hosts using `BusinessDay` bars must convert endpoints to `UTCTimestamp` before reporting.
 *
 * **Normalization:** if `from` is greater than `to`, swap so `from <= to` before filtering bars or calling reducers.
 */
export interface FootprintBrushInterval {
	readonly from: UTCTimestamp;
	readonly to: UTCTimestamp;
}

/**
 * Built-in reducer identifiers (RFC §5.10 closed set; v1.2 normative semantics in `docs/brush-reducers-v1.2.md`).
 */
export type FootprintReducerId =
	| 'sum'
	| 'max'
	| 'min'
	| 'deltaSum'
	| 'volumeSum'
	| 'rowCount'
	| 'custom';

/**
 * Numeric reducer output. **Canonical keys** for built-ins match reducer id where applicable (`sum`, `max`, …);
 * **`custom`** may emit any string keys with finite numbers (including `NaN` when documented for a reducer).
 *
 * On an **empty** brushed bar list, reducers return `{}` and never throw (see `TASKS-footprint-honeycomb-v1.2.md` task quality).
 */
export type FootprintReducerResult = Readonly<Partial<Record<string, number>>>;

/**
 * Opaque host handle for **`custom`** reducers (HC2-011). No `eval` / `new Function` (NFR-4).
 */
export type FootprintCustomReducerContext = string;

/**
 * Host-implemented reducer for id **`custom`**.
 *
 * Constraints: pure (no network/DOM), iterate at most `bars.length` (see §Custom reducer in this package doc).
 */
export type FootprintCustomReducerFn = (
	bars: readonly EnrichedCandle<UTCTimestamp>[],
	ctx: FootprintCustomReducerContext
) => FootprintReducerResult;

/**
 * Payload delivered after the user **commits** a brush gesture (mouseup / touchend). The package does **not**
 * attach chart subscriptions in HC2-010; hosts wire `timeScale` / primitives and invoke their handler with this shape.
 */
export interface FootprintBrushCompleteEvent {
	readonly interval: FootprintBrushInterval;
	/** Reducer ids the host requested for this brush (subset of {@link FootprintReducerId}). */
	readonly reducerIds: readonly FootprintReducerId[];
	/** Aggregated numeric outputs; `{}` when nothing computed. */
	readonly results: FootprintReducerResult;
}

/**
 * Host callback type after a brush completes and reducers have run.
 */
export type FootprintBrushCompleteHandler = (event: FootprintBrushCompleteEvent) => void;
