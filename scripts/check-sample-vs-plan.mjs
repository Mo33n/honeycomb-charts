#!/usr/bin/env node
/**
 * Ensures SampleData.json exposes every metric listed in a layout's compiled `requiredKeys`,
 * using `config.json` → `dataContract.aliases` (e.g. buy_qty → bid).
 *
 * Usage (from repo root or honeycomb/):
 *   node honeycomb/scripts/check-sample-vs-plan.mjs
 *   node honeycomb/scripts/check-sample-vs-plan.mjs --layout=desk_dark_orderflow
 *   node honeycomb/scripts/check-sample-vs-plan.mjs --all
 *   node honeycomb/scripts/check-sample-vs-plan.mjs --sample=honeycomb/SampleData.json --config=honeycomb/config.json
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileLayoutCatalog } from '../lib/compiler-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');

function parseArgs(argv) {
	const out = {
		config: join(honeycombRoot, 'config.json'),
		sample: join(honeycombRoot, 'SampleData.json'),
		layout: null,
		all: false,
	};
	for (const a of argv) {
		if (a.startsWith('--config=')) {
			out.config = a.slice('--config='.length);
		} else if (a.startsWith('--sample=')) {
			out.sample = a.slice('--sample='.length);
		} else if (a.startsWith('--layout=')) {
			out.layout = a.slice('--layout='.length);
		} else if (a === '--all') {
			out.all = true;
		}
	}
	return out;
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} canonical
 * @param {Record<string, string>} aliases fieldName → canonical metric id
 */
function rowProvidesCanonical(row, canonical, aliases) {
	if (Object.prototype.hasOwnProperty.call(row, canonical)) {
		return true;
	}
	for (const [field, target] of Object.entries(aliases)) {
		if (target === canonical && Object.prototype.hasOwnProperty.call(row, field)) {
			return true;
		}
	}
	return false;
}

/**
 * @param {unknown[]} candles
 * @param {string} req
 * @param {Record<string, string>} aliases
 */
function anyBarProvides(candles, req, aliases) {
	for (const c of candles) {
		if (!c || typeof c !== 'object') {
			continue;
		}
		const row = /** @type {Record<string, unknown>} */ (c);
		if (rowProvidesCanonical(row, req, aliases)) {
			return true;
		}
	}
	return false;
}

/**
 * @param {unknown[]} candles
 * @param {string} req
 * @param {Record<string, string>} aliases
 */
function anyLevelProvides(candles, req, aliases) {
	for (const c of candles) {
		if (!c || typeof c !== 'object') {
			continue;
		}
		const levels = /** @type {Record<string, unknown>} */ (c).footprint_levels;
		if (!Array.isArray(levels)) {
			continue;
		}
		for (const L of levels) {
			if (!L || typeof L !== 'object') {
				continue;
			}
			if (rowProvidesCanonical(/** @type {Record<string, unknown>} */ (L), req, aliases)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * @param {readonly string[]} requiredKeys
 * @param {unknown[]} candles
 * @param {Record<string, string>} aliases
 * @param {readonly string[]} barAggregateKeys
 * @param {readonly string[]} levelValueKeys
 * @returns {{ missing: string[]; detail: string }}
 */
function validateRequiredKeys(requiredKeys, candles, aliases, barAggregateKeys, levelValueKeys) {
	const barSet = new Set(barAggregateKeys);
	const levelSet = new Set(levelValueKeys);

	const missing = [];
	for (const req of requiredKeys) {
		const onBar = barSet.has(req);
		const onLevel = levelSet.has(req);

		let ok = false;
		if (onBar && !onLevel) {
			ok = anyBarProvides(candles, req, aliases);
		} else if (onLevel && !onBar) {
			ok = anyLevelProvides(candles, req, aliases);
		} else {
			ok = anyBarProvides(candles, req, aliases) || anyLevelProvides(candles, req, aliases);
		}

		if (!ok) {
			missing.push(req);
		}
	}

	const detail =
		missing.length === 0
			? 'OK'
			: `missing canonical metrics: ${missing.join(', ')} (after applying dataContract.aliases)`;
	return { missing, detail };
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

async function main() {
	const { config: configPath, sample: samplePath, layout: layoutArg, all } = parseArgs(process.argv.slice(2));

	const catalog = JSON.parse(await readFile(configPath, 'utf8'));
	const { aliases, barAggregateKeys, levelValueKeys } = readDataContract(catalog.dataContract);
	const compiled = compileLayoutCatalog(catalog);

	const sampleDoc = JSON.parse(await readFile(samplePath, 'utf8'));
	const candles = Array.isArray(sampleDoc.data) ? sampleDoc.data : [];
	if (candles.length < 1) {
		console.error('Sample has no data[] rows.');
		process.exit(1);
	}

	const layoutIds = all
		? compiled.layouts.map(l => l.id)
		: [layoutArg || (typeof catalog.defaultLayoutId === 'string' ? catalog.defaultLayoutId : null)];

	if (!layoutIds[0]) {
		console.error('No layout id: pass --layout=<id> or set defaultLayoutId in config.');
		process.exit(1);
	}

	let failed = false;
	for (const layoutId of layoutIds) {
		const L = compiled.layouts.find(x => x.id === layoutId);
		if (!L) {
			console.error(`Unknown layout id: ${layoutId}`);
			failed = true;
			continue;
		}
		const plan = L.segmentPlan;
		const requiredKeys = Array.isArray(plan.requiredKeys) ? plan.requiredKeys : [];
		const { missing, detail } = validateRequiredKeys(requiredKeys, candles, aliases, barAggregateKeys, levelValueKeys);
		if (missing.length > 0) {
			console.error(`[${layoutId}] ${detail}`);
			failed = true;
		} else {
			console.log(`[${layoutId}] ${detail} (${String(requiredKeys.length)} requiredKeys)`);
		}
	}

	process.exit(failed ? 1 : 0);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
