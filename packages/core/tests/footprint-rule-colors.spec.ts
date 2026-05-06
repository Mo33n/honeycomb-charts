import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	parseFootprintPresetV1,
	presetToPartialOptions,
} from '../src/preset/footprint-preset-v1.js';
import {
	evaluateFootprintRulePredicate,
	parseFootprintColumnColorRules,
	parseFootprintRulePredicate,
	parseFootprintStylePatch,
	resolveColumnStyleForCell,
	FOOTPRINT_COLOR_RULE_MAX_DEPTH,
	FootprintRuleParseError,
} from '../src/rules/column-color-rules.js';

describe('column color rules (HC1-021)', () => {
	it('throws FootprintRuleParseError UNKNOWN_OP for invalid op', () => {
		assert.throws(
			() => parseFootprintRulePredicate({ op: 'evil', x: 1 }),
			err => err instanceof FootprintRuleParseError && err.code === 'UNKNOWN_OP'
		);
	});

	it('throws DEPTH when predicate exceeds max depth', () => {
		let p: Record<string, unknown> = { op: 'literal', value: true };
		for (let i = 0; i < FOOTPRINT_COLOR_RULE_MAX_DEPTH; i++) {
			p = { op: 'and', a: p, b: { op: 'literal', value: true } };
		}
		assert.throws(
			() => parseFootprintRulePredicate(p),
			err => err instanceof FootprintRuleParseError && err.code === 'DEPTH'
		);
	});

	it('throws TOO_MANY_RULES when array length exceeds cap', () => {
		const one = { when: { op: 'literal' as const, value: true }, style: {} };
		const many = Array.from({ length: 33 }, () => one);
		assert.throws(
			() => parseFootprintColumnColorRules(many),
			err => err instanceof FootprintRuleParseError && err.code === 'TOO_MANY_RULES'
		);
	});

	it('throws TOO_MANY_NODES when summed AST nodes exceed cap', () => {
		const when = {
			op: 'and' as const,
			a: { op: 'cmp' as const, metric: 'm', cmp: 'eq' as const, value: 0 },
			b: { op: 'cmp' as const, metric: 'm', cmp: 'eq' as const, value: 1 },
		};
		const many = Array.from({ length: 22 }, () => ({
			when,
			style: { textColor: '#fff' },
		}));
		assert.throws(
			() => parseFootprintColumnColorRules(many),
			err => err instanceof FootprintRuleParseError && err.code === 'TOO_MANY_NODES'
		);
	});

	it('evaluates cmp and and', () => {
		const ast = parseFootprintRulePredicate({
			op: 'and',
			a: { op: 'cmp', metric: 'bid', cmp: 'gt', value: 10 },
			b: { op: 'cmp', metric: 'ask', cmp: 'lt', value: 35 },
		});
		assert.equal(evaluateFootprintRulePredicate(ast, { bid: 20, ask: 30 }), true);
		assert.equal(evaluateFootprintRulePredicate(ast, { bid: 5, ask: 30 }), false);
	});

	it('parseFootprintStylePatch accepts numberHistogram and cellOutline', () => {
		const s = parseFootprintStylePatch({
			numberHistogram: { sourceMetricId: 'bid', direction: 'left', color: 'rgba(1,2,3,0.5)' },
			cellOutline: { color: '#ff0', widthPx: 2 },
			textColor: '#ccc',
		});
		assert.equal(s.textColor, '#ccc');
		assert.deepEqual(s.numberHistogram, { sourceMetricId: 'bid', direction: 'left', color: 'rgba(1,2,3,0.5)' });
		assert.deepEqual(s.cellOutline, { color: '#ff0', widthPx: 2 });
	});

	it('resolveColumnStyleForCell merges rule patches over base style (histogram + outline)', () => {
		const column = {
			style: parseFootprintStylePatch({
				numberHistogram: { sourceMetricId: 'bid', direction: 'left', color: 'rgba(0,0,0,0.3)' },
			}),
			colorRules: parseFootprintColumnColorRules([
				{
					when: { op: 'cmp', metric: 'bid', cmp: 'gt', value: 10 },
					style: { cellOutline: { color: '#0f0', widthPx: 1 } },
				},
			]),
		};
		const out = resolveColumnStyleForCell(column, { bid: 20 });
		assert.equal(out.numberHistogram?.direction, 'left');
		assert.deepEqual(out.cellOutline, { color: '#0f0', widthPx: 1 });
	});

	it('resolveColumnStyleForCell uses first matching rule (order)', () => {
		const column = {
			colorRules: parseFootprintColumnColorRules([
				{ when: { op: 'cmp', metric: 'delta', cmp: 'gt', value: 0 }, style: { textColor: '#green' } },
				{ when: { op: 'literal', value: true }, style: { textColor: '#neutral' } },
			]),
		};
		const pos = resolveColumnStyleForCell(column, { delta: 5 });
		assert.equal(pos.textColor, '#green');
		const zero = resolveColumnStyleForCell(column, { delta: 0 });
		assert.equal(zero.textColor, '#neutral');
	});

	it('preset v1 parses colorRules on columns', async () => {
		const { readFile } = await import('node:fs/promises');
		const { fileURLToPath } = await import('node:url');
		const { dirname, join } = await import('node:path');
		const dir = dirname(fileURLToPath(import.meta.url));
		const raw = await readFile(join(dir, '..', 'test', 'fixtures', 'rule-colors-delta-column.json'), 'utf8');
		const preset = parseFootprintPresetV1(JSON.parse(raw));
		const partial = presetToPartialOptions(preset);
		const col = partial.right?.columns[0];
		assert.ok(col?.colorRules);
		assert.equal(col.colorRules.length, 3);
	});
});
