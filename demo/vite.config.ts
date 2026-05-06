/* eslint-disable import/no-default-export -- Vite */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const honeycombRoot = path.resolve(demoDir, '..');
const chartsRoot = path.resolve(honeycombRoot, '..');
const honeycombRuntimeDist = path.join(honeycombRoot, 'packages', 'core', 'dist', 'index.js');

export default defineConfig({
	root: demoDir,
	server: {
		port: 5190,
		fs: {
			allow: [demoDir, honeycombRoot, chartsRoot],
		},
	},
	resolve: {
		alias: {
			'@honeycomb/charts': honeycombRuntimeDist,
			'@honeycomb/lib': path.join(honeycombRoot, 'lib'),
		},
	},
});
