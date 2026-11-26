import * as THREE from 'three';
import { rng } from './textures';

/**
 * Canvas textures and shaders for the grand resort interiors (Bellagio lobby, Forum Shops,
 * Grand Canal Shoppes, Luxor atrium, Caesars rotunda). Everything is drawn procedurally and cached.
 */

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, wrap = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Soft marble veining over whatever is already on the canvas region. */
function veins(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, n: number, seed: number, alpha = 0.35): void {
  const r = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.3 + r() * 0.7);
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.beginPath();
    let px = x + r() * w;
    let py = y + r() * h;
    ctx.moveTo(px, py);
    const ang = r() * Math.PI * 2;
    for (let k = 0; k < 7; k++) {
      px += Math.cos(ang + (r() - 0.5) * 1.4) * w * 0.12;
      py += Math.sin(ang + (r() - 0.5) * 1.4) * h * 0.12;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------
// Bellagio
// ------------------------------------------------------------------------------------------------

/** Bellagio lobby marble: cream field, green-and-gold inlaid star medallion, rust border bands (one tile = 6 m). */
export function bellagioMarbleTexture(): THREE.CanvasTexture {
  return cached('bellagio-marble', () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = '#efe4cf';
    ctx.fillRect(0, 0, 512, 512);
    veins(ctx, 0, 0, 512, 512, '#b7a07a', 40, 7, 0.4);
    // Border bands
    ctx.fillStyle = '#7a2e1e';
    ctx.fillRect(0, 0, 512, 14);
    ctx.fillRect(0, 0, 14, 512);
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(14, 14, 498, 4);
    ctx.fillRect(14, 14, 4, 498);
    // Medallion: concentric rings + 16-point compass star
    const cx = 263;
    const cy = 263;
    const ring = (r: number, col: string, w: number) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    ctx.fillStyle = '#1f4a3a';
    ctx.beginPath();
    ctx.arc(cx, cy, 170, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3e9d6';
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fill();
    veins(ctx, cx - 150, cy - 150, 300, 300, '#c2ab84', 14, 11, 0.35);
    ring(170, '#c9a24a', 5);
    ring(150, '#c9a24a', 3);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const long = i % 2 === 0;
      const R = long ? 140 : 92;
      const wdt = long ? 0.2 : 0.17;
      ctx.fillStyle = i % 4 === 0 ? '#7a2e1e' : long ? '#1f4a3a' : '#c9a24a';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - wdt) * 34, cy + Math.sin(a - wdt) * 34);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(a + wdt) * 34, cy + Math.sin(a + wdt) * 34);
      ctx.closePath();
      ctx.fill();
    }
    ring(30, '#c9a24a', 6);
    ctx.fillStyle = '#7a2e1e';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();
    // Corner fleurons
    for (const [x, y] of [
      [70, 70],
      [456, 70],
      [70, 456],
      [456, 456],
    ]) {
      ctx.fillStyle = '#1f4a3a';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-22, -22, 44, 44);
      ctx.fillStyle = '#c9a24a';
      ctx.fillRect(-10, -10, 20, 20);
      ctx.restore();
    }
    return finish(c);
  });
}

/** Striped fabric for the Bellagio casino canopies (u runs around the tent → radial stripes). */
export function canopyStripeTexture(a: string, b: string, trim: string): THREE.CanvasTexture {
  return cached(`canopy|${a}|${b}|${trim}`, () => {
    const [c, ctx] = canvas(512, 128);
    const n = 32;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? a : b;
      ctx.fillRect((i * 512) / n, 0, 512 / n + 1, 128);
    }
    // Soft fabric shading: darker in the folds between stripes
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient((i * 512) / n, 0, ((i + 1) * 512) / n, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.18)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect((i * 512) / n, 0, 512 / n, 128);
    }
    ctx.fillStyle = trim;
    ctx.fillRect(0, 118, 512, 10);
    return finish(c);
  });
}

// ------------------------------------------------------------------------------------------------
// Venetian
// ------------------------------------------------------------------------------------------------

/** The Venetian lobby floor: tumbling-block marble (cream, dove grey, rust) — one tile ≈ 3 m. */
export function venetianFloorTexture(): THREE.CanvasTexture {
  return cached('ven-floor', () => {
    const [c, ctx] = canvas(512, 512);
    const cols = ['#efe6d4', '#8d8a86', '#9b4b30'];
    ctx.fillStyle = '#efe6d4';
    ctx.fillRect(0, 0, 512, 512);
    // Unit hexagons (radius 1): period √3 across, 3 down. 4 × 2 periods fill the tile seamlessly.
    const R3 = Math.sqrt(3);
    ctx.save();
    ctx.scale(512 / (4 * R3), 512 / 6);
    const hex = (x: number, y: number) => {
      const pts = [0, 1, 2, 3, 4, 5].map((i) => [x + Math.cos((Math.PI / 3) * i - Math.PI / 2), y + Math.sin((Math.PI / 3) * i - Math.PI / 2)]);
      const faces = [
        [pts[5], pts[0], pts[1], [x, y]],
        [pts[1], pts[2], pts[3], [x, y]],
        [pts[3], pts[4], pts[5], [x, y]],
      ];
      faces.forEach((f, i) => {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(f[0][0], f[0][1]);
        for (const p of f.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,20,0.4)';
        ctx.lineWidth = 0.025;
        ctx.stroke();
      });
    };
    for (let row = -1; row <= 5; row++) {
      for (let col = -1; col <= 5; col++) hex(col * R3 + (row & 1 ? R3 / 2 : 0), row * 1.5);
    }
    ctx.restore();
    veins(ctx, 0, 0, 512, 512, '#ffffff', 30, 21, 0.18);
    return finish(c);
  });
}

/** Painted-and-gilded Venetian lobby ceiling: gold frame grid, sky panels with robed figures, a central oval. */
export function frescoCeilingTexture(): THREE.CanvasTexture {
  return cached('fresco', () => {
    const [c, ctx] = canvas(1024, 1024);
    const r = rng(77);
    ctx.fillStyle = '#7a5a2a';
    ctx.fillRect(0, 0, 1024, 1024);
    const sky = (x: number, y: number, w: number, h: number, oval = false) => {
      ctx.save();
      ctx.beginPath();
      if (oval) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h);
      ctx.clip();
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#5f8fc4');
      g.addColorStop(0.6, '#a9c6de');
      g.addColorStop(1, '#f0d6a8');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      // clouds
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = `rgba(255,250,240,${0.35 + r() * 0.4})`;
        const cx = x + r() * w;
        const cy = y + r() * h;
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(cx + (r() - 0.5) * w * 0.2, cy + (r() - 0.5) * h * 0.08, w * (0.05 + r() * 0.06), h * (0.03 + r() * 0.04), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // robed figures (cherubs and allegories): body blob + head + drapery
      const nf = oval ? 7 : 2 + Math.floor(r() * 2);
      for (let i = 0; i < nf; i++) {
        const fx = x + w * (0.15 + r() * 0.7);
        const fy = y + h * (0.25 + r() * 0.55);
        const sc = Math.min(w, h) * (oval ? 0.08 : 0.14);
        const robe = ['#b8324a', '#2f5fa8', '#d8a83a', '#e8dcc8', '#4a8a5a'][Math.floor(r() * 5)];
        ctx.fillStyle = robe;
        ctx.beginPath();
        ctx.ellipse(fx, fy, sc * 0.55, sc, (r() - 0.5) * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8b892';
        ctx.beginPath();
        ctx.arc(fx + (r() - 0.5) * sc * 0.3, fy - sc * 1.05, sc * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e8b892';
        ctx.lineWidth = sc * 0.14;
        ctx.beginPath();
        ctx.moveTo(fx, fy - sc * 0.5);
        ctx.lineTo(fx + (r() - 0.3) * sc * 1.4, fy - sc * (0.6 + r()));
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,210,0.65)';
        ctx.beginPath();
        ctx.ellipse(fx + sc * 0.6, fy - sc * 0.4, sc * 0.5, sc * 0.2, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    // Grid of panels around a central oval
    const frame = (x: number, y: number, w: number, h: number, oval = false) => {
      sky(x, y, w, h, oval);
      ctx.strokeStyle = '#e8c35a';
      ctx.lineWidth = 14;
      ctx.beginPath();
      if (oval) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h);
      ctx.stroke();
      ctx.strokeStyle = '#8a6420';
      ctx.lineWidth = 4;
      ctx.stroke();
    };
    // Gilded ground with scrollwork dots
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = r() > 0.5 ? '#c9a24a' : '#a07a30';
      ctx.fillRect(r() * 1024, r() * 1024, 3, 3);
    }
    frame(312, 262, 400, 500, true);
    for (const [x, y, w, h] of [
      [40, 40, 300, 180],
      [372, 40, 280, 160],
      [684, 40, 300, 180],
      [40, 804, 300, 180],
      [372, 824, 280, 160],
      [684, 804, 300, 180],
      [40, 262, 230, 240],
      [40, 532, 230, 240],
      [754, 262, 230, 240],
      [754, 532, 230, 240],
    ]) frame(x, y, w, h);
    return finish(c, false);
  });
}

/**
 * Venetian canal-side facades, 4 colour variants side by side (each 256×512 = 6 m × 12 m, 3 floors):
 * a shop arcade on the ground floor, pointed Gothic windows with green shutters above.
 * Returns the colour map and a matching emissive map (lit shop windows, a few lit rooms).
 */
export function venetianFacadeAtlas(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const map = cached('ven-facade', () => drawVenetian(false));
  const glow = cached('ven-facade-glow', () => drawVenetian(true));
  return { map, glow };
}

function drawVenetian(glow: boolean): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  const walls = ['#e0a77a', '#e9cf9a', '#c8735a', '#efe2c4'];
  const r = rng(glow ? 5 : 5);
  for (let v = 0; v < 4; v++) {
    const x0 = v * 256;
    ctx.fillStyle = glow ? '#000000' : walls[v];
    ctx.fillRect(x0, 0, 256, 512);
    if (!glow) {
      // weathering
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(${r() > 0.5 ? '90,60,40' : '255,250,235'},${0.04 + r() * 0.06})`;
        ctx.fillRect(x0 + r() * 256, r() * 512, 4 + r() * 18, 3 + r() * 14);
      }
      // stone string courses + ground-floor rustication
      ctx.fillStyle = '#efe7d6';
      for (const y of [170, 340]) ctx.fillRect(x0, y, 256, 9);
      ctx.fillRect(x0, 0, 256, 8);
      ctx.fillStyle = 'rgba(120,100,80,0.25)';
      for (let y = 360; y < 512; y += 20) ctx.fillRect(x0, y, 256, 2);
    }
    // Ground floor: two arched shop windows (lit)
    for (const sx of [24, 136]) {
      const wx = x0 + sx;
      ctx.beginPath();
      ctx.moveTo(wx, 508);
      ctx.lineTo(wx, 410);
      ctx.arc(wx + 48, 410, 48, Math.PI, 0);
      ctx.lineTo(wx + 96, 508);
      ctx.closePath();
      if (glow) {
        const g = ctx.createLinearGradient(0, 360, 0, 508);
        g.addColorStop(0, '#ffcf8a');
        g.addColorStop(1, '#ffb060');
        ctx.fillStyle = g;
        ctx.fill();
      } else {
        ctx.fillStyle = '#3a2a1c';
        ctx.fill();
        ctx.strokeStyle = '#f2ead8';
        ctx.lineWidth = 8;
        ctx.stroke();
        // mullions
        ctx.fillStyle = '#2a1e14';
        ctx.fillRect(wx + 46, 380, 4, 128);
        ctx.fillRect(wx, 450, 96, 3);
      }
    }
    // Upper floors: pairs of pointed Gothic windows with shutters
    for (const fy of [200, 30]) {
      for (const sx of [34, 146]) {
        const wx = x0 + sx;
        const wy = fy;
        const lit = glow && r() > 0.55;
        ctx.beginPath();
        ctx.moveTo(wx, wy + 120);
        ctx.lineTo(wx, wy + 40);
        ctx.quadraticCurveTo(wx, wy + 8, wx + 38, wy);
        ctx.quadraticCurveTo(wx + 76, wy + 8, wx + 76, wy + 40);
        ctx.lineTo(wx + 76, wy + 120);
        ctx.closePath();
        if (glow) {
          ctx.fillStyle = lit ? '#ffcf8f' : '#000000';
          ctx.fill();
        } else {
          ctx.fillStyle = '#26303a';
          ctx.fill();
          ctx.strokeStyle = '#f2ead8';
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.fillStyle = '#2f5a3e';
          ctx.fillRect(wx - 22, wy + 34, 18, 88);
          ctx.fillRect(wx + 80, wy + 34, 18, 88);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          for (let k = 0; k < 8; k++) {
            ctx.fillRect(wx - 22, wy + 38 + k * 10, 18, 2);
            ctx.fillRect(wx + 80, wy + 38 + k * 10, 18, 2);
          }
          ctx.fillStyle = '#c9d6dc';
          ctx.fillRect(wx + 36, wy + 14, 4, 106);
        }
      }
    }
  }
  return finish(c, false);
}

/** Roman two-storey storefronts for the Forum Shops (4 variants, 256×512 each = 6 m × 11 m). */
export function romanFacadeAtlas(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const map = cached('rom-facade', () => drawRoman(false));
  const glow = cached('rom-facade-glow', () => drawRoman(true));
  return { map, glow };
}

function drawRoman(glow: boolean): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  const walls = ['#e8dcc4', '#e3c9a0', '#d9b3a0', '#efe9dc'];
  const r = rng(91);
  for (let v = 0; v < 4; v++) {
    const x0 = v * 256;
    ctx.fillStyle = glow ? '#000000' : walls[v];
    ctx.fillRect(x0, 0, 256, 512);
    if (!glow) {
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(${r() > 0.5 ? '110,90,70' : '255,255,245'},${0.03 + r() * 0.05})`;
        ctx.fillRect(x0 + r() * 256, r() * 512, 6 + r() * 20, 4 + r() * 12);
      }
      // painted pilasters + entablature
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x0 + 4, 0, 18, 512);
      ctx.fillRect(x0 + 234, 0, 18, 512);
      ctx.fillStyle = 'rgba(120,90,60,0.25)';
      ctx.fillRect(x0 + 20, 0, 3, 512);
      ctx.fillRect(x0 + 250, 0, 3, 512);
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(x0, 236, 256, 14);
      ctx.fillStyle = '#b89a6a';
      ctx.fillRect(x0, 250, 256, 4);
    }
    // Ground floor: one big arched shop window with a door
    const wx = x0 + 36;
    ctx.beginPath();
    ctx.moveTo(wx, 512);
    ctx.lineTo(wx, 352);
    ctx.arc(wx + 92, 352, 92, Math.PI, 0);
    ctx.lineTo(wx + 184, 512);
    ctx.closePath();
    if (glow) {
      const g = ctx.createRadialGradient(wx + 92, 420, 10, wx + 92, 420, 140);
      g.addColorStop(0, '#fff2d0');
      g.addColorStop(1, '#ffb868');
      ctx.fillStyle = g;
      ctx.fill();
      // merchandise silhouettes stay dark
      ctx.fillStyle = '#2a1a10';
      for (let k = 0; k < 4; k++) ctx.fillRect(wx + 18 + k * 42, 440 + (k % 2) * 16, 22, 72);
    } else {
      ctx.fillStyle = '#3c2c1e';
      ctx.fill();
      ctx.strokeStyle = '#f4efe4';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.fillStyle = '#c9a24a';
      ctx.fillRect(wx + 88, 300, 8, 212);
      ctx.fillRect(wx, 400, 184, 4);
    }
    // Keystone
    if (!glow) {
      ctx.fillStyle = '#f4efe4';
      ctx.beginPath();
      ctx.moveTo(wx + 80, 254);
      ctx.lineTo(wx + 104, 254);
      ctx.lineTo(wx + 98, 272);
      ctx.lineTo(wx + 86, 272);
      ctx.closePath();
      ctx.fill();
    }
    // Upper floor: three windows with pediments
    for (let k = 0; k < 3; k++) {
      const ux = x0 + 34 + k * 68;
      if (glow) {
        ctx.fillStyle = r() > 0.4 ? '#ffd9a0' : '#000';
        ctx.fillRect(ux, 96, 52, 110);
      } else {
        ctx.fillStyle = '#2e3640';
        ctx.fillRect(ux, 96, 52, 110);
        ctx.strokeStyle = '#f4efe4';
        ctx.lineWidth = 6;
        ctx.strokeRect(ux, 96, 52, 110);
        ctx.fillStyle = '#f4efe4';
        ctx.beginPath();
        ctx.moveTo(ux - 8, 90);
        ctx.lineTo(ux + 26, 66);
        ctx.lineTo(ux + 60, 90);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(ux - 6, 206, 64, 8);
      }
    }
  }
  return finish(c, false);
}

/** Shop-name plates, one per row (gold/ivory lettering on dark grounds); returns v-range per name. */
export function signAtlas(names: string[], key: string, font = 'Georgia, serif'): { tex: THREE.CanvasTexture; rows: number } {
  const tex = cached(`signs|${key}`, () => {
    const rows = names.length;
    const [c, ctx] = canvas(512, 64 * rows);
    const bgs = ['#1d2a22', '#2a1414', '#14182a', '#221a10', '#101010', '#2a2414'];
    const fgs = ['#f2d27a', '#f6efe0', '#f2d27a', '#ffe7b0', '#f2d27a', '#ffffff'];
    names.forEach((n, i) => {
      const y = i * 64;
      ctx.fillStyle = bgs[i % bgs.length];
      ctx.fillRect(0, y, 512, 64);
      ctx.strokeStyle = '#c9a24a';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, y + 4, 504, 56);
      ctx.fillStyle = fgs[i % fgs.length];
      ctx.font = `bold 38px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n, 256, y + 34, 480);
    });
    return finish(c, false);
  });
  return { tex, rows: names.length };
}

// ------------------------------------------------------------------------------------------------
// Caesars
// ------------------------------------------------------------------------------------------------

/** Coffered dome / vault panels: recessed squares with rosettes, cream and gold (tileable). */
export function cofferTexture(): THREE.CanvasTexture {
  return cached('coffer', () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#e9e0cc';
    ctx.fillRect(0, 0, 256, 256);
    const step = 64;
    for (let x = 0; x < 256; x += step) {
      for (let y = 0; y < 256; y += step) {
        ctx.fillStyle = '#c8b894';
        ctx.fillRect(x + 8, y + 8, step - 16, step - 16);
        ctx.fillStyle = '#b3a07a';
        ctx.fillRect(x + 14, y + 14, step - 28, step - 28);
        ctx.fillStyle = '#d9b24a';
        ctx.beginPath();
        ctx.arc(x + step / 2, y + step / 2, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return finish(c);
  });
}

// ------------------------------------------------------------------------------------------------
// Luxor
// ------------------------------------------------------------------------------------------------

/** Carved sandstone with painted hieroglyph registers (tileable, 1 tile ≈ 4 m). */
export function hieroglyphTexture(): THREE.CanvasTexture {
  return cached('glyph-wall', () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = '#cdb184';
    ctx.fillRect(0, 0, 512, 512);
    const r = rng(404);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '120,90,50' : '250,235,200'},${0.05 + r() * 0.06})`;
      ctx.fillRect(r() * 512, r() * 512, 3 + r() * 12, 2 + r() * 6);
    }
    // registers
    for (const y of [0, 170, 340]) {
      ctx.fillStyle = '#2a4f9e';
      ctx.fillRect(0, y, 512, 10);
      ctx.fillStyle = '#c9a04a';
      ctx.fillRect(0, y + 10, 512, 5);
    }
    const colors = ['#5a4428', '#2a4f9e', '#9a3a22', '#2f6f4a', '#5a4428'];
    for (let reg = 0; reg < 3; reg++) {
      const y0 = reg * 170 + 24;
      // a big striding figure + columns of glyphs
      for (let f = 0; f < 2; f++) {
        const fx = 60 + f * 260 + reg * 30;
        ctx.fillStyle = '#9a3a22';
        ctx.fillRect(fx, y0 + 30, 26, 70);
        ctx.fillStyle = '#f2ead8';
        ctx.fillRect(fx - 4, y0 + 90, 34, 40);
        ctx.fillStyle = '#2a4f9e';
        ctx.beginPath();
        ctx.ellipse(fx + 13, y0 + 20, 14, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a4428';
        ctx.fillRect(fx + 26, y0 + 46, 34, 8);
      }
      for (let col = 0; col < 14; col++) {
        for (let row = 0; row < 4; row++) {
          const x = 130 + col * 26 + (col > 5 ? 60 : 0);
          if (x > 500) continue;
          const y = y0 + row * 34;
          const k = Math.floor(r() * 5);
          ctx.fillStyle = colors[(col + row) % colors.length];
          if (k === 0) ctx.fillRect(x, y, 14, 18);
          else if (k === 1) {
            ctx.beginPath();
            ctx.arc(x + 7, y + 9, 7, 0, Math.PI * 2);
            ctx.fill();
          } else if (k === 2) {
            ctx.fillRect(x + 5, y, 4, 20);
            ctx.fillRect(x, y + 4, 14, 4);
          } else if (k === 3) {
            ctx.beginPath();
            ctx.moveTo(x, y + 18);
            ctx.lineTo(x + 7, y);
            ctx.lineTo(x + 14, y + 18);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.ellipse(x + 7, y + 9, 8, 4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    return finish(c);
  });
}

/** Luxor inner corridor: room doors with lit number plates and sconces (u: one door per 0.25, v: one floor). */
export function luxorCorridorAtlas(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const draw = (glow: boolean) => {
    const [c, ctx] = canvas(512, 128);
    ctx.fillStyle = glow ? '#000' : '#b89a72';
    ctx.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 4; i++) {
      const x = i * 128;
      if (!glow) {
        ctx.fillStyle = '#5a3a22';
        ctx.fillRect(x + 40, 30, 48, 98);
        ctx.fillStyle = '#d8c09a';
        ctx.fillRect(x + 36, 26, 56, 5);
        ctx.fillStyle = '#c9a04a';
        ctx.fillRect(x + 80, 76, 5, 5);
      }
      // sconce + number plate
      ctx.fillStyle = glow ? '#ffd9a0' : '#fff0c8';
      ctx.beginPath();
      ctx.ellipse(x + 112, 52, 7, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = glow ? '#ffe9c0' : '#f2e4c0';
      ctx.fillRect(x + 54, 12, 20, 10);
    }
    return finish(c, true);
  };
  return { map: cached('lux-corr', () => draw(false)), glow: cached('lux-corr-glow', () => draw(true)) };
}

/** The pyramid's glass skin seen from inside: dark bronze panes with mullions (tileable, 1 tile = 1 pane). */
export function pyramidGlassTexture(): THREE.CanvasTexture {
  return cached('pyr-glass', () => {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, '#2a241c');
    g.addColorStop(1, '#16120e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#6a5838';
    ctx.fillRect(0, 0, 64, 3);
    ctx.fillRect(0, 0, 3, 64);
    return finish(c);
  });
}

// ------------------------------------------------------------------------------------------------
// Painted sky ceilings (shader)
// ------------------------------------------------------------------------------------------------

/**
 * Painted-sky ceiling: soft fbm clouds over a gradient. `cycle` (0..1 → dawn, day, dusk, back) drives
 * the Forum Shops' sky; a fixed phase gives the Venetian's eternal late afternoon. World-space UVs, so
 * any curved ceiling mesh works. Fog-free (it's indoors); NaN-safe.
 */
export function paintedSkyMaterial(phase: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uPhase: { value: phase }, uTime: { value: 0 }, uScale: { value: 0.06 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uPhase; uniform float uTime; uniform float uScale;
      varying vec3 vW;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 p = vec2(vW.x, vW.z + vW.y * 1.5) * uScale + vec2(uTime * 0.004, uTime * 0.0015);
        // phase: 0 dawn → 0.33 day → 0.66 dusk → 1 dawn
        float ph = fract(uPhase);
        vec3 dawnA = vec3(0.98, 0.58, 0.46), dawnB = vec3(0.42, 0.48, 0.82);
        vec3 dayA = vec3(0.50, 0.72, 0.97),  dayB = vec3(0.16, 0.40, 0.86);
        vec3 duskA = vec3(0.98, 0.46, 0.22), duskB = vec3(0.26, 0.16, 0.46);
        float k = ph * 3.0;
        vec3 A; vec3 B;
        if (k < 1.0) { A = mix(dawnA, dayA, smoothstep(0.0, 1.0, k)); B = mix(dawnB, dayB, smoothstep(0.0, 1.0, k)); }
        else if (k < 2.0) { A = mix(dayA, duskA, smoothstep(0.0, 1.0, k - 1.0)); B = mix(dayB, duskB, smoothstep(0.0, 1.0, k - 1.0)); }
        else { A = mix(duskA, dawnA, smoothstep(0.0, 1.0, k - 2.0)); B = mix(duskB, dawnB, smoothstep(0.0, 1.0, k - 2.0)); }
        float grad = clamp(fbm(p * 0.35) * 1.2 - 0.1, 0.0, 1.0);
        vec3 sky = mix(A, B, grad);
        float cl = smoothstep(0.5, 0.82, fbm(p * 1.3 + 3.7));
        float shade = smoothstep(0.5, 0.9, fbm(p * 1.3 + 3.9));
        vec3 cloudC = mix(vec3(1.0, 0.98, 0.95), A, 0.25) * (1.0 - 0.18 * shade);
        vec3 col = mix(sky, cloudC, cl * 0.9);
        col = clamp(col, 0.0, 1.0) * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
