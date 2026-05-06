/**
 * Minimal host for 2D canvas demos: DPR-aware sizing, resize observation, one scene per surface.
 * Add new visuals by implementing {@link CanvasScene} and registering them in `../demos/registry.ts`.
 */

export interface CanvasLayout {
	/** Layout width in CSS pixels (after `setTransform(dpr)` the context uses this space). */
	readonly cssWidth: number;
	readonly cssHeight: number;
	readonly devicePixelRatio: number;
	readonly pixelWidth: number;
	readonly pixelHeight: number;
}

/**
 * One drawable unit (butterfly chart, future gauges, etc.). Keep draw logic stateless where possible;
 * stash mutable state on the implementing class.
 */
export interface CanvasScene {
	readonly id: string;
	/** Human-readable label for the demo picker / README. */
	readonly title: string;
	draw(ctx: CanvasRenderingContext2D, layout: CanvasLayout): void;
	/** Optional hook when the container size changes (default: only `draw` is called). */
	onResize?(layout: CanvasLayout): void;
	/** Tear down timers, observers, etc. */
	destroy?(): void;
}

export interface CanvasHostOptions {
	/** Optional background cleared before each draw (CSS color). */
	readonly clearColor?: string;
}

export class CanvasHost {
	private readonly _container: HTMLElement;
	private readonly _canvas: HTMLCanvasElement;
	private readonly _opts: CanvasHostOptions;
	private _scene: CanvasScene;
	private _ro: ResizeObserver | null = null;

	public constructor(container: HTMLElement, scene: CanvasScene, opts: CanvasHostOptions = {}) {
		this._container = container;
		this._opts = opts;
		this._scene = scene;
		this._canvas = document.createElement('canvas');
		this._canvas.style.display = 'block';
		this._canvas.style.width = '100%';
		this._canvas.style.height = '100%';
		container.appendChild(this._canvas);
		this._bindResize();
		this.redraw();
	}

	public get scene(): CanvasScene {
		return this._scene;
	}

	/** Swap the active scene (e.g. from a router); triggers resize + draw. */
	public setScene(scene: CanvasScene): void {
		this._scene.destroy?.();
		this._scene = scene;
		this.redraw();
	}

	public redraw(): void {
		const ctx = this._canvas.getContext('2d');
		if (ctx === null) {
			return;
		}
		const rect = this._container.getBoundingClientRect();
		const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
		const cssW = Math.max(1, Math.floor(rect.width));
		const cssH = Math.max(1, Math.floor(rect.height));
		this._canvas.width = Math.floor(cssW * dpr);
		this._canvas.height = Math.floor(cssH * dpr);
		this._canvas.style.width = `${String(cssW)}px`;
		this._canvas.style.height = `${String(cssH)}px`;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const layout: CanvasLayout = {
			cssWidth: cssW,
			cssHeight: cssH,
			devicePixelRatio: dpr,
			pixelWidth: this._canvas.width,
			pixelHeight: this._canvas.height,
		};
		this._scene.onResize?.(layout);
		const clear = this._opts.clearColor ?? '#131722';
		ctx.fillStyle = clear;
		ctx.fillRect(0, 0, cssW, cssH);
		this._scene.draw(ctx, layout);
	}

	public destroy(): void {
		this._scene.destroy?.();
		this._ro?.disconnect();
		this._ro = null;
		this._canvas.remove();
	}

	private _bindResize(): void {
		if (typeof ResizeObserver === 'undefined') {
			window.addEventListener('resize', () => this.redraw());
			return;
		}
		this._ro = new ResizeObserver(() => this.redraw());
		this._ro.observe(this._container);
	}
}
