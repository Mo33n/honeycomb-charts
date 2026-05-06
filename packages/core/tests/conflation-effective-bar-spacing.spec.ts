import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Mirrors `FootprintRenderer.update` bar slot width input (RFC §5.5).
 * If this diverges from renderer logic, update both and this test.
 */
function effectiveBarSpacing(barSpacing: number, conflationFactor: number): number {
	return barSpacing * Math.max(1, conflationFactor);
}

describe('effectiveBarSpacing (T-041 / RFC §5.5)', () => {
	it('equals barSpacing when conflation is 1', () => {
		assert.equal(effectiveBarSpacing(6, 1), 6);
	});

	it('scales by conflation when factor > 1', () => {
		assert.equal(effectiveBarSpacing(4, 3), 12);
		assert.equal(effectiveBarSpacing(5, 2), 10);
	});

	it('ignores fractional conflation below 1', () => {
		assert.equal(effectiveBarSpacing(8, 0.5), 8);
	});
});
