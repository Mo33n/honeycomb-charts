import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CompileLayoutError } from '../lib/errors.mjs';
import { parsePath } from '../lib/path-parser.mjs';

function randomString(rng, maxLen) {
	const len = Math.floor(rng() * maxLen) + 1;
	let s = '';
	const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-\n\r\t\x00';
	for (let i = 0; i < len; i++) {
		s += alphabet[Math.floor(rng() * alphabet.length)];
	}
	return s;
}

describe('parsePath fuzz (CT-S01)', () => {
	it('random strings never throw uncaught; failures use PATH_* codes only', () => {
		let seed = 0x9e3779b9;
		const rng = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 2 ** 32;
		};
		for (let i = 0; i < 500; i++) {
			const s = randomString(rng, 64);
			try {
				parsePath(s);
			} catch (e) {
				assert.ok(e instanceof CompileLayoutError, `uncaught or wrong type: ${String(e)}`);
				assert.match(
					e.code,
					/^PATH_/,
					`unexpected code ${e.code} for input ${JSON.stringify(s)}`
				);
			}
		}
	});
});
