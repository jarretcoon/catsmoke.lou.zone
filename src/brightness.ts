/**
 * Player brightness: one multiplier on the tone-mapping exposure (1 = the game's own look), saved in
 * localStorage. The render loop reads getBrightness() every frame, so a change shows at once on every
 * graphics setting (it needs no extra pass). mountBrightnessSlider() builds the small slider for a menu.
 */

const KEY = 'smoking-cat-sim.brightness';
export const BRIGHTNESS_MIN = 0.6;
export const BRIGHTNESS_MAX = 1.6;

const clamp = (v: number) => Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, v));

let value = (() => {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? '');
    if (Number.isFinite(v)) return clamp(v);
  } catch {
    /* storage blocked: use the default */
  }
  return 1;
})();

const listeners = new Set<(v: number) => void>();

export function getBrightness(): number {
  return value;
}

export function setBrightness(v: number): void {
  if (!Number.isFinite(v)) return;
  value = clamp(v);
  try {
    if (Math.abs(value - 1) < 0.005) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value.toFixed(2));
  } catch {
    /* storage blocked: keep it for this session */
  }
  for (const fn of listeners) fn(value);
}

/** Called with the new value whenever it changes (from any slider). Returns an unsubscribe function. */
export function onBrightnessChange(fn: (v: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * A labelled range slider ("Brightness 100%") that reads and writes the setting, with a double-click
 * reset. Placed just before `anchor` when given (its own row above a menu's buttons); returns the
 * element so a menu can place it itself.
 */
export function mountBrightnessSlider(anchor?: Element | null): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'action-btn brightness-control';
  label.title = 'Brightness (double-click to reset)';
  label.style.display = 'flex';
  label.style.width = 'fit-content';
  label.style.alignItems = 'center';
  label.style.gap = '0.6rem';
  label.style.margin = '0 0 0.7rem';
  const text = document.createElement('span');
  text.style.whiteSpace = 'nowrap';
  text.style.minWidth = '8.5em';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(BRIGHTNESS_MIN);
  input.max = String(BRIGHTNESS_MAX);
  input.step = '0.05';
  input.setAttribute('aria-label', 'Brightness');
  input.style.width = '9rem';
  input.style.accentColor = '#ffd36e';
  const show = (v: number) => {
    input.value = String(v);
    text.textContent = `Brightness ${Math.round(v * 100)}%`;
  };
  show(value);
  input.addEventListener('input', () => setBrightness(parseFloat(input.value)));
  label.addEventListener('dblclick', () => setBrightness(1));
  onBrightnessChange(show);
  label.append(text, input);
  anchor?.before(label);
  return label;
}
