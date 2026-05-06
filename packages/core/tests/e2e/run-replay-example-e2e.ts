/**
 * Puppeteer: built `examples/replay` bundle — playhead scrubs visible bar count (HCP-011).
 *
 * Prerequisites: root `npm run build`, then `packages/core` `npm install` + `npm run build`.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

/** Must match `REPLAY_BAR_COUNT` in `examples/replay/main.ts`. */
const REPLAY_E2E_BAR_COUNT = 24;

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(e2eDir, '..', '..');
const distRoot = path.join(pkgRoot, 'examples', 'replay', 'dist');

function contentType(filePath: string): string {
	if (filePath.endsWith('.html')) {
		return 'text/html; charset=utf-8';
	}
	if (filePath.endsWith('.js')) {
		return 'text/javascript; charset=utf-8';
	}
	if (filePath.endsWith('.css')) {
		return 'text/css; charset=utf-8';
	}
	return 'application/octet-stream';
}

function startStaticServer(port: number, root: string): Promise<() => void> {
	const rootResolved = path.resolve(root);
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			try {
				const u = new URL(req.url ?? '/', 'http://127.0.0.1');
				let rel = u.pathname;
				if (rel === '/' || rel === '') {
					rel = 'index.html';
				} else if (rel.startsWith('/')) {
					rel = rel.slice(1);
				}
				const fp = path.resolve(path.join(rootResolved, rel));
				if (fp !== rootResolved && !fp.startsWith(rootResolved + path.sep)) {
					res.statusCode = 403;
					res.end();
					return;
				}
				if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
					res.statusCode = 404;
					res.end();
					return;
				}
				res.setHeader('Content-Type', contentType(fp));
				fs.createReadStream(fp).pipe(res);
			} catch {
				res.statusCode = 500;
				res.end();
			}
		});
		server.listen(port, '127.0.0.1', () => {
			resolve(() => {
				server.close();
			});
		});
		server.on('error', reject);
	});
}

async function main(): Promise<void> {
	execSync('npx vite build --config examples/replay/vite.config.ts', {
		cwd: pkgRoot,
		stdio: 'inherit',
	});
	if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
		throw new Error(`missing ${distRoot}/index.html after vite build`);
	}

	const port = 51900 + Math.floor(Math.random() * 200);
	const close = await startStaticServer(port, distRoot);
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
	});
	try {
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		const expectCount = String(REPLAY_E2E_BAR_COUNT);
		await page.waitForFunction(
			`document.querySelector('[data-testid="replay-visible-count"]')?.textContent?.trim() === "${expectCount}"`,
			{ timeout: 60_000 }
		);

		const atEnd = await page.$eval('[data-testid="replay-visible-count"]', el => el.textContent?.trim());
		if (atEnd !== expectCount) {
			throw new Error(`expected ${expectCount} visible bars at max playhead, got ${atEnd}`);
		}

		await page.evaluate(() => {
			const r = document.querySelector('#playhead') as HTMLInputElement;
			r.value = '0';
			r.dispatchEvent(new Event('input', { bubbles: true }));
		});
		const atStart = await page.$eval('[data-testid="replay-visible-count"]', el => el.textContent?.trim());
		if (atStart !== '1') {
			throw new Error(`expected 1 visible bar at min playhead, got ${atStart}`);
		}

		const mode = await page.$eval('[data-testid="replay-mode"]', el => el.textContent?.trim());
		if (mode !== 'replay') {
			throw new Error(`expected replay badge, got ${mode}`);
		}

		console.log('replay example e2e: ok');
	} finally {
		await browser.close();
		close();
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
