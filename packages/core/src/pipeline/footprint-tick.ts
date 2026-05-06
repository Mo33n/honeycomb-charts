export interface FootprintTickLike {
	readonly time: number;
	readonly price: number;
	readonly size?: number;
}

export type FootprintBarKeyFn = (tick: FootprintTickLike) => number;
