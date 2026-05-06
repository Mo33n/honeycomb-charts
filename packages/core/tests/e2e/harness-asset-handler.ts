/**
 * Shared static asset handler for browser ESM harnesses (e2e, graphics, memleak smoke).
 * Serves full honeycomb `dist/` under `/hc/`, `fancy-canvas` under `/vendor/fancy-canvas/`,
 * and the core bundle as `/lwc.mjs`.
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

export interface HarnessAssetPaths {
	repoRoot: string;
	pkgRoot: string;
	fixturesDir: string;
	/** When set, serves `/graphics.html` + `/graphics-harness.mjs` for PNG baselines (T-101 / T-033). */
	readonly graphicsFixturesDir?: string;
}

const contentType = 'Content-Type';

function safeResolvedPath(rootAbs: string, relativeUrlPath: string): string | null {
	const trimmed = relativeUrlPath.replace(/^\/+/, '');
	if (trimmed.includes('..')) {
		return null;
	}
	const full = path.resolve(rootAbs, trimmed);
	if (!full.startsWith(rootAbs + path.sep) && full !== rootAbs) {
		return null;
	}
	return full;
}

export function assertHarnessAssetsExist(paths: HarnessAssetPaths): void {
	const lwc = path.join(paths.repoRoot, 'dist', 'lightweight-charts.development.mjs');
	const hcIndex = path.join(paths.pkgRoot, 'dist', 'index.js');
	const fcIndex = path.join(paths.pkgRoot, 'node_modules', 'fancy-canvas', 'index.mjs');
	for (const [label, p] of [
		['lightweight-charts development bundle', lwc],
		['honeycomb dist/index.js', hcIndex],
		['fancy-canvas', fcIndex],
	] as const) {
		if (!fs.existsSync(p)) {
			throw new Error(`Missing ${label}: ${p}. Run root build and package build.`);
		}
	}
	if (paths.graphicsFixturesDir !== undefined) {
		const gi = path.join(paths.graphicsFixturesDir, 'index.html');
		const gh = path.join(paths.graphicsFixturesDir, 'graphics-harness.mjs');
		const gg = path.join(paths.graphicsFixturesDir, 'generic-graphics.html');
		const ggm = path.join(paths.graphicsFixturesDir, 'generic-graphics-harness.mjs');
		for (const [label, p] of [
			['graphics fixtures index.html', gi],
			['graphics-harness.mjs', gh],
			['generic-graphics.html', gg],
			['generic-graphics-harness.mjs', ggm],
		] as const) {
			if (!fs.existsSync(p)) {
				throw new Error(`Missing ${label}: ${p}`);
			}
		}
	}
}

function sendJsFile(res: http.ServerResponse, filePath: string): void {
	res.writeHead(200, { [contentType]: 'application/javascript; charset=utf-8' });
	res.end(fs.readFileSync(filePath));
}

function tryServeGraphicsFixture(
	res: http.ServerResponse,
	url: string,
	graphicsFixturesDir: string
): boolean {
	if (url === '/graphics.html' || url === '/graphics/') {
		res.writeHead(200, { [contentType]: 'text/html; charset=utf-8' });
		res.end(fs.readFileSync(path.join(graphicsFixturesDir, 'index.html'), 'utf8'));
		return true;
	}
	if (url === '/graphics-harness.mjs') {
		sendJsFile(res, path.join(graphicsFixturesDir, 'graphics-harness.mjs'));
		return true;
	}
	if (url === '/generic-graphics.html' || url === '/generic-graphics/') {
		res.writeHead(200, { [contentType]: 'text/html; charset=utf-8' });
		res.end(fs.readFileSync(path.join(graphicsFixturesDir, 'generic-graphics.html'), 'utf8'));
		return true;
	}
	if (url === '/generic-graphics-harness.mjs') {
		sendJsFile(res, path.join(graphicsFixturesDir, 'generic-graphics-harness.mjs'));
		return true;
	}
	return false;
}

function trySendFileUnderRoot(res: http.ServerResponse, rootAbs: string, urlPrefix: string, url: string): boolean {
	if (!url.startsWith(urlPrefix)) {
		return false;
	}
	const rel = url.slice(urlPrefix.length);
	const file = safeResolvedPath(rootAbs, rel);
	if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
		res.writeHead(404);
		res.end();
		return true;
	}
	sendJsFile(res, file);
	return true;
}

export function createHarnessAssetListener(paths: HarnessAssetPaths): http.RequestListener {
	const lwcPath = path.join(paths.repoRoot, 'dist', 'lightweight-charts.development.mjs');
	const fancyRoot = path.resolve(paths.pkgRoot, 'node_modules', 'fancy-canvas');
	const hcDist = path.resolve(paths.pkgRoot, 'dist');

	return (req, res): void => {
		const url = req.url?.split('?')[0] ?? '/';
		try {
			if (url === '/favicon.ico') {
				res.writeHead(204);
				res.end();
				return;
			}
			if (url === '/lwc.mjs') {
				sendJsFile(res, lwcPath);
				return;
			}
			if (trySendFileUnderRoot(res, fancyRoot, '/vendor/fancy-canvas/', url)) {
				return;
			}
			if (trySendFileUnderRoot(res, hcDist, '/hc/', url)) {
				return;
			}
			if (url === '/harness.mjs') {
				sendJsFile(res, path.join(paths.fixturesDir, 'harness.mjs'));
				return;
			}
			if (paths.graphicsFixturesDir !== undefined && tryServeGraphicsFixture(res, url, paths.graphicsFixturesDir)) {
				return;
			}
			if (url === '/' || url === '/index.html') {
				res.writeHead(200, { [contentType]: 'text/html; charset=utf-8' });
				res.end(fs.readFileSync(path.join(paths.fixturesDir, 'index.html'), 'utf8'));
				return;
			}
			res.writeHead(404);
			res.end('not found');
		} catch (e) {
			res.writeHead(500);
			res.end(String(e));
		}
	};
}
