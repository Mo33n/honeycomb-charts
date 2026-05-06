/* eslint-disable import/no-default-export, @typescript-eslint/naming-convention -- Vite entry & import map keys */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const examplesDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(examplesDir, '..', '..');

export default defineConfig({
	root: examplesDir,
	server: {
		port: 5183,
	},
	resolve: {
		alias: {
			'honeycomb-charts': path.join(pkgRoot, 'src/index.ts'),
			'lightweight-charts': path.join(pkgRoot, 'node_modules/lightweight-charts/dist/lightweight-charts.development.mjs'),
		},
	},
});
