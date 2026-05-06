import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatNumberCellText } from '../src/render/format-cell-text.js';

describe('formatNumberCellText (T-031 string fixtures)', () => {
	it('keeps short integers verbatim', () => {
		assert.equal(formatNumberCellText(42, { maxChars: 8 }), '42');
	});

	it('abbreviates wide magnitudes (PRD C9)', () => {
		const s = formatNumberCellText(1_234_567, { maxChars: 6 });
		assert.ok(s.length <= 6, s);
		assert.ok(/K|M|B|T/.test(s) || /^\d/.test(s), s);
	});

	it('ellipsis when still too long', () => {
		const s = formatNumberCellText(9.99e99, { maxChars: 4 });
		assert.ok(s.length <= 4, s);
	});
});
