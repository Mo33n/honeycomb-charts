/**
 * AJV validation of `config.json` against `config.schema.json` (draft 2020-12).
 * @module honeycomb/lib/validate-catalog-schema
 */
import Ajv2020 from 'ajv/dist/2020.js';

/**
 * @param {unknown} schema
 * @param {unknown} data
 * @returns {{ ok: true } | { ok: false; errors: import('ajv').ErrorObject[] | null | undefined }}
 */
export function validateCatalogAgainstSchema(schema, data) {
	const ajv = new Ajv2020({ allErrors: true, strict: false });
	const validate = ajv.compile(/** @type {import('ajv').AnySchema} */ (schema));
	const ok = /** @type {boolean} */ (validate(data));
	if (ok) {
		return { ok: true };
	}
	return { ok: false, errors: validate.errors };
}

/**
 * @param {string} messagePrefix
 * @param {import('ajv').ErrorObject[] | null | undefined} errors
 * @returns {string}
 */
export function formatAjvErrors(messagePrefix, errors) {
	if (!errors || errors.length === 0) {
		return `${messagePrefix} (no error details)`;
	}
	return (
		messagePrefix +
		'\n' +
		errors
			.map(e => {
				const p = e.instancePath || '(root)';
				return `  ${p}: ${e.message ?? ''} (${String(e.keyword)})`;
			})
			.join('\n')
	);
}
