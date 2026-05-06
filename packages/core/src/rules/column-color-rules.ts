/**
 * Declarative per-column color rules (RFC D3 / HC1-B). Data-only AST — no `eval` / `Function`.
 *
 * Style patch shape matches {@link FootprintColumnStyle} in `footprint-series-options.ts` (this
 * module stays independent to avoid circular imports).
 */
/** Same optional keys as `FootprintColumnStyle` for rule outcomes. */
export interface FootprintRuleStylePatch {
	readonly textColor?: string;
	readonly barPositiveColor?: string;
	readonly barNegativeColor?: string;
	readonly numberHistogram?: {
		readonly sourceMetricId: string;
		readonly direction: 'left' | 'right';
		readonly color: string;
	};
	readonly cellOutline?: {
		readonly color: string;
		readonly widthPx: number;
	};
}

/** Maximum nesting depth of `and` / `or` nodes (inclusive); literal and `cmp` have depth 1. */
export const FOOTPRINT_COLOR_RULE_MAX_DEPTH = 12;

/** Hard cap on predicate nodes summed across all rules on one column. */
export const FOOTPRINT_COLOR_RULE_MAX_AST_NODES = 64;

/** Hard cap on rules per column (array length). */
export const FOOTPRINT_COLOR_RULE_MAX_RULES = 32;

export type FootprintRuleCmpOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export type FootprintRulePredicateAst =
	| { readonly op: 'literal'; readonly value: boolean }
	| { readonly op: 'cmp'; readonly metric: string; readonly cmp: FootprintRuleCmpOp; readonly value: number }
	| { readonly op: 'and' | 'or'; readonly a: FootprintRulePredicateAst; readonly b: FootprintRulePredicateAst };

export interface FootprintColumnColorRule {
	readonly when: FootprintRulePredicateAst;
	readonly style: FootprintRuleStylePatch;
}

export type FootprintRuleParseErrorCode =
	| 'UNKNOWN_OP'
	| 'DEPTH'
	| 'TOO_MANY_NODES'
	| 'TOO_MANY_RULES'
	| 'INVALID_SHAPE';

export class FootprintRuleParseError extends Error {
	public override readonly name = 'FootprintRuleParseError';
	public constructor(
		public readonly code: FootprintRuleParseErrorCode,
		message: string
	) {
		super(message);
	}
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null;
}

const CMP_OPS: ReadonlySet<FootprintRuleCmpOp> = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);

function countAstNodes(ast: FootprintRulePredicateAst): number {
	if (ast.op === 'literal' || ast.op === 'cmp') {
		return 1;
	}
	return 1 + countAstNodes(ast.a) + countAstNodes(ast.b);
}

function astDepth(ast: FootprintRulePredicateAst): number {
	if (ast.op === 'literal' || ast.op === 'cmp') {
		return 1;
	}
	return 1 + Math.max(astDepth(ast.a), astDepth(ast.b));
}

function parseCmpOp(x: unknown): FootprintRuleCmpOp {
	if (typeof x === 'string' && CMP_OPS.has(x as FootprintRuleCmpOp)) {
		return x as FootprintRuleCmpOp;
	}
	throw new FootprintRuleParseError('INVALID_SHAPE', `Invalid cmp operator: ${String(x)}`);
}

/**
 * Parses a JSON-serializable predicate into a typed AST (throws {@link FootprintRuleParseError}).
 */
export function parseFootprintRulePredicate(x: unknown): FootprintRulePredicateAst {
	const ast = parseFootprintRulePredicateInner(x);
	const d = astDepth(ast);
	if (d > FOOTPRINT_COLOR_RULE_MAX_DEPTH) {
		throw new FootprintRuleParseError('DEPTH', `Rule predicate depth ${String(d)} exceeds max ${String(FOOTPRINT_COLOR_RULE_MAX_DEPTH)}`);
	}
	const n = countAstNodes(ast);
	if (n > FOOTPRINT_COLOR_RULE_MAX_AST_NODES) {
		throw new FootprintRuleParseError('TOO_MANY_NODES', `Rule predicate has ${String(n)} nodes; max is ${String(FOOTPRINT_COLOR_RULE_MAX_AST_NODES)}`);
	}
	return ast;
}

function parseFootprintRulePredicateInner(x: unknown): FootprintRulePredicateAst {
	if (!isRecord(x)) {
		throw new FootprintRuleParseError('INVALID_SHAPE', 'Predicate must be an object');
	}
	const op = x['op'];
	if (op === 'literal') {
		if (typeof x['value'] !== 'boolean') {
			throw new FootprintRuleParseError('INVALID_SHAPE', 'literal.value must be boolean');
		}
		return { op: 'literal', value: x['value'] };
	}
	if (op === 'cmp') {
		const metric = x['metric'];
		const value = x['value'];
		if (typeof metric !== 'string' || metric.length === 0) {
			throw new FootprintRuleParseError('INVALID_SHAPE', 'cmp.metric must be a non-empty string');
		}
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new FootprintRuleParseError('INVALID_SHAPE', 'cmp.value must be a finite number');
		}
		return { op: 'cmp', metric, cmp: parseCmpOp(x['cmp']), value };
	}
	if (op === 'and' || op === 'or') {
		return {
			op,
			a: parseFootprintRulePredicateInner(x['a']),
			b: parseFootprintRulePredicateInner(x['b']),
		};
	}
	throw new FootprintRuleParseError('UNKNOWN_OP', `Unknown rule op: ${String(op)}`);
}

function parseNumberHistogramStyle(x: unknown): FootprintRuleStylePatch['numberHistogram'] | undefined {
	if (!isRecord(x)) {
		return undefined;
	}
	const sourceMetricId = x['sourceMetricId'];
	const direction = x['direction'];
	const color = x['color'];
	if (
		typeof sourceMetricId !== 'string' ||
		(direction !== 'left' && direction !== 'right') ||
		typeof color !== 'string'
	) {
		return undefined;
	}
	return { sourceMetricId, direction, color };
}

function parseCellOutlineStyle(x: unknown): FootprintRuleStylePatch['cellOutline'] | undefined {
	if (!isRecord(x)) {
		return undefined;
	}
	const color = x['color'];
	const widthPx = x['widthPx'];
	if (typeof color !== 'string' || typeof widthPx !== 'number' || !Number.isFinite(widthPx) || widthPx <= 0) {
		return undefined;
	}
	return { color, widthPx };
}

/**
 * Parses a column static `style` object or a color-rule `style` patch (same shape).
 * @throws {@link FootprintRuleParseError} when `x` is not a non-null object.
 */
export function parseFootprintStylePatch(x: unknown): FootprintRuleStylePatch {
	if (!isRecord(x)) {
		throw new FootprintRuleParseError('INVALID_SHAPE', 'Style must be an object');
	}
	const textColor = x['textColor'];
	const barPositiveColor = x['barPositiveColor'];
	const barNegativeColor = x['barNegativeColor'];
	const numberHistogram = parseNumberHistogramStyle(x['numberHistogram']);
	const cellOutline = parseCellOutlineStyle(x['cellOutline']);
	return {
		...(typeof textColor === 'string' ? { textColor } : {}),
		...(typeof barPositiveColor === 'string' ? { barPositiveColor } : {}),
		...(typeof barNegativeColor === 'string' ? { barNegativeColor } : {}),
		...(numberHistogram !== undefined ? { numberHistogram } : {}),
		...(cellOutline !== undefined ? { cellOutline } : {}),
	};
}

function parseStyle(x: unknown): FootprintRuleStylePatch {
	return parseFootprintStylePatch(x);
}

export function parseFootprintColumnColorRules(x: unknown): readonly FootprintColumnColorRule[] {
	if (!Array.isArray(x)) {
		throw new FootprintRuleParseError('INVALID_SHAPE', 'colorRules must be an array');
	}
	if (x.length > FOOTPRINT_COLOR_RULE_MAX_RULES) {
		throw new FootprintRuleParseError(
			'TOO_MANY_RULES',
			`colorRules length ${String(x.length)} exceeds max ${String(FOOTPRINT_COLOR_RULE_MAX_RULES)}`
		);
	}
	let totalNodes = 0;
	const out: FootprintColumnColorRule[] = [];
	for (const item of x) {
		if (!isRecord(item)) {
			throw new FootprintRuleParseError('INVALID_SHAPE', 'Each color rule must be an object');
		}
		const when = parseFootprintRulePredicate(item['when']);
		totalNodes += countAstNodes(when);
		if (totalNodes > FOOTPRINT_COLOR_RULE_MAX_AST_NODES) {
			throw new FootprintRuleParseError(
				'TOO_MANY_NODES',
				`Total AST nodes across colorRules exceeds ${String(FOOTPRINT_COLOR_RULE_MAX_AST_NODES)}`
			);
		}
		out.push({
			when,
			style: parseStyle(item['style']),
		});
	}
	return out;
}

function readMetric(values: Readonly<Record<string, number>>, metric: string): number | undefined {
	const v = values[metric];
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function cmpEval(left: number, op: FootprintRuleCmpOp, right: number): boolean {
	switch (op) {
		case 'gt':
			return left > right;
		case 'gte':
			return left >= right;
		case 'lt':
			return left < right;
		case 'lte':
			return left <= right;
		case 'eq':
			return left === right;
		case 'neq':
			return left !== right;
	}
}

/**
 * Evaluates a predicate against numeric cell metrics for one price row.
 */
export function evaluateFootprintRulePredicate(
	ast: FootprintRulePredicateAst,
	values: Readonly<Record<string, number>>
): boolean {
	switch (ast.op) {
		case 'literal':
			return ast.value;
		case 'cmp': {
			const lv = readMetric(values, ast.metric);
			if (lv === undefined) {
				return false;
			}
			return cmpEval(lv, ast.cmp, ast.value);
		}
		case 'and':
			return evaluateFootprintRulePredicate(ast.a, values) && evaluateFootprintRulePredicate(ast.b, values);
		case 'or':
			return evaluateFootprintRulePredicate(ast.a, values) || evaluateFootprintRulePredicate(ast.b, values);
	}
}

/**
 * **Evaluation order (HC1-022):** `colorRules` are tested **in array order**. The **first** rule
 * whose `when` is true supplies style keys; only keys present on that rule’s `style` object overlay
 * the column’s static {@link FootprintColumnDef.style}. Later rules are ignored for that cell.
 */
export function resolveColumnStyleForCell(
	column: {
		readonly style?: FootprintRuleStylePatch;
		readonly colorRules?: readonly FootprintColumnColorRule[];
	},
	values: Readonly<Record<string, number>>
): FootprintRuleStylePatch {
	const base: FootprintRuleStylePatch = column.style !== undefined ? { ...column.style } : {};
	const rules = column.colorRules;
	if (rules === undefined || rules.length === 0) {
		return base;
	}
	for (const rule of rules) {
		if (!evaluateFootprintRulePredicate(rule.when, values)) {
			continue;
		}
		return {
			...base,
			...rule.style,
		};
	}
	return base;
}
