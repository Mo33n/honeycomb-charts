import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { applyDataMapping, dataMappingFromDataContract, normalizeAliases } from '../lib/data-mapping.mjs';
import { CompileLayoutError } from '../lib/errors.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');

describe('applyDataMapping', () => {
	it('maps buy_qty/sell_qty → bid/ask on levels (merge)', () => {
		const candle = {
			time: 1,
			volume: 100,
			footprint_levels: [{ price: 2.1, buy_qty: 10, sell_qty: 7, vol: 17 }],
		};
		const mapping = { aliases: { buy_qty: 'bid', sell_qty: 'ask' } };
		const out = applyDataMapping(candle, mapping);
		assert.equal(out.volume, 100);
		assert.equal(out.footprint_levels[0].bid, 10);
		assert.equal(out.footprint_levels[0].ask, 7);
		assert.equal(out.footprint_levels[0].buy_qty, 10);
		assert.equal(out.footprint_levels[0].vol, 17);
	});

	it('stripAliasSources removes source keys', () => {
		const candle = {
			footprint_levels: [{ price: 1, buy_qty: 3, sell_qty: 4 }],
		};
		const out = applyDataMapping(candle, { aliases: { buy_qty: 'bid', sell_qty: 'ask' } }, { stripAliasSources: true });
		assert.equal(out.footprint_levels[0].bid, 3);
		assert.equal(out.footprint_levels[0].ask, 4);
		assert.equal('buy_qty' in out.footprint_levels[0], false);
	});

	it('maps bar-level keys when alias targets bar aggregates', () => {
		const candle = { pipeline_vol: 999, footprint_levels: [] };
		const out = applyDataMapping(candle, { aliases: { pipeline_vol: 'volume' } });
		assert.equal(out.volume, 999);
	});

	it('matches production dataContract aliases on first SampleData row', async () => {
		const raw = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		const mapping = dataMappingFromDataContract(raw.dataContract);
		const sample = JSON.parse(await readFile(join(honeycombRoot, 'SampleData.json'), 'utf8'));
		const row = sample.data[0];
		const out = applyDataMapping(row, mapping);
		const L = out.footprint_levels[0];
		assert.equal(L.bid, L.buy_qty);
		assert.equal(L.ask, L.sell_qty);
	});

	it('normalizeAliases trims and skips empty', () => {
		assert.deepEqual(normalizeAliases({ '  buy_qty  ': '  bid ' }), { buy_qty: 'bid' });
	});

	it('rejects non-object candle', () => {
		assert.throws(() => applyDataMapping(null, { aliases: {} }), e => e instanceof CompileLayoutError && e.code === 'DATA_MAPPING_INVALID');
	});
});
