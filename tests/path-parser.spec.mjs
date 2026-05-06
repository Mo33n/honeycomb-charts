import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CompileLayoutError } from '../lib/errors.mjs';
import { DEFAULT_MAX_PATH_CHARS, DEFAULT_MAX_PATH_DEPTH, parsePath } from '../lib/path-parser.mjs';

describe('parsePath (RFC-0002 §2)', () => {
	it('parses close and nested index paths', () => {
		const a = parsePath('close');
		assert.deepEqual(a.segments.map((s) => (s.type === 'ident' ? s.name : s.index)), ['close']);
		const b = parsePath('footprint_levels.0.buy_qty');
		assert.deepEqual(
			b.segments.map((s) => (s.type === 'ident' ? s.name : s.index)),
			['footprint_levels', 0, 'buy_qty']
		);
		assert.equal(b.path, 'footprint_levels.0.buy_qty');
	});

	it('rejects empty and boundary dots', () => {
		for (const p of ['', ' ', '.a', 'a.', 'a..b']) {
			assert.throws(() => parsePath(p), CompileLayoutError, p);
			try {
				parsePath(p);
			} catch (e) {
				assert.ok(e instanceof CompileLayoutError);
				assert.equal(e.code, 'PATH_REJECTED');
			}
		}
	});

	it('rejects forbidden identifiers', () => {
		for (const id of ['__proto__', 'constructor', 'prototype']) {
			assert.throws(() => parsePath(`${id}.x`), (e) => e instanceof CompileLayoutError && e.code === 'PATH_REJECTED');
		}
	});

	it('rejects invalid segments and negative index text', () => {
		assert.throws(() => parsePath('bad-seg'), (e) => e.code === 'PATH_INVALID_SEGMENT');
		assert.throws(() => parsePath('a.-1'), (e) => e.code === 'PATH_INVALID_SEGMENT');
	});

	it('throws PATH_TOO_DEEP when segment count exceeds default', () => {
		const parts = Array.from({ length: DEFAULT_MAX_PATH_DEPTH + 1 }, () => 'x');
		assert.throws(() => parsePath(parts.join('.')), (e) => e instanceof CompileLayoutError && e.code === 'PATH_TOO_DEEP');
	});

	it('throws PATH_TOO_LONG', () => {
		const long = 'a'.repeat(DEFAULT_MAX_PATH_CHARS + 1);
		assert.throws(() => parsePath(long), (e) => e.code === 'PATH_TOO_LONG');
	});

	it('respects custom maxDepth', () => {
		assert.throws(() => parsePath('a.b.c', { maxDepth: 2 }), (e) => e.code === 'PATH_TOO_DEEP');
	});
});
