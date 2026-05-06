#!/usr/bin/env node
/**
 * Generates honeycomb/SampleData.json with N candles of synthetic OHLC + footprint_levels.
 * - Each open equals the previous close (continuous session).
 * - Close is a small bounded random step from open (always ≥1 tick so the body is never flat).
 * - High/low add modest wicks; footprint levels span [low, high] on a fixed tick grid.
 *
 * Usage:
 *   node honeycomb/scripts/generate-sample-data.mjs
 *   node honeycomb/scripts/generate-sample-data.mjs --count=50 --seed=42 --out=honeycomb/SampleData.json
 *     --startPrice=2.11 --avgVolumePerMin=9000 --startTime=2026-01-01T00:00:00Z
 *   node honeycomb/scripts/generate-sample-data.mjs --layout=desk_dark_vol_ratio_delta --config=honeycomb/config.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileLayoutCatalog } from '../lib/compiler-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');

function parseArgs(argv) {
	const out = {
		count: 50,
		seed: 42,
		out: join(honeycombRoot, 'SampleData.json'),
		tick: 0.001,
		startPrice: 2.11,
		avgVolumePerMin: 9000,
		startTime: '2024-03-09T16:00:00Z',
		layout: null,
		config: join(honeycombRoot, 'config.json'),
	};
	for (const a of argv) {
		if (a.startsWith('--count=')) {
			out.count = Math.max(1, parseInt(a.slice('--count='.length), 10) || 50);
		} else if (a.startsWith('--seed=')) {
			out.seed = parseInt(a.slice('--seed='.length), 10) || 0;
		} else if (a.startsWith('--out=')) {
			out.out = a.slice('--out='.length);
		} else if (a.startsWith('--tick=')) {
			out.tick = parseFloat(a.slice('--tick='.length)) || 0.001;
		} else if (a.startsWith('--startPrice=')) {
			const parsed = parseFloat(a.slice('--startPrice='.length));
			if (Number.isFinite(parsed) && parsed > 0) {
				out.startPrice = parsed;
			}
		} else if (a.startsWith('--avgVolumePerMin=')) {
			const parsed = parseFloat(a.slice('--avgVolumePerMin='.length));
			if (Number.isFinite(parsed) && parsed > 0) {
				out.avgVolumePerMin = parsed;
			}
		} else if (a.startsWith('--startTime=')) {
			const value = a.slice('--startTime='.length);
			if (value.trim().length > 0) {
				out.startTime = value;
			}
		} else if (a.startsWith('--layout=')) {
			out.layout = a.slice('--layout='.length);
		} else if (a.startsWith('--config=')) {
			out.config = a.slice('--config='.length);
		}
	}
	return out;
}

/** Mulberry32 — deterministic PRNG for reproducible datasets. */
function mulberry32(seed) {
	let t = seed >>> 0;
	return function rnd() {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

function roundTick(p, tick) {
	return Math.round(p / tick) * tick;
}

function round1(x) {
	return Math.round(x * 10) / 10;
}

/**
 * @param {unknown} dc
 * @returns {{ aliases: Record<string, string>; barAggregateKeys: string[]; levelValueKeys: string[] }}
 */
function readDataContract(dc) {
	if (!dc || typeof dc !== 'object') {
		return { aliases: {}, barAggregateKeys: [], levelValueKeys: [] };
	}
	const o = /** @type {Record<string, unknown>} */ (dc);
	const aliases = o.aliases && typeof o.aliases === 'object' ? /** @type {Record<string, string>} */ (o.aliases) : {};
	const barAggregateKeys = Array.isArray(o.barAggregateKeys)
		? /** @type {string[]} */ (o.barAggregateKeys.filter(x => typeof x === 'string'))
		: [];
	const levelValueKeys = Array.isArray(o.levelValueKeys)
		? /** @type {string[]} */ (o.levelValueKeys.filter(x => typeof x === 'string'))
		: [];
	return { aliases, barAggregateKeys, levelValueKeys };
}

/**
 * Metrics that must appear on footprint level rows (same rule as check-sample-vs-plan).
 * @param {readonly string[]} requiredKeys
 * @param {readonly string[]} barAggregateKeys
 * @param {readonly string[]} levelValueKeys
 * @returns {Set<string>}
 */
function metricsRequiredOnLevels(requiredKeys, barAggregateKeys, levelValueKeys) {
	const barSet = new Set(barAggregateKeys);
	const levelSet = new Set(levelValueKeys);
	const out = new Set();
	for (const r of requiredKeys) {
		const onBar = barSet.has(r);
		const onLevel = levelSet.has(r);
		if (onBar && !onLevel) {
			continue;
		}
		out.add(r);
	}
	return out;
}

/**
 * Physical fields to copy from a raw level row to satisfy a canonical metric id.
 * @param {string} metric
 * @param {Record<string, string>} aliases sourceField → canonical
 * @returns {string[]}
 */
function physicalFieldsForMetric(metric, aliases) {
	if (Object.prototype.hasOwnProperty.call(aliases, metric)) {
		return [metric];
	}
	for (const [src, dst] of Object.entries(aliases)) {
		if (dst === metric) {
			return [src];
		}
	}
	return [metric];
}

/**
 * @param {Record<string, number>} raw
 * @param {Set<string>} levelCanonicalRequired
 * @param {Record<string, string>} aliases
 * @returns {Record<string, number>}
 */
function trimLevelToRequired(raw, levelCanonicalRequired, aliases) {
	const out = { price: raw.price };
	const seen = new Set(['price']);
	for (const metric of levelCanonicalRequired) {
		for (const f of physicalFieldsForMetric(metric, aliases)) {
			if (seen.has(f)) {
				continue;
			}
			if (Object.prototype.hasOwnProperty.call(raw, f)) {
				out[f] = raw[f];
				seen.add(f);
			}
		}
	}
	return out;
}

/**
 * @param {readonly string[]} requiredKeys
 * @param {readonly string[]} barAggregateKeys
 * @param {readonly string[]} levelValueKeys
 * @returns {string[]}
 */
function metricsRequiredOnBarsOnly(requiredKeys, barAggregateKeys, levelValueKeys) {
	const barSet = new Set(barAggregateKeys);
	const levelSet = new Set(levelValueKeys);
	const out = [];
	for (const r of requiredKeys) {
		const onBar = barSet.has(r);
		const onLevel = levelSet.has(r);
		if (onBar && !onLevel) {
			out.push(r);
		}
	}
	return out;
}

/**
 * @param {number} low
 * @param {number} high
 * @param {number} open
 * @param {number} close
 * @param {number} tick
 * @param {() => number} rnd
 * @param {number} barVolume
 * @param {Set<string> | null} levelCanonicalRequired null = emit full default level shape
 * @param {Record<string, string>} aliases
 */
function generateFootprintLevels(low, high, open, close, tick, rnd, barVolume, levelCanonicalRequired, aliases) {
	const lowT = roundTick(low, tick);
	const highT = roundTick(high, tick);
	const steps = Math.max(0, Math.round((highT - lowT) / tick));
	const levels = [];
	for (let k = 0; k <= steps; k++) {
		const price = roundTick(lowT + k * tick, tick);
		levels.push({ price, buy_qty: 0, sell_qty: 0, _w: 0 });
	}
	if (levels.length === 0) {
		return [];
	}

	const span = Math.max(tick, high - low);
	const center = (open + close) / 2;
	const directionalBias = close >= open ? 1 : -1;

	let wSum = 0;
	for (const L of levels) {
		const u = (L.price - center) / span;
		const bell = Math.exp(-4.5 * u * u);
		const w = bell * (0.55 + 0.45 * rnd());
		L._w = w;
		wSum += w;
	}

	const targetLegSum = barVolume * (0.45 + 0.2 * rnd());

	for (const L of levels) {
		const share = (L._w / wSum) * targetLegSum;
		const micro = (L.price - center) / span;
		const flowSkew = directionalBias * (0.08 + 0.12 * rnd()) * Math.tanh(micro * 3);
		const buy = Math.max(0, share * (0.5 + flowSkew));
		const sell = Math.max(0, share * (0.5 - flowSkew));
		L.buy_qty = round1(buy + (rnd() - 0.5) * 8);
		L.sell_qty = round1(sell + (rnd() - 0.5) * 8);
		if (L.buy_qty < 0.1 && L.sell_qty < 0.1) {
			L.buy_qty = round1(5 + rnd() * 15);
			L.sell_qty = round1(5 + rnd() * 15);
		}
		L.vol = round1(L.buy_qty + L.sell_qty);
		L.delta = round1(L.buy_qty - L.sell_qty);
		delete L._w;
	}

	if (levelCanonicalRequired === null) {
		return levels;
	}
	return levels.map(L => trimLevelToRequired(L, levelCanonicalRequired, aliases));
}

/**
 * @param {Record<string, unknown>} candle
 * @param {readonly string[]} barOnlyMetrics
 * @param {() => number} rnd
 */
function ensureBarOnlyMetrics(candle, barOnlyMetrics, rnd) {
	for (const m of barOnlyMetrics) {
		if (Object.prototype.hasOwnProperty.call(candle, m)) {
			continue;
		}
		candle[m] = round1(100 + rnd() * 900);
	}
}

async function main() {
	const { count, seed, out, tick, layout, config: configPath, startPrice, avgVolumePerMin, startTime } = parseArgs(
		process.argv.slice(2)
	);
	const rnd = mulberry32(seed);
	const barSeconds = 60;

	let levelCanonicalRequired = /** @type {Set<string> | null} */ (null);
	let aliases = /** @type {Record<string, string>} */ ({});
	let barAggregateKeys = /** @type {string[]} */ ([]);
	let levelValueKeys = /** @type {string[]} */ ([]);
	let requiredKeys = /** @type {string[]} */ ([]);

	if (layout) {
		const catalog = JSON.parse(await readFile(configPath, 'utf8'));
		const compiled = compileLayoutCatalog(catalog);
		const L = compiled.layouts.find(x => x.id === layout);
		if (!L) {
			throw new Error(`Unknown layout id: ${layout} (not in ${configPath})`);
		}
		const plan = L.segmentPlan;
		requiredKeys = Array.isArray(plan.requiredKeys) ? [...plan.requiredKeys] : [];
		const dc = readDataContract(catalog.dataContract);
		aliases = dc.aliases;
		barAggregateKeys = dc.barAggregateKeys;
		levelValueKeys = dc.levelValueKeys;
		levelCanonicalRequired = metricsRequiredOnLevels(requiredKeys, barAggregateKeys, levelValueKeys);
	}

	const baseTime = Math.floor(new Date(startTime).getTime() / 1000);
	if (!Number.isFinite(baseTime) || baseTime <= 0) {
		throw new Error(`Invalid --startTime: ${startTime}. Use ISO-8601, e.g. 2026-01-01T00:00:00Z`);
	}

	let prevClose = roundTick(startPrice + (rnd() - 0.5) * tick * 4, tick);
	const data = [];

	for (let i = 0; i < count; i++) {
		const open = prevClose;

		const stepTicks = (() => {
			const u = rnd();
			if (u < 0.55) {
				// Same RNG consumption as before (one `rnd` per bar here); no doji / zero-body bars.
				return u < 0.275 ? -1 : 1;
			}
			if (u < 0.82) {
				return rnd() < 0.5 ? -1 : 1;
			}
			if (u < 0.95) {
				return rnd() < 0.5 ? -2 : 2;
			}
			return rnd() < 0.5 ? -3 : 3;
		})();
		const close = roundTick(open + stepTicks * tick, tick);

		const bodyTop = Math.max(open, close);
		const bodyBot = Math.min(open, close);
		const wickUpTicks = rnd() < 0.35 ? 0 : rnd() < 0.7 ? 1 : 2;
		const wickDnTicks = rnd() < 0.35 ? 0 : rnd() < 0.7 ? 1 : 2;
		const high = roundTick(bodyTop + wickUpTicks * tick, tick);
		const low = roundTick(bodyBot - wickDnTicks * tick, tick);

		const volume = Math.max(1, Math.round(avgVolumePerMin * (0.7 + 0.6 * rnd())));
		const signedBias = (close - open) / tick;
		const volume_delta = Math.round(
			(-800 + rnd() * 1600) * (1 + Math.min(2, Math.abs(signedBias)) * 0.15) + signedBias * 200
		);

		const footprint_levels = generateFootprintLevels(
			low,
			high,
			open,
			close,
			tick,
			rnd,
			volume,
			levelCanonicalRequired,
			aliases
		);

		const row = {
			time: baseTime + i * barSeconds,
			open: roundTick(open, tick),
			close: roundTick(close, tick),
			high: roundTick(high, tick),
			low: roundTick(low, tick),
			volume,
			volume_delta,
			footprint_levels,
		};

		if (layout) {
			const barOnly = metricsRequiredOnBarsOnly(requiredKeys, barAggregateKeys, levelValueKeys);
			ensureBarOnlyMetrics(row, barOnly, rnd);
		}

		data.push(row);

		prevClose = close;
	}

	const doc = { data };
	const json = `${JSON.stringify(doc, null, 4)}\n`;
	await mkdir(dirname(out), { recursive: true });
	await writeFile(out, json, 'utf8');
	const suffix = layout ? ` layout=${layout} requiredKeys=${JSON.stringify(requiredKeys)}` : '';
	console.log(`Wrote ${String(count)} candles → ${out} (seed=${String(seed)})${suffix}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
