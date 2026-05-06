import { CanvasHost } from './lib/canvas-host.js';
import { CANVAS_DEMOS, defaultCanvasDemo, getCanvasDemoById } from './demos/registry.js';

function readDemoId(): string {
	const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
	const raw = q.get('demo');
	return raw !== null && raw.trim() !== '' ? raw.trim() : defaultCanvasDemo().id;
}

function mount(): void {
	const root = document.getElementById('canvas-root');
	if (root === null) {
		throw new Error('#canvas-root missing');
	}
	const id = readDemoId();
	const scene = getCanvasDemoById(id) ?? defaultCanvasDemo();
	const nav = document.getElementById('demo-nav');
	if (nav !== null) {
		nav.innerHTML = CANVAS_DEMOS.map(
			d =>
				`<a href="?demo=${encodeURIComponent(d.id)}" class="${d.id === scene.id ? 'active' : ''}">${d.title}</a>`
		).join(' <span class="sep">·</span> ');
	}
	const meta = document.getElementById('meta');
	if (meta !== null) {
		meta.textContent = `${scene.title} — add demos under examples/custom-canvas/demos/ and register in demos/registry.ts`;
	}
	const host = new CanvasHost(root, scene, { clearColor: '#131722' });
	window.addEventListener('beforeunload', () => host.destroy());
}

mount();
