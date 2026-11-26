/**
 * Mouse and touch camera on the game canvas:
 * - drag with any mouse button (or one finger) to orbit around Lou; right-drag doesn't open the context menu;
 * - the wheel zooms smoothly (eased, proportional steps, so a notch feels the same close up and far out;
 *   mouse wheels and trackpads both feel right);
 * - two fingers pinch to zoom on a touch screen.
 */
export interface MouseCamHooks {
  /** Turn the camera: yaw and pitch in radians (screen right/down are positive drags). */
  orbit(dYaw: number, dPitch: number): void;
  getDist(): number;
  setDist(d: number): void;
  setDragging(on: boolean): void;
}

const MIN_DIST = 1.8;
const MAX_DIST = 16;
const clampDist = (d: number) => Math.min(MAX_DIST, Math.max(MIN_DIST, d));

export function installMouseCamera(canvas: HTMLCanvasElement, hooks: MouseCamHooks): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let pinchDist = 0;
  let zoomTarget = -1;
  let zoomRaf = 0;
  let lastT = 0;

  const ease = (t: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    const d = hooks.getDist();
    const next = d + (zoomTarget - d) * (1 - Math.exp(-dt * 14));
    if (Math.abs(zoomTarget - next) < 0.005) {
      hooks.setDist(zoomTarget);
      zoomRaf = 0;
      return;
    }
    hooks.setDist(next);
    zoomRaf = requestAnimationFrame(ease);
  };
  const zoomTo = (target: number) => {
    zoomTarget = clampDist(target);
    if (!zoomRaf) {
      lastT = performance.now();
      zoomRaf = requestAnimationFrame(ease);
    }
  };

  const pinchSpan = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      pinchStart = pinchSpan();
      pinchDist = zoomRaf ? zoomTarget : hooks.getDist();
    }
    hooks.setDragging(true);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size >= 2) {
      if (pinchStart > 0) zoomTo(pinchDist * (pinchStart / Math.max(1, pinchSpan())));
      return;
    }
    // Touch drags cover fewer pixels than a mouse sweep for the same turn: give fingers a bit more.
    const k = e.pointerType === 'touch' ? 1.35 : 1;
    hooks.orbit(-dx * 0.0062 * k, dy * 0.0048 * k);
  });
  const end = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      hooks.setDragging(false);
      canvas.classList.remove('is-dragging');
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Lines / pages (Firefox, some mice) to pixels; trackpads send many small pixel deltas.
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const from = zoomRaf ? zoomTarget : hooks.getDist();
      zoomTo(from * Math.exp(Math.max(-0.5, Math.min(0.5, px * 0.0016))));
    },
    { passive: false }
  );
}
