const DEFAULT_CAPACITY = 4096;

/** Dev-only eviction counter (RFC §5.4 / T-034 telemetry hook). */
let devTextMeasureEvictionCount = 0;

function isDev(): boolean {
	return typeof process !== 'undefined' && process.env['NODE_ENV'] !== 'production';
}

export function resetTextMeasureCacheDevStats(): void {
	devTextMeasureEvictionCount = 0;
}

export function getTextMeasureCacheDevEvictionCount(): number {
	return devTextMeasureEvictionCount;
}

/** Bounded LRU for `measureText` (RFC §5.4; PRD AC-13). */
export class TextMeasureCache {
	private readonly _cap: number;
	private readonly _map = new Map<string, number>();
	private _order: string[] = [];
	/** Cache misses (calls that reach `ctx.measureText`) — HC1-012 diagnostics / tests. */
	private _measureMissCount = 0;

	public constructor(capacity = DEFAULT_CAPACITY) {
		this._cap = capacity;
	}

	/** Reset {@link getMeasureMissCountForTests} (unit tests). */
	public resetMeasureMissCountForTests(): void {
		this._measureMissCount = 0;
	}

	public getMeasureMissCountForTests(): number {
		return this._measureMissCount;
	}

	public measure(ctx: CanvasRenderingContext2D, key: string, text: string): number {
		const hit = this._map.get(key);
		if (hit !== undefined) {
			this._touch(key);
			return hit;
		}
		this._measureMissCount += 1;
		const w = ctx.measureText(text).width;
		this._map.set(key, w);
		this._order.push(key);
		this._evict();
		return w;
	}

	public size(): number {
		return this._map.size;
	}

	private _touch(key: string): void {
		const i = this._order.indexOf(key);
		if (i >= 0) {
			this._order.splice(i, 1);
			this._order.push(key);
		}
	}

	private _evict(): void {
		while (this._order.length > this._cap) {
			const k = this._order.shift();
			if (k !== undefined) {
				this._map.delete(k);
				if (isDev()) {
					devTextMeasureEvictionCount += 1;
				}
			}
		}
	}
}
