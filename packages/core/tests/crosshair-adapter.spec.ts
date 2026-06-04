import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	buildFootprintCrosshairPayload,
	buildGenericFootprintCrosshairPayload,
	parseFootprintObjectId,
	parseGenericFootprintObjectId,
} from '../src/interaction/crosshair-adapter.js';

describe('parseFootprintObjectId', () => {
	it('parses logical index, price, metric, segment, overlay id', () => {
		const p = parseFootprintObjectId('fp|42|100.5|vol|L|ov:tint_a');
		assert.deepEqual(p, { logicalBarIndex: 42, price: 100.5, metricId: 'vol', segment: 'L', overlayId: 'tint_a' });
	});

	it('defaults overlay id for old 5-part ids (backward compatibility)', () => {
		const p = parseFootprintObjectId('fp|42|100.5|vol|L');
		assert.equal(p?.overlayId, '__cell__');
	});

	it('returns null for malformed ids', () => {
		assert.equal(parseFootprintObjectId('nope'), null);
		assert.equal(parseFootprintObjectId('fp|x|1|m|L'), null);
	});

	it('decodes metric ids containing pipe characters', () => {
		const encodedMetric = encodeURIComponent('buy|sell');
		const p = parseFootprintObjectId(`fp|1|100|${encodedMetric}|L|ov:__cell__`);
		assert.equal(p?.metricId, 'buy|sell');
	});
});

describe('parseGenericFootprintObjectId', () => {
	it('parses logical index, price, slot, overlay id, metric', () => {
		const p = parseGenericFootprintObjectId('gf|3|100.5|1|ov:band_a|m:delta');
		assert.deepEqual(p, {
			logicalBarIndex: 3,
			price: 100.5,
			slotIndex: 1,
			overlayId: 'band_a',
			metricId: 'delta',
		});
	});

	it('parses __cell__ overlay sentinel', () => {
		const p = parseGenericFootprintObjectId('gf|0|99|2|ov:__cell__|m:vol');
		assert.equal(p?.overlayId, '__cell__');
	});

	it('returns null for malformed ids', () => {
		assert.equal(parseGenericFootprintObjectId('nope'), null);
		assert.equal(parseGenericFootprintObjectId('gf|1|2|3'), null);
	});
});

describe('buildGenericFootprintCrosshairPayload', () => {
	it('merges parsed hit with extras', () => {
		const p = buildGenericFootprintCrosshairPayload('gf|1|100|0|ov:__cell__|m:bid', { value: 7 });
		assert.deepEqual(p, {
			logicalBarIndex: 1,
			price: 100,
			slotIndex: 0,
			overlayId: '__cell__',
			metricId: 'bid',
			value: 7,
		});
	});
});

describe('buildFootprintCrosshairPayload', () => {
	it('merges parsed hit with optional value and revision', () => {
		const p = buildFootprintCrosshairPayload('fp|1|99.5|bid|R|ov:__cell__', { value: 12, revision: 4 });
		assert.deepEqual(p, {
			logicalBarIndex: 1,
			price: 99.5,
			metricId: 'bid',
			segment: 'R',
			overlayId: '__cell__',
			value: 12,
			revision: 4,
		});
	});
});
