import * as THREE from 'three';
import { viewer, type WorldBuilder } from './builder';
import { cobbleTexture } from './interiorAtlas';
import { GUEST_SHIRTS, Kit, additiveMat, buildPeople, glowMat, vcMat, type GateBox, type PeopleLists } from './interiorKit';
import { mat, mesh } from './props';
import { LedBoard } from './textures';
import { canvasTex, fitText, lazyInterior, mapGlow, mapLit, prng, puckMaterial, themeClock, tickTheme, uvScale, uvTo, type Px } from './themedKit';

/*
 * New York-New York: inside, the casino is Greenwich Village under a painted night sky — brownstones
 * and red-brick tenements with fire escapes round the walls, Broadway (asphalt, yellow cabs, steam
 * vents) and cobbled Bleecker St cutting through the slot floor, a subway entrance, a newsstand, a
 * pocket of Central Park, the Village Deli, Times Square billboards and a dueling-piano bar. Outside:
 * the skyline marquee (stacked skyscraper panels, a half-round NEW YORK / NEW YORK cabinet in LED
 * pucks, Liberty's crown on top and an LED board).
 */

export const NY = {
  x0: -86,
  x1: -44,
  z0: 377,
  z1: 423.6,
  h: 10,
  cy: 9.2,
  mainDoor: 400.5,
  mainW: 8,
  bridgeDoor: 413,
  bridgeW: 6,
  northDoor: -53,
  northW: 6,
  /** streets [minX, maxX, minZ, maxZ] */
  broadway: [-80, -44.6, 397.5, 403.5] as [number, number, number, number],
  bleecker: [-68.5, -64.5, 377.6, 423] as [number, number, number, number],
  seventh: [-55, -51, 377.6, 397.5] as [number, number, number, number],
  bridgeSt: [-64.5, -44.6, 411, 415] as [number, number, number, number],
  park: [-81.5, -71, 407, 419] as [number, number, number, number],
  subway: [-63.9, -60.1, 392.6, 396.9] as [number, number, number, number],
  news: [-73, -69.6, 404.3, 406.3] as [number, number, number, number],
  pianoStage: [-62, -48, 420.9, 423] as [number, number, number, number],
  pianoTables: [-61, -49, 416.2, 419.4] as [number, number, number, number],
  pianoBar: [-45.9, -44.6, 416.5, 423] as [number, number, number, number],
  deli: [-85.4, -76, 377.6, 380] as [number, number, number, number],
  cashierGap: [394.5, 406.5] as [number, number], // west wall stretch left for the kit's cashier cage
};

// ------------------------------------------------------------------ textures
const AT: [number, number] = [1024, 1024];
const A = {
  brown0: [0, 0, 256, 320] as Px,
  brown1: [256, 0, 256, 320] as Px,
  brick0: [512, 0, 256, 320] as Px,
  brick1: [768, 0, 256, 320] as Px,
  ad0: [0, 320, 256, 128] as Px,
  ad1: [256, 320, 256, 128] as Px,
  ad2: [512, 320, 256, 128] as Px,
  ad3: [768, 320, 256, 128] as Px,
  ad4: [0, 448, 256, 128] as Px,
  ad5: [256, 448, 256, 128] as Px,
  deli: [512, 448, 512, 64] as Px,
  pizza: [512, 512, 256, 64] as Px,
  bagels: [768, 512, 256, 64] as Px,
  bodega: [512, 576, 256, 64] as Px,
  jazz: [768, 576, 256, 64] as Px,
  news: [0, 576, 256, 64] as Px,
  subway: [256, 576, 256, 64] as Px,
  pianos: [0, 640, 512, 128] as Px,
  coaster: [512, 640, 512, 64] as Px,
  park: [512, 704, 256, 64] as Px,
  broadway: [768, 704, 128, 32] as Px,
  bleecker: [768, 736, 128, 32] as Px,
  seventh: [896, 704, 128, 32] as Px,
  menu: [0, 768, 256, 128] as Px,
  stairs: [256, 768, 128, 256] as Px,
  mags: [384, 768, 128, 128] as Px,
  hotdog: [896, 736, 128, 32] as Px,
  times: [512, 768, 512, 64] as Px,
  tickerSrc: [512, 832, 512, 48] as Px,
};

let _atlas: THREE.CanvasTexture | null = null;
function atlas(): THREE.CanvasTexture {
  if (_atlas) return _atlas;
  _atlas = canvasTex(AT[0], AT[1], (ctx) => {
    const r = prng(1777);
    const sans = '"Arial Black", Impact, sans-serif';
    const serif = 'Georgia, "Times New Roman", serif';
    const cond = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    // ---- facades: 6 m x 7.5 m, three storeys
    const facade = (rect: Px, kind: 'brown' | 'brick', tone: string, seed: number) => {
      const [x, y, w, h] = rect;
      const rr = prng(seed);
      ctx.fillStyle = tone;
      ctx.fillRect(x, y, w, h);
      if (kind === 'brick') {
        for (let yy = 0; yy < h; yy += 6) {
          const off = (yy / 6) % 2 ? 0 : 7;
          for (let xx = -14; xx < w; xx += 14) {
            const v = rr() * 0.18 - 0.09;
            ctx.fillStyle = v > 0 ? `rgba(255,220,200,${v})` : `rgba(0,0,0,${-v})`;
            ctx.fillRect(x + xx + off, y + yy, 13, 5);
          }
          ctx.fillStyle = 'rgba(40,20,15,0.25)';
          ctx.fillRect(x, y + yy + 5, w, 1);
        }
      } else {
        for (let yy = 0; yy < h; yy += 3) {
          ctx.fillStyle = `rgba(0,0,0,${rr() * 0.06})`;
          ctx.fillRect(x, y + yy, w, 2);
        }
      }
      // cornice
      ctx.fillStyle = kind === 'brick' ? '#5a4a40' : '#4a3426';
      ctx.fillRect(x, y, w, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let xx = 0; xx < w; xx += 10) ctx.fillRect(x + xx, y + 16, 5, 6);
      // windows on floors 2 and 3
      const winRow = (wy: number, hh: number) => {
        for (let i = 0; i < 3; i++) {
          const wx = x + 30 + i * 74;
          const lit = rr() < 0.65;
          ctx.fillStyle = kind === 'brick' ? '#d8d0c0' : '#8a6a52';
          ctx.fillRect(wx - 5, wy - 6, 50, hh + 12);
          const g = ctx.createLinearGradient(0, wy, 0, wy + hh);
          g.addColorStop(0, lit ? '#ffd890' : '#2a3040');
          g.addColorStop(1, lit ? '#e8a050' : '#12161e');
          ctx.fillStyle = g;
          ctx.fillRect(wx, wy, 40, hh);
          ctx.fillStyle = '#2a2420';
          ctx.fillRect(wx + 18, wy, 4, hh);
          ctx.fillRect(wx, wy + hh / 2 - 2, 40, 4);
          if (lit && rr() < 0.5) {
            ctx.fillStyle = 'rgba(120,40,30,0.55)';
            ctx.fillRect(wx, wy, 12, hh);
            ctx.fillRect(wx + 28, wy, 12, hh);
          }
        }
      };
      winRow(y + 34, 62);
      winRow(y + 130, 66);
      // ground floor
      if (kind === 'brick') {
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(x + 8, y + 224, w - 16, 96);
        const g = ctx.createLinearGradient(0, y + 236, 0, y + 320);
        g.addColorStop(0, '#ffe0a0');
        g.addColorStop(1, '#c88848');
        ctx.fillStyle = g;
        ctx.fillRect(x + 16, y + 236, 150, 78);
        ctx.fillStyle = '#3a2a20';
        ctx.fillRect(x + 186, y + 236, 52, 84);
        ctx.fillStyle = 'rgba(255,230,180,0.6)';
        ctx.fillRect(x + 192, y + 244, 40, 30);
        ctx.fillStyle = 'rgba(60,40,20,0.6)';
        for (let i = 0; i < 6; i++) ctx.fillRect(x + 22 + i * 24, y + 290, 18, 20);
      } else {
        // parlour floor windows + the door at the top of the stoop (stoop is geometry)
        winRow(y + 226, 70);
        ctx.fillStyle = '#3a2418';
        ctx.fillRect(x + 168, y + 224, 64, 96);
        ctx.fillStyle = '#6a3a22';
        ctx.fillRect(x + 176, y + 232, 48, 88);
        ctx.fillStyle = 'rgba(255,220,160,0.8)';
        ctx.fillRect(x + 184, y + 240, 32, 16);
      }
    };
    facade(A.brown0, 'brown', '#7a4a34', 11);
    facade(A.brown1, 'brown', '#8a5a40', 12);
    facade(A.brick0, 'brick', '#8a3a2a', 13);
    facade(A.brick1, 'brick', '#9a4a32', 14);
    // ---- billboards (Times Square)
    const ad = (rect: Px, bg: [string, string], l1: string, l2: string, fg: string, accent: string) => {
      const [x, y, w, h] = rect;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, bg[0]);
      g.addColorStop(1, bg[1]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(x, y + h - 14, w, 6);
      ctx.fillStyle = fg;
      fitText(ctx, l1, x + w / 2, y + h * 0.4, 44, w - 20, sans);
      ctx.fillStyle = accent;
      fitText(ctx, l2, x + w / 2, y + h * 0.72, 20, w - 20, sans);
    };
    ad(A.ad0, ['#d81a3a', '#5a0a2a'], 'MEOWSICAL!', 'NOW PLAYING • BROADWAY', '#ffffff', '#ffd23a');
    ad(A.ad1, ['#1a3aa8', '#0a0a3a'], "LOU'S TUNA", '20% FISHIER', '#ffffff', '#5af0ff');
    ad(A.ad2, ['#f2c21b', '#e8781e'], 'YELLOW CAB', 'HAIL ONE ON BROADWAY', '#111111', '#111111');
    ad(A.ad3, ['#0a0a0a', '#2a2a2a'], 'BIG APPLE', 'COASTER • 67 MPH', '#ff3a3a', '#ffd23a');
    ad(A.ad4, ['#2ad87a', '#0a5a3a'], 'TIMES SQ', 'THE CROSSROADS OF THE WORLD', '#ffffff', '#ffffff');
    ad(A.ad5, ['#ff4fa8', '#7a1a8a'], 'DUELING PIANOS', 'TONIGHT • NO COVER', '#ffffff', '#ffe04a');
    // ---- shop and street signs
    const shop = (rect: Px, bg: string, fg: string, s: string, font = serif) => {
      const [x, y, w, h] = rect;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
      ctx.fillStyle = fg;
      fitText(ctx, s, x + w / 2, y + h / 2 + 1, h * 0.55, w - 24, font);
    };
    shop(A.deli, '#1a1a1a', '#ffd27a', 'VILLAGE DELI • SINCE 1997', serif);
    shop(A.pizza, '#1f5a2a', '#ffffff', 'NEW YORK PIZZA', sans);
    shop(A.bagels, '#7a1a1a', '#ffe0b0', 'BLEECKER BAGELS', serif);
    shop(A.bodega, '#f2c21b', '#1a1a1a', 'BODEGA • ATM', sans);
    shop(A.jazz, '#0a0a2a', '#5af0ff', 'VILLAGE JAZZ CLUB', serif);
    shop(A.news, '#1f4a2a', '#ffffff', 'NEWS', sans);
    // subway sign: black band with white letters and line bullets
    {
      const [x, y, w, h] = A.subway;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y + 4, w, 2);
      ctx.font = `bold 26px ${cond}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('14 St Station', x + 10, y + 34);
      const bullets: Array<[string, string]> = [
        ['L', '#a7a9ac'],
        ['N', '#fccc0a'],
        ['Q', '#fccc0a'],
        ['4', '#00933c'],
        ['6', '#00933c'],
      ];
      bullets.forEach(([s, c], i) => {
        const bx = x + 148 + i * 22;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(bx, y + 34, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = c === '#fccc0a' ? '#111' : '#fff';
        ctx.font = `bold 14px ${cond}`;
        ctx.textAlign = 'center';
        ctx.fillText(s, bx, y + 35);
      });
    }
    // dueling pianos neon
    {
      const [x, y, w, h] = A.pianos;
      ctx.fillStyle = '#0a0612';
      ctx.fillRect(x, y, w, h);
      ctx.shadowColor = '#ff4fa8';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ff7ac8';
      fitText(ctx, 'THE BAR AT TIMES SQUARE', x + w / 2, y + 44, 40, w - 30, '"Brush Script MT", "Segoe Script", cursive', 'italic bold');
      ctx.shadowColor = '#5af0ff';
      ctx.fillStyle = '#9af8ff';
      fitText(ctx, '♪ DUELING PIANOS ♪', x + w / 2, y + 96, 32, w - 40, sans);
      ctx.shadowBlur = 0;
    }
    shop(A.coaster, '#1a0a0a', '#ffd23a', 'THE BIG APPLE COASTER  ↑  RIDE ENTRANCE', sans);
    shop(A.park, '#1f4a2a', '#ffffff', 'CENTRAL PARK', serif);
    const street = (rect: Px, s: string) => {
      const [x, y, w, h] = rect;
      ctx.fillStyle = '#0f6a3a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = '#ffffff';
      fitText(ctx, s, x + w / 2, y + h / 2 + 1, 20, w - 10, cond);
    };
    street(A.broadway, 'Broadway');
    street(A.bleecker, 'Bleecker St');
    street(A.seventh, '7 Av');
    shop(A.hotdog, '#c8202a', '#ffe04a', "HOT DOGS 1$", sans);
    shop(A.times, '#0a0a0a', '#ffffff', 'TIMES SQUARE', sans);
    // deli menu board
    {
      const [x, y, w, h] = A.menu;
      ctx.fillStyle = '#141414';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ffd27a';
      ctx.font = `bold 15px ${serif}`;
      ctx.textAlign = 'left';
      const items = ['PASTRAMI ON RYE', 'CORNED BEEF', 'BAGEL & LOX', 'MATZO BALL SOUP', 'BLACK & WHITE COOKIE', 'EGG CREAM'];
      items.forEach((s, i) => {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ffd27a';
        ctx.fillText(s, x + 10, y + 16 + i * 19);
        ctx.textAlign = 'right';
        ctx.fillText(`$${(9 + i * 2.5).toFixed(2)}`, x + w - 10, y + 16 + i * 19);
        ctx.textAlign = 'left';
      });
    }
    // subway stairs seen from above: steps dropping into the dark
    {
      const [x, y, w, h] = A.stairs;
      for (let i = 0; i < 14; i++) {
        const v = Math.max(0, 140 - i * 11);
        ctx.fillStyle = `rgb(${v},${v},${v - 4 > 0 ? v - 4 : 0})`;
        ctx.fillRect(x, y + i * (h / 14), w, h / 14);
        ctx.fillStyle = `rgba(255,255,230,${Math.max(0, 0.5 - i * 0.04)})`;
        ctx.fillRect(x, y + i * (h / 14), w, 3);
      }
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.6)');
      g.addColorStop(0.15, 'rgba(0,0,0,0)');
      g.addColorStop(0.85, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    // magazines rack
    {
      const [x, y, w, h] = A.mags;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          ctx.fillStyle = `hsl(${Math.floor(r() * 360)},70%,${40 + r() * 30}%)`;
          ctx.fillRect(x + 2 + i * 32, y + 2 + j * 32, 28, 28);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 5 + i * 32, y + 5 + j * 32, 22, 5);
        }
      }
    }
    // zipper ticker source
    {
      const [x, y, w, h] = A.tickerSrc;
      ctx.fillStyle = '#050505';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ffb020';
      ctx.font = `bold 30px ${cond}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('★ BREAKING: CAT SPOTTED SMOKING ON BROADWAY ★ BIG APPLE COASTER OPEN ', x + 4, y + h / 2);
    }
  });
  return _atlas;
}

let _night: THREE.CanvasTexture | null = null;
/** The painted night sky: deep navy, stars, a moon (one tile spans the ceiling). */
function nightSky(): THREE.CanvasTexture {
  if (_night) return _night;
  _night = canvasTex(1024, 1024, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 50, w * 0.5, h * 0.5, w * 0.75);
    g.addColorStop(0, '#1a2050');
    g.addColorStop(0.7, '#10143a');
    g.addColorStop(1, '#2a1a40');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = prng(99);
    for (let i = 0; i < 700; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = r() < 0.06 ? 2.2 : r() < 0.3 ? 1.4 : 0.9;
      ctx.fillStyle = `rgba(255,${230 + Math.floor(r() * 25)},${200 + Math.floor(r() * 55)},${0.5 + r() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      const x = r() * w;
      const y = r() * h;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, 90 + r() * 80);
      cg.addColorStop(0, 'rgba(90,90,140,0.22)');
      cg.addColorStop(1, 'rgba(90,90,140,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(x - 200, y - 200, 400, 400);
    }
    const mx = w * 0.7;
    const my = h * 0.32;
    const mg = ctx.createRadialGradient(mx, my, 20, mx, my, 120);
    mg.addColorStop(0, 'rgba(255,250,220,0.5)');
    mg.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mx - 130, my - 130, 260, 260);
    ctx.fillStyle = '#fffbe6';
    ctx.beginPath();
    ctx.arc(mx, my, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,190,160,0.35)';
    ctx.beginPath();
    ctx.arc(mx - 9, my - 6, 8, 0, Math.PI * 2);
    ctx.arc(mx + 10, my + 9, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  return _night;
}

let _skyline: THREE.CanvasTexture | null = null;
/** The upper walls: night sky down to a silhouette of distant Manhattan with lit windows (tiles in x). */
function skylineTex(): THREE.CanvasTexture {
  if (_skyline) return _skyline;
  _skyline = canvasTex(
    1024,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#141a46');
      g.addColorStop(1, '#3a2a5a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = prng(5);
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = `rgba(255,250,230,${0.4 + r() * 0.6})`;
        ctx.fillRect(r() * w, r() * h * 0.5, 1.5, 1.5);
      }
      let x = 0;
      while (x < w) {
        const bw = 18 + r() * 40;
        const bh = h * (0.25 + r() * 0.55);
        ctx.fillStyle = '#0c0c1a';
        ctx.fillRect(x, h - bh, bw, bh);
        if (r() < 0.15) {
          ctx.beginPath();
          ctx.moveTo(x + bw * 0.2, h - bh);
          ctx.lineTo(x + bw / 2, h - bh - 30);
          ctx.lineTo(x + bw * 0.8, h - bh);
          ctx.fill();
        }
        for (let yy = h - bh + 6; yy < h - 4; yy += 7) {
          for (let xx = x + 3; xx < x + bw - 4; xx += 6) {
            if (r() < 0.35) {
              ctx.fillStyle = r() < 0.8 ? 'rgba(255,214,140,0.85)' : 'rgba(180,220,255,0.8)';
              ctx.fillRect(xx, yy, 3, 3);
            }
          }
        }
        x += bw + r() * 4;
      }
    },
    true
  );
  return _skyline;
}

let _asphalt: THREE.CanvasTexture | null = null;
function asphaltTex(): THREE.CanvasTexture {
  if (_asphalt) return _asphalt;
  _asphalt = canvasTex(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(0, 0, w, h);
      const r = prng(3);
      for (let i = 0; i < 2200; i++) {
        const v = 30 + Math.floor(r() * 40);
        ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
        ctx.fillRect(r() * w, r() * h, 2, 2);
      }
      ctx.strokeStyle = 'rgba(10,10,10,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.3);
      ctx.bezierCurveTo(w * 0.3, h * 0.35, w * 0.5, h * 0.2, w, h * 0.32);
      ctx.stroke();
    },
    true
  );
  return _asphalt;
}

let _ticker: THREE.CanvasTexture | null = null;
function zipperTex(): THREE.CanvasTexture {
  if (_ticker) return _ticker;
  _ticker = canvasTex(
    1024,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#040404';
      ctx.fillRect(0, 0, w, h);
      ctx.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffb020';
      ctx.fillText('★ NEW YORK-NEW YORK ★ CAT SPOTTED SMOKING ON BROADWAY ★ RIDE THE BIG APPLE COASTER ★ PIANOS TONIGHT ', 8, h / 2 + 2);
    },
    true
  );
  return _ticker;
}

// ------------------------------------------------------------------ Times Square video boards (shader)
let _boardMat: THREE.ShaderMaterial | null = null;
function boardMat(): THREE.ShaderMaterial {
  if (_boardMat) return _boardMat;
  const r = (p: Px) => new THREE.Vector4(p[0] / AT[0], 1 - (p[1] + p[3]) / AT[1], p[2] / AT[0], p[3] / AT[1]);
  _boardMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: themeClock,
      uMap: { value: atlas() },
      uAds: { value: [r(A.ad0), r(A.ad1), r(A.ad2), r(A.ad3), r(A.ad4), r(A.ad5)] },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uMap;
      uniform vec4 uAds[6];
      varying vec2 vUv;
      varying float vSeed;
      vec4 pick( float k ) {
        float m = mod( k, 6.0 );
        vec4 r = uAds[0];
        if ( m > 0.5 ) r = uAds[1];
        if ( m > 1.5 ) r = uAds[2];
        if ( m > 2.5 ) r = uAds[3];
        if ( m > 3.5 ) r = uAds[4];
        if ( m > 4.5 ) r = uAds[5];
        return r;
      }
      void main() {
        float t = uTime * 0.22 + vSeed * 1.7;
        float k = floor( t );
        float f = fract( t );
        vec4 a = pick( k + vSeed * 3.0 );
        vec4 b = pick( k + 1.0 + vSeed * 3.0 );
        float wipe = smoothstep( 0.86, 1.0, f );
        vec2 uv = vUv;
        vec3 ca = texture2D( uMap, a.xy + uv * a.zw ).rgb;
        vec3 cb = texture2D( uMap, b.xy + uv * b.zw ).rgb;
        vec3 col = mix( ca, cb, step( uv.x, wipe ) );
        col *= 0.88 + 0.12 * sin( uv.y * 90.0 + uTime * 3.0 );
        col += 0.12 * smoothstep( 0.02, 0.0, abs( uv.x - wipe ) ) * step( 0.01, wipe );
        vec2 px = fract( uv * vec2( 96.0, 48.0 ) );
        col *= 0.82 + 0.18 * step( 0.15, px.x ) * step( 0.15, px.y );
        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return _boardMat;
}

// ------------------------------------------------------------------ steam (shader puffs)
let _steamMat: THREE.ShaderMaterial | null = null;
function steamMat(): THREE.ShaderMaterial {
  if (_steamMat) return _steamMat;
  _steamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: themeClock },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float n( vec2 p ) {
        vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( h( i ), h( i + vec2( 1, 0 ) ), f.x ), mix( h( i + vec2( 0, 1 ) ), h( i + vec2( 1, 1 ) ), f.x ), f.y );
      }
      void main() {
        vec2 p = vUv;
        float t = uTime * 0.6 + vSeed * 10.0;
        float w = 0.18 + p.y * 0.32;
        float x = ( p.x - 0.5 ) / max( w, 0.05 );
        float body = exp( -x * x * 2.2 );
        float nn = n( vec2( p.x * 4.0, p.y * 3.0 - t ) ) * 0.6 + n( vec2( p.x * 9.0 + 3.0, p.y * 6.0 - t * 1.7 ) ) * 0.4;
        float a = body * nn * smoothstep( 0.0, 0.12, p.y ) * ( 1.0 - smoothstep( 0.5, 1.0, p.y ) );
        gl_FragColor = vec4( vec3( 0.8, 0.82, 0.86 ), clamp( a * 0.42, 0.0, 1.0 ) );
      }`,
  });
  return _steamMat;
}

// ------------------------------------------------------------------ the interior
/**
 * Called right after buildCasinoFloor for New York-New York: registers colliders, pickups, the bar and
 * routes now; builds the village street lazily (gated like the kit's interior).
 */
export function nynyVillageSet(b: WorldBuilder, gate: GateBox): void {
  const [ssx0, ssx1, ssz0, ssz1] = NY.subway;
  const [nx0, nx1, nz0, nz1] = NY.news;
  const [px0, px1, pz0, pz1] = NY.park;
  const [stx0, stx1, stz0, stz1] = NY.pianoStage;
  const [bbx0, bbx1, bbz0, bbz1] = NY.pianoBar;
  const [dx0, dx1, dz0, dz1] = NY.deli;
  // colliders: subway railings (three sides, open to Bleecker), newsstand, cabs (roofs walkable), park
  // benches + tree trunks, the piano stage (walkable), bar counter and the deli counter
  b.collider(ssx0, ssx1, ssz0 - 0.08, ssz0 + 0.08, 0, 1.1, true);
  b.collider(ssx0, ssx1, ssz1 - 0.08, ssz1 + 0.08, 0, 1.1, true);
  b.collider(ssx1 - 0.08, ssx1 + 0.08, ssz0, ssz1, 0, 1.1, true);
  b.collider(ssx0 + 0.4, ssx1 - 0.1, ssz0 + 0.1, ssz1 - 0.1, -0.3, 0.02);
  b.collider(nx0, nx1, nz0, nz1, 0, 2.5, true);
  const cabs: Array<[number, number, number]> = [
    [-77, 401.9, 0],
    [-58.5, 399.1, Math.PI],
    [-53, 386, Math.PI / 2],
  ];
  for (const [cx, cz, ry] of cabs) {
    const along = Math.abs(Math.sin(ry)) < 0.5;
    const hx = along ? 2.3 : 0.95;
    const hz = along ? 0.95 : 2.3;
    b.collider(cx - hx, cx + hx, cz - hz, cz + hz, 0, 1.0, true);
    b.collider(cx - hx * 0.55, cx + hx * 0.55, cz - hz * 0.55, cz + hz * 0.55, 1.0, 1.5);
  }
  const trees: Array<[number, number]> = [
    [px0 + 2, pz0 + 2.2],
    [px1 - 2.4, pz0 + 1.8],
    [px0 + 3.2, pz1 - 2],
    [px1 - 2.0, pz1 - 2.6],
    [(px0 + px1) / 2, (pz0 + pz1) / 2 + 0.6],
  ];
  for (const [tx, tz] of trees) b.collider(tx - 0.3, tx + 0.3, tz - 0.3, tz + 0.3, 0, 4, true);
  const benches: Array<[number, number, number]> = [
    [(px0 + px1) / 2 - 2.4, pz0 + 0.8, 0],
    [(px0 + px1) / 2 + 2.4, pz0 + 0.8, 0],
    [px1 - 0.8, (pz0 + pz1) / 2, -Math.PI / 2],
  ];
  for (const [bx, bz, ry] of benches) {
    const along = Math.abs(Math.sin(ry)) < 0.5;
    b.collider(bx - (along ? 0.9 : 0.3), bx + (along ? 0.9 : 0.3), bz - (along ? 0.3 : 0.9), bz + (along ? 0.3 : 0.9), 0, 0.45);
  }
  b.collider(stx0, stx1, stz0, stz1, 0, 0.4);
  {
    const [tx0, tx1, tz0, tz1] = NY.pianoTables;
    for (let x = tx0 + 1; x <= tx1 - 1; x += 2.5) {
      b.collider(x - 0.42, x + 0.42, tz0 + 0.38, tz0 + 1.22, 0, 0.78);
      b.collider(x - 0.42, x + 0.42, tz1 - 1.22, tz1 - 0.38, 0, 0.78);
    }
  }
  b.collider(-58.4, -53.6, stz0 + 0.3, stz1, 0.4, 1.4, true);
  b.collider(bbx0, bbx1 - 0.4, bbz0, bbz1, 0, 1.15, true);
  b.collider(dx0 + 0.6, dx1 - 0.6, dz1 - 0.95, dz1 - 0.25, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(bbx0 - 1.4, 0, (bbz0 + bbz1) / 2), radius: 2.2, label: 'The Bar at Times Square (Dueling Pianos)' });
  b.pickup(-77, 1.95, 401.9, 3, 'Yellow Cab Roof Pack', true);
  b.pickup((nx0 + nx1) / 2, 2.75, (nz0 + nz1) / 2, 2, 'Newsstand Pack', true);
  b.pickup(-56, 1.85, (stz0 + stz1) / 2 + 0.3, 4, 'Piano Top Tip Pack', true);
  b.pickup((px0 + px1) / 2, 0.45, pz1 - 0.9, 2, 'Central Park Bench Pack', true);
  b.pickup((dx0 + dx1) / 2, 1.6, dz1 - 0.6, 2, 'Village Deli Counter Pack', true);
  b.crowd.performers.push({ kind: 'statue', x: (px0 + px1) / 2 - 1.5, z: (pz0 + pz1) / 2 - 2.2, facing: Math.PI / 2, y: 0.5 });
  b.crowd.performers.push({ kind: 'robot', x: -48.6, z: 391.5, facing: -Math.PI / 2 });

  lazyInterior(b, 'interior:nyny-village', gate, (group) => {
    const k = new Kit();
    const ppl: PeopleLists = { seated: [], standing: [] };
    const anim: Array<(t: number, dt: number) => void> = [];
    const rnd = prng(2024);
    const shirt = () => GUEST_SHIRTS[Math.floor(rnd() * GUEST_SHIRTS.length)];
    const iron = vcMat(0.55, 0.5);
    const ix0 = NY.x0 + 0.6;
    const ix1 = NY.x1 - 0.6;
    const iz0 = NY.z0 + 0.6;
    const iz1 = NY.z1 - 0.6;
    const W = ix1 - ix0;
    const D = iz1 - iz0;
    const cy = NY.cy;
    const facadeTop = 7.5;
    const AG = mapGlow(atlas());
    const AL = mapLit(atlas(), 0.8);
    const quad = (r: Px, x: number, y: number, z: number, w: number, h: number, ry: number, m: THREE.Material = AG, tint = 0xffffff) => {
      const g = new THREE.PlaneGeometry(w, h);
      uvTo(g, r, AT);
      k.add(g, m, tint, x, y, z, ry);
    };

    // ---- the painted night sky: ceiling + upper walls with a distant skyline
    const sky = new THREE.PlaneGeometry(W, D);
    sky.rotateX(Math.PI / 2);
    k.add(sky, mapGlow(nightSky()), 0xc0c0c0, (ix0 + ix1) / 2, cy - 0.03, (iz0 + iz1) / 2);
    const skyline = mapGlow(skylineTex());
    for (const [x, z, w, ry] of [
      [(ix0 + ix1) / 2, iz0 + 0.27, W, 0],
      [(ix0 + ix1) / 2, iz1 - 0.27, W, Math.PI],
      [ix0 + 0.27, (iz0 + iz1) / 2, D, Math.PI / 2],
      [ix1 - 0.27, (iz0 + iz1) / 2, D, -Math.PI / 2],
    ] as Array<[number, number, number, number]>) {
      const g = new THREE.PlaneGeometry(w, cy - 0.45 - facadeTop + 0.2);
      uvScale(g, w / 24, 1);
      k.add(g, skyline, 0xd0d0d0, x, (cy - 0.45 + facadeTop - 0.2) / 2, z, ry);
    }

    // ---- streets: asphalt Broadway + 7th Av, cobbled Bleecker + the bridge lane; kerbs, crossings, manholes
    const asph = mapLit(asphaltTex(), 0.85);
    const cob = mapLit(cobbleTexture(), 0.8);
    const lane = (r: [number, number, number, number], m: THREE.Material, tile: number, y: number) => {
      const [a, c, d, e] = r;
      const g = new THREE.PlaneGeometry(c - a, e - d);
      g.rotateX(-Math.PI / 2);
      uvScale(g, (c - a) / tile, (e - d) / tile);
      k.add(g, m, m === cob ? 0x8a8078 : 0xffffff, (a + c) / 2, y, (d + e) / 2);
    };
    lane(NY.broadway, asph, 4, 0.05);
    lane(NY.seventh, asph, 4, 0.05);
    lane(NY.bleecker, cob, 1.4, 0.055);
    lane(NY.bridgeSt, cob, 1.4, 0.055);
    {
      const [a, c, d, e] = NY.broadway;
      for (let x = a + 1; x < c - 1; x += 3) k.box(vcMat(0.6), 0xe8c23a, x, 0.06, (d + e) / 2, 1.6, 0.01, 0.12);
      for (const z of [d, e]) k.box(vcMat(0.8), 0x8a8680, (a + c) / 2, 0.08, z, c - a, 0.1, 0.18);
      // zebra crossing at Bleecker
      for (let i = 0; i < 6; i++) k.box(vcMat(0.6), 0xe8e8e0, NY.bleecker[0] - 1.4, 0.062, d + 0.5 + i * 1.0, 1.6, 0.01, 0.5);
    }
    const manhole = (x: number, z: number) => {
      const g = new THREE.CircleGeometry(0.42, 16);
      g.rotateX(-Math.PI / 2);
      k.add(g, vcMat(0.5, 0.6), 0x3a3634, x, 0.068, z);
      const ring = new THREE.RingGeometry(0.42, 0.48, 16);
      ring.rotateX(-Math.PI / 2);
      k.add(ring, vcMat(0.5, 0.6), 0x1a1816, x, 0.069, z);
    };
    const vents: Array<[number, number]> = [
      [-72, 399.6],
      [-49.5, 401.8],
      [-66.5, 418.6],
      [-53, 392],
    ];
    for (const [x, z] of vents) manhole(x, z);
    // steam: crossed quads with the puff shader
    {
      const pos: number[] = [];
      const uv: number[] = [];
      const seed: number[] = [];
      const idx: number[] = [];
      vents.forEach(([x, z], i) => {
        for (const a of [0, Math.PI / 2]) {
          const base = pos.length / 3;
          const cx = Math.cos(a) * 0.9;
          const cz = Math.sin(a) * 0.9;
          pos.push(x - cx, 0.1, z - cz, x + cx, 0.1, z + cz, x - cx * 1.6, 3.4, z - cz * 1.6, x + cx * 1.6, 3.4, z + cz * 1.6);
          uv.push(0, 0, 1, 0, 0, 1, 1, 1);
          seed.push(i, i, i, i);
          idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const steam = new THREE.Mesh(g, steamMat());
      steam.renderOrder = 2;
      group.add(steam);
    }

    // ---- facades round the walls: brownstones (stoops) and tenements (fire escapes), shop signs
    const entrances: Array<{ side: 'north' | 'south' | 'east' | 'west'; at: number; w: number }> = [
      { side: 'east', at: NY.mainDoor, w: NY.mainW },
      { side: 'east', at: NY.bridgeDoor, w: NY.bridgeW },
      { side: 'north', at: NY.northDoor, w: NY.northW },
    ];
    const reserved: Array<{ side: string; a: number; c: number }> = [
      { side: 'west', a: NY.cashierGap[0], c: NY.cashierGap[1] },
      { side: 'south', a: stx0 - 0.5, c: stx1 + 0.5 },
      { side: 'east', a: bbz0 - 0.4, c: NY.z1 },
      { side: 'north', a: NY.x0, c: dx1 + 0.4 },
    ];
    const shops: Px[] = [A.pizza, A.bagels, A.bodega, A.jazz];
    const walls = [
      { side: 'north', fixed: iz0, lo: ix0, hi: ix1, rot: 0 },
      { side: 'east', fixed: ix1, lo: iz0, hi: iz1, rot: -Math.PI / 2 },
      { side: 'south', fixed: iz1, lo: ix0, hi: ix1, rot: Math.PI },
      { side: 'west', fixed: ix0, lo: iz0, hi: iz1, rot: Math.PI / 2 },
    ] as const;
    let n = 0;
    const timesSq = (wl: (typeof walls)[number], mid: number) => wl.side === 'east' && mid < NY.mainDoor - NY.mainW / 2;
    const boards: Array<{ x: number; y: number; z: number; w: number; h: number; ry: number }> = [];
    for (const wl of walls) {
      const blocks = [
        ...entrances.filter((e) => e.side === wl.side).map((e) => [e.at - e.w / 2 - 0.3, e.at + e.w / 2 + 0.3]),
        ...reserved.filter((r) => r.side === wl.side).map((r) => [r.a, r.c]),
      ];
      for (let u = wl.lo + 0.1; u + 6 <= wl.hi - 0.1 + 1e-6; u += 6) {
        if (blocks.some(([g0, g1]) => u < g1 && u + 6 > g0)) continue;
        const mid = u + 3;
        const wx = wl.side === 'north' || wl.side === 'south' ? mid : wl.fixed;
        const wz = wl.side === 'north' || wl.side === 'south' ? wl.fixed : mid;
        const i = n++;
        const brick = i % 3 !== 1;
        const reg = brick ? (i % 2 ? A.brick0 : A.brick1) : i % 2 ? A.brown0 : A.brown1;
        const ts = timesSq(wl, mid);
        k.at(wx, 0, wz, wl.rot, () => {
          quad(reg, 0, 3.75, 0.3, 6, 7.5, 0, AL);
          k.box(vcMat(0.7), brick ? 0x4a3a32 : 0x3a2a20, 0, 7.55, 0.42, 6.1, 0.3, 0.32);
          // party walls between houses
          k.box(vcMat(0.8), 0x2a201a, -3, 3.75, 0.36, 0.12, 7.5, 0.14);
          if (brick) {
            // shop sign + awning + fire escape (2nd and 3rd floor platforms, ladders)
            quad(shops[i % shops.length], -0.6, 2.75, 0.34, 3.4, 0.5, 0);
            const ag = new THREE.PlaneGeometry(4.0, 1.0);
            k.add(ag, vcMat(0.7), [0x1f5a2a, 0x8a1a1a, 0x1a3a7a, 0x2a2a2a][i % 4], -0.6, 2.35, 0.75, 0, -1.0);
            if (!ts) {
              for (const fy of [3.05, 5.35]) {
                k.box(iron, 0x1a1a1c, 0, fy, 1.0, 4.2, 0.06, 1.3);
                k.box(iron, 0x1a1a1c, 0, fy + 0.5, 1.63, 4.2, 0.04, 0.04);
                k.box(iron, 0x1a1a1c, 0, fy + 0.95, 1.63, 4.2, 0.04, 0.04);
                for (let bx = -2.1; bx <= 2.1; bx += 0.35) k.box(iron, 0x1a1a1c, bx, fy + 0.48, 1.63, 0.025, 0.95, 0.025);
                for (const s of [-2.1, 2.1]) k.box(iron, 0x1a1a1c, s, fy + 0.48, 1.0, 0.025, 0.95, 1.3);
              }
              k.box(iron, 0x1a1a1c, 1.2, 4.2, 1.0, 0.5, 0.05, 2.6, 0, -0.95);
              k.box(iron, 0x1a1a1c, -1.4, 6.4, 1.0, 0.5, 0.05, 2.0, 0, 0.95);
              k.box(iron, 0x1a1a1c, 1.7, 2.6, 1.0, 0.04, 1.0, 0.04);
            }
          } else {
            // brownstone stoop with iron railings up to the parlour door
            for (let s = 0; s < 5; s++) k.box(vcMat(0.85), 0x6a4a36, 1.6, 0.12 + s * 0.24, 0.3 + 1.6 - s * 0.3, 1.5, 0.24, 0.3 + s * 0.0 + 0.3);
            k.box(vcMat(0.85), 0x6a4a36, 1.6, 0.6, 0.65, 1.5, 1.2, 0.7);
            for (const s of [-0.78, 0.78]) {
              k.box(iron, 0x101010, 1.6 + s, 1.0, 1.3, 0.04, 0.04, 1.7, 0, 0.55);
              k.cyl(iron, 0x101010, 1.6 + s, 0.55, 2.05, 0.03, 0.03, 1.1, 5);
            }
            k.box(glowMat(), 0xffd890, 1.6, 2.95, 0.34, 0.5, 0.18, 0.04);
          }
          // wall lamp
          k.box(glowMat(), 0xffd690, 2.6, 2.9, 0.45, 0.16, 0.26, 0.16);
        });
        if (ts) {
          // Times Square: stacked video boards on the upper floors + a zipper
          const p = (lx: number, ly: number, lz: number) => {
            const c = Math.cos(wl.rot);
            const s = Math.sin(wl.rot);
            return [wx + lx * c + lz * s, ly, wz - lx * s + lz * c] as const;
          };
          const [bx1, , bz1] = p(0, 0, 0.62);
          boards.push({ x: bx1, y: 5.2, z: bz1, w: 5.4, h: 2.6, ry: wl.rot });
          const [bx2, , bz2] = p(-1.4, 0, 0.66);
          boards.push({ x: bx2, y: 3.25, z: bz2, w: 2.6, h: 1.1, ry: wl.rot });
          k.at(wx, 0, wz, wl.rot, () => {
            k.box(vcMat(0.5, 0.4), 0x0a0a0c, 0, 5.2, 0.5, 5.7, 2.9, 0.2);
            k.box(vcMat(0.5, 0.4), 0x0a0a0c, -1.4, 3.25, 0.54, 2.8, 1.25, 0.2);
            for (let q = 0; q < 12; q++) k.add(new THREE.SphereGeometry(0.05, 6, 4), glowMat(), 0xfff2c0, -2.75 + q * 0.5, 6.72, 0.62);
          });
        }
      }
    }
    // video boards (one shader draw)
    {
      const pos: number[] = [];
      const uv: number[] = [];
      const seed: number[] = [];
      const idx: number[] = [];
      boards.forEach((bd, i) => {
        const base = pos.length / 3;
        const c = Math.cos(bd.ry);
        const s = Math.sin(bd.ry);
        const corner = (lx: number, ly: number) => pos.push(bd.x + lx * c, bd.y + ly, bd.z - lx * s);
        corner(-bd.w / 2, -bd.h / 2);
        corner(bd.w / 2, -bd.h / 2);
        corner(-bd.w / 2, bd.h / 2);
        corner(bd.w / 2, bd.h / 2);
        uv.push(0, 0, 1, 0, 0, 1, 1, 1);
        seed.push(i * 0.37, i * 0.37, i * 0.37, i * 0.37);
        idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
      });
      if (boards.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
        g.setIndex(idx);
        g.computeBoundingSphere();
        group.add(new THREE.Mesh(g, boardMat()));
      }
    }
    // the zipper news ticker wrapping the Times Square corner + a TIMES SQUARE sign
    const zip = zipperTex();
    {
      const zm = mapGlow(zip);
      const zlen = NY.mainDoor - NY.mainW / 2 - iz0 - 0.6;
      const g = new THREE.PlaneGeometry(zlen, 0.42);
      uvScale(g, zlen / 14, 1);
      k.add(g, zm, 0xffffff, ix1 - 0.9, 7.05, iz0 + zlen / 2, -Math.PI / 2);
      k.box(vcMat(0.5, 0.4), 0x050505, ix1 - 0.8, 7.05, iz0 + zlen / 2, 0.12, 0.55, zlen);
      quad(A.times, ix1 - 0.85, 8.1, iz0 + zlen / 2, 6.4, 0.8, -Math.PI / 2);
      anim.push((_t, dt) => {
        zip.offset.x = (zip.offset.x + dt * 0.06) % 1;
      });
    }

    // ---- subway entrance (Bleecker & Broadway): green iron railings, globe lamps, stairs into the dark
    {
      const sw = ssx1 - ssx0;
      const sd = ssz1 - ssz0;
      const g = new THREE.PlaneGeometry(sd - 0.2, sw - 0.3);
      uvTo(g, A.stairs, AT);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.PI / 2);
      k.add(g, mapGlow(atlas()), 0xffffff, (ssx0 + ssx1) / 2 + 0.1, 0.07, (ssz0 + ssz1) / 2);
      const rail = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ry = Math.atan2(-(z1 - z0), x1 - x0);
        k.box(iron, 0x1f4a2a, (x0 + x1) / 2, 1.05, (z0 + z1) / 2, len, 0.06, 0.06, ry);
        k.box(iron, 0x1f4a2a, (x0 + x1) / 2, 0.2, (z0 + z1) / 2, len, 0.06, 0.06, ry);
        const nb = Math.round(len / 0.14);
        for (let i = 0; i <= nb; i++) {
          const t = i / nb;
          k.box(iron, 0x1f4a2a, x0 + (x1 - x0) * t, 0.62, z0 + (z1 - z0) * t, 0.025, 0.86, 0.025);
        }
      };
      rail(ssx0, ssz0, ssx1, ssz0);
      rail(ssx0, ssz1, ssx1, ssz1);
      rail(ssx1, ssz0, ssx1, ssz1);
      for (const z of [ssz0, ssz1]) {
        k.cyl(iron, 0x1f4a2a, ssx0, 1.2, z, 0.06, 0.08, 2.4, 8);
        k.add(new THREE.SphereGeometry(0.2, 12, 8), glowMat(), 0x3aff7a, ssx0, 2.55, z);
        k.cyl(iron, 0x1f4a2a, ssx0, 2.32, z, 0.12, 0.06, 0.12, 8);
      }
      k.at(ssx0 - 0.05, 0, (ssz0 + ssz1) / 2, -Math.PI / 2, () => {
        quad(A.subway, 0, 2.95, 0.01, 3.2, 0.8, 0);
        quad(A.subway, 0, 2.95, -0.02, 3.2, 0.8, Math.PI);
        k.box(vcMat(0.5), 0x0a0a0a, 0, 2.95, -0.005, 3.3, 0.86, 0.02);
        for (const s of [-1.5, 1.5]) k.cyl(iron, 0x1f4a2a, s, 2.6, 0, 0.02, 0.02, 0.6, 5);
      });
    }

    // ---- newsstand
    k.at((nx0 + nx1) / 2, 0, (nz0 + nz1) / 2, 0, () => {
      const w = nx1 - nx0;
      const d = nz1 - nz0;
      k.box(vcMat(0.6), 0x1f4a2a, 0, 1.2, 0, w, 2.4, d);
      k.box(vcMat(0.6), 0x173a20, 0, 2.5, 0, w + 0.3, 0.2, d + 0.3);
      quad(A.news, 0, 2.15, -d / 2 - 0.01, w * 0.6, 0.36, Math.PI);
      quad(A.news, 0, 2.15, d / 2 + 0.01, w * 0.6, 0.36, 0);
      quad(A.mags, -0.7, 1.15, -d / 2 - 0.02, 1.3, 1.3, Math.PI, mapLit(atlas(), 0.6));
      quad(A.mags, 0.8, 1.15, -d / 2 - 0.02, 1.3, 1.3, Math.PI, mapLit(atlas(), 0.6));
      k.box(glowMat(), 0xfff0c8, 0, 1.9, -d / 2 - 0.05, w - 0.3, 0.05, 0.1);
      k.box(vcMat(0.7), 0x8a1a1a, 0, 2.0, -d / 2 - 0.45, w + 0.2, 0.05, 0.9, 0, -0.35);
    });
    ppl.standing.push({ x: (nx0 + nx1) / 2 + 0.4, z: nz0 - 0.55, rot: Math.PI, shirt: 0x6a4a2a });

    // ---- yellow cabs
    const cab = (x: number, z: number, ry: number, num: string) => {
      k.at(x, 0, z, ry, () => {
        k.box(vcMat(0.35, 0.3), 0xf2c21b, 0, 0.62, 0, 4.4, 0.62, 1.8);
        k.box(vcMat(0.35, 0.3), 0xf2c21b, -0.2, 1.18, 0, 2.4, 0.5, 1.62);
        k.box(vcMat(0.1, 0.5), 0x1a2028, -0.2, 1.2, 0, 2.45, 0.38, 1.66);
        k.box(vcMat(0.1, 0.5), 0x1a2028, 0.95, 1.18, 0, 0.1, 0.4, 1.5, 0, 0, 0.5);
        k.box(vcMat(0.4), 0x111111, 0, 0.72, 0, 4.42, 0.12, 1.82);
        for (let q = 0; q < 10; q++) k.box(vcMat(0.4), q % 2 ? 0x111111 : 0xf2f2f2, -1.8 + q * 0.4, 0.72, 0, 0.2, 0.121, 1.83);
        k.box(glowMat(), 0xffe9a0, -0.2, 1.52, 0, 0.6, 0.2, 0.3);
        for (const sx of [-1.4, 1.4]) for (const sz of [-0.85, 0.85]) k.cyl(vcMat(0.6), 0x111111, sx, 0.33, sz, 0.33, 0.33, 0.24, 12, 0, Math.PI / 2, 0);
        for (const sz of [-0.6, 0.6]) {
          k.box(glowMat(), 0xfff6d0, 2.21, 0.7, sz, 0.02, 0.18, 0.3);
          k.box(glowMat(), 0xff2a2a, -2.21, 0.72, sz, 0.02, 0.14, 0.26);
        }
        k.box(vcMat(0.3, 0.8), 0xc8ccd4, 2.22, 0.45, 0, 0.06, 0.14, 1.7);
      });
      void num;
    };
    cab(cabs[0][0], cabs[0][1], cabs[0][2], '4N21');
    cab(cabs[1][0], cabs[1][1], cabs[1][2], '7J33');
    cab(cabs[2][0], cabs[2][1], cabs[2][2], '2K88');
    ppl.standing.push({ x: -74.3, z: 403, rot: Math.PI * 0.5, shirt: shirt() });

    // ---- street furniture: lamp posts (Central Park acorn globes), street signs, fire hydrant
    const lamp = (x: number, z: number) => {
      k.cyl(iron, 0x1a2a20, x, 0.2, z, 0.16, 0.2, 0.4, 8);
      k.cyl(iron, 0x1a2a20, x, 2.0, z, 0.05, 0.08, 3.6, 8);
      k.cyl(iron, 0x1a2a20, x, 3.85, z, 0.13, 0.07, 0.15, 8);
      const gl = new THREE.SphereGeometry(0.24, 12, 8);
      gl.scale(1, 1.25, 1);
      k.add(gl, glowMat(), 0xfff0c0, x, 4.2, z);
      k.add(new THREE.ConeGeometry(0.1, 0.18, 8), iron, 0x1a2a20, x, 4.58, z);
      const halo = new THREE.CircleGeometry(1.7, 16);
      halo.rotateX(-Math.PI / 2);
      k.add(halo, additiveMat(), 0x2a2210, x, 0.075, z);
    };
    for (let x = NY.broadway[0] + 3; x < NY.broadway[1] - 2; x += 8) {
      lamp(x, NY.broadway[2] - 0.5);
      lamp(x + 4, NY.broadway[3] + 0.5);
    }
    for (let z = NY.bleecker[2] + 4; z < NY.bleecker[3] - 2; z += 8) {
      if (z > NY.broadway[2] - 1.5 && z < NY.broadway[3] + 1.5) continue;
      lamp(NY.bleecker[0] - 0.5, z);
    }
    // street-name signs at the corner of Broadway & Bleecker and 7 Av
    const signPost = (x: number, z: number, a: Px, b2: Px) => {
      k.cyl(iron, 0x1a2a20, x, 1.5, z, 0.04, 0.05, 3.0, 6);
      quad(a, x, 3.0, z + 0.03, 1.2, 0.3, 0, AL);
      quad(a, x, 3.0, z - 0.03, 1.2, 0.3, Math.PI, AL);
      quad(b2, x + 0.03, 2.65, z, 1.2, 0.3, Math.PI / 2, AL);
      quad(b2, x - 0.03, 2.65, z, 1.2, 0.3, -Math.PI / 2, AL);
    };
    signPost(NY.bleecker[1] + 0.4, NY.broadway[3] + 0.4, A.broadway, A.bleecker);
    signPost(NY.seventh[0] - 0.4, NY.broadway[2] - 0.4, A.broadway, A.seventh);
    // fire hydrant
    k.cyl(vcMat(0.5), 0xc8202a, NY.bleecker[1] + 0.5, 0.35, NY.subway[2] - 0.9, 0.13, 0.15, 0.7, 10);
    k.add(new THREE.SphereGeometry(0.14, 10, 6), vcMat(0.5), 0xc8202a, NY.bleecker[1] + 0.5, 0.72, NY.subway[2] - 0.9);

    // ---- Central Park pocket: grass, trees, benches, a hot-dog cart, the park sign
    {
      const g = new THREE.PlaneGeometry(px1 - px0, pz1 - pz0);
      g.rotateX(-Math.PI / 2);
      k.add(g, vcMat(0.95), 0x3a6a2a, (px0 + px1) / 2, 0.05, (pz0 + pz1) / 2);
      for (let i = 0; i < 60; i++) {
        const tuft = new THREE.ConeGeometry(0.06, 0.18 + rnd() * 0.15, 3);
        k.add(tuft, vcMat(0.9), rnd() < 0.5 ? 0x4a8a34 : 0x5a9a3a, px0 + 0.3 + rnd() * (px1 - px0 - 0.6), 0.12, pz0 + 0.3 + rnd() * (pz1 - pz0 - 0.6));
      }
      const path = new THREE.PlaneGeometry(1.6, pz1 - pz0);
      path.rotateX(-Math.PI / 2);
      k.add(path, vcMat(0.9), 0xb8a888, px0 + 5.2, 0.058, (pz0 + pz1) / 2);
      // low iron fence round the lawn
      for (const [x0, z0, x1, z1] of [
        [px0, pz0, px1, pz0],
        [px0, pz1, px1, pz1],
        [px0, pz0, px0, pz1],
      ] as Array<[number, number, number, number]>) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ry = Math.atan2(-(z1 - z0), x1 - x0);
        k.box(iron, 0x101010, (x0 + x1) / 2, 0.45, (z0 + z1) / 2, len, 0.04, 0.04, ry);
        const nb = Math.round(len / 0.3);
        for (let i = 0; i <= nb; i++) k.box(iron, 0x101010, x0 + ((x1 - x0) * i) / nb, 0.25, z0 + ((z1 - z0) * i) / nb, 0.025, 0.5, 0.025);
      }
      for (const [tx, tz] of trees) {
        k.cyl(vcMat(0.9), 0x4a3a2a, tx, 1.6, tz, 0.16, 0.24, 3.2, 8);
        for (let q = 0; q < 4; q++) {
          const blob = new THREE.IcosahedronGeometry(1.0 + rnd() * 0.5, 1);
          k.add(blob, vcMat(0.85), [0x2f6a2a, 0x3a7a30, 0x4a8a34, 0x2a5a26][q], tx + (rnd() - 0.5) * 1.6, 3.6 + rnd() * 1.4, tz + (rnd() - 0.5) * 1.6);
        }
        const fairy = new THREE.TorusGeometry(1.3, 0.03, 4, 18);
        fairy.rotateX(Math.PI / 2);
        k.add(fairy, glowMat(), 0xfff0b0, tx, 3.1, tz);
      }
      for (const [bx, bz, ry] of benches) {
        k.at(bx, 0, bz, ry, () => {
          for (const s of [-0.75, 0.75]) k.box(iron, 0x101010, s, 0.22, 0, 0.06, 0.44, 0.5);
          for (let q = 0; q < 3; q++) k.box(vcMat(0.8), 0x5a7a3a, 0, 0.45, -0.15 + q * 0.13, 1.8, 0.04, 0.1);
          for (let q = 0; q < 3; q++) k.box(vcMat(0.8), 0x5a7a3a, 0, 0.6 + q * 0.13, -0.3, 1.8, 0.1, 0.04);
        });
      }
      ppl.seated.push({ x: benches[0][0] + 0.4, y: -0.25, z: benches[0][1] + 0.1, rot: 0, shirt: shirt() });
      ppl.seated.push({ x: benches[2][0] - 0.1, y: -0.25, z: benches[2][1] - 0.3, rot: -Math.PI / 2, shirt: shirt() });
      lamp(px0 + 5.2 - 1.1, pz0 + 3);
      lamp(px0 + 5.2 + 1.1, pz1 - 3);
      // the park sign on two posts + a hot-dog cart at the gate
      k.at(px1 + 0.2, 0, (pz0 + pz1) / 2 - 3.6, -Math.PI / 2, () => {
        quad(A.park, 0, 1.5, 0.03, 2.4, 0.6, 0, AL);
        quad(A.park, 0, 1.5, -0.03, 2.4, 0.6, Math.PI, AL);
        for (const s of [-1.1, 1.1]) k.cyl(iron, 0x101010, s, 0.9, 0, 0.04, 0.04, 1.8, 6);
      });
      k.at(px1 + 1.4, 0, pz1 - 1.6, -Math.PI / 2, () => {
        k.box(vcMat(0.3, 0.7), 0xc8ccd4, 0, 0.75, 0, 1.6, 0.9, 0.8);
        for (const s of [-0.6, 0.6]) k.cyl(vcMat(0.5), 0x111111, s, 0.25, 0.42, 0.25, 0.25, 0.08, 12, 0, Math.PI / 2, 0);
        k.cyl(vcMat(0.4), 0x9a9a9a, 0, 1.9, 0, 0.03, 0.03, 1.4, 6);
        const umb = new THREE.ConeGeometry(1.1, 0.5, 8, 1, true);
        k.add(umb, vcMat(0.7), 0xe8b020, 0, 2.6, 0);
        quad(A.hotdog, 0, 0.95, 0.41, 1.3, 0.32, 0);
      });
      ppl.standing.push({ x: px1 + 1.4, z: pz1 - 0.6, rot: Math.PI / 2, shirt: 0xf2f2f2, vest: 0xc8202a });
    }

    // ---- the Village Deli (north wall, west end)
    {
      const w = dx1 - dx0;
      const cx = (dx0 + dx1) / 2;
      k.box(vcMat(0.7), 0x2a2018, cx, 3.6, iz0 + 0.3, w, 7.2, 0.2);
      quad(A.deli, cx, 4.1, iz0 + 0.42, w - 1.0, 0.85, 0);
      quad(A.menu, cx - 2.2, 2.6, iz0 + 0.42, 2.4, 1.2, 0);
      quad(A.menu, cx + 2.2, 2.6, iz0 + 0.42, 2.4, 1.2, 0);
      // back shelves with jars and cans
      for (const y of [1.3, 1.75]) {
        k.box(vcMat(0.6), 0x5a3a22, cx, y, iz0 + 0.55, w - 1.0, 0.05, 0.3);
        for (let x = dx0 + 0.8; x < dx1 - 0.8; x += 0.22) k.cyl(vcMat(0.5), [0xc8202a, 0xe8d8a8, 0x3a7a3a, 0xd88a3a][Math.floor(rnd() * 4)], x, y + 0.12, iz0 + 0.55, 0.06, 0.06, 0.2, 6);
      }
      // salamis hanging over the counter
      for (let x = dx0 + 1.2; x < dx1 - 1; x += 0.45) {
        k.cyl(vcMat(0.8), 0x7a2a1a, x, 2.85 - (rnd() * 0.3), dz1 - 0.6, 0.07, 0.06, 0.6, 6);
        k.cyl(vcMat(0.8), 0xd8c8a8, x, 3.3, dz1 - 0.6, 0.008, 0.008, 0.4, 3);
      }
      k.box(vcMat(0.6), 0x8a6a4a, cx, 3.5, dz1 - 0.6, w - 1.2, 0.05, 0.05);
      // the counter with a lit glass case of meats and cheeses
      k.box(vcMat(0.5), 0xe8e0d0, cx, 0.5, dz1 - 0.6, w - 1.2, 1.0, 0.7);
      k.box(glowMat(), 0xfff2d8, cx, 1.02, dz1 - 0.42, w - 1.3, 0.04, 0.3);
      for (let x = dx0 + 0.9; x < dx1 - 0.9; x += 0.5) k.box(vcMat(0.7), [0xd86a6a, 0xe8c87a, 0xc84a4a, 0xf2e2b0][Math.floor(rnd() * 4)], x, 1.06, dz1 - 0.42, 0.4, 0.08, 0.2);
      k.box(vcMat(0.05, 0.2), 0xd8ecf4, cx, 1.25, dz1 - 0.3, w - 1.2, 0.4, 0.03, 0, -0.4);
      for (let i = 0; i < 3; i++) ppl.standing.push({ x: dx0 + 2 + i * 2.8, z: iz0 + 1.25, rot: 0, shirt: 0xf4f4f0, vest: 0x2a2a2a });
      for (let i = 0; i < 2; i++) ppl.standing.push({ x: dx0 + 3.4 + i * 3.1, z: dz1 + 0.35, rot: Math.PI, shirt: shirt() });
    }

    // ---- the Big Apple Coaster entrance: sign over the north door + a queue maze toward the station
    {
      const dxm = NY.northDoor;
      quad(A.coaster, dxm, 5.4, iz0 + 0.45, 7.0, 0.88, 0);
      k.box(vcMat(0.5), 0x0a0a0a, dxm, 5.4, iz0 + 0.38, 7.2, 1.0, 0.1);
      for (let i = 0; i < 16; i++) k.add(new THREE.SphereGeometry(0.06, 6, 4), glowMat(), i % 2 ? 0xffd23a : 0xff3a3a, dxm - 3.6 + i * 0.48, 5.98, iz0 + 0.46);
      const rope = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const nn = Math.max(1, Math.round(len / 1.6));
        for (let i = 0; i <= nn; i++) {
          const x = x0 + ((x1 - x0) * i) / nn;
          const z = z0 + ((z1 - z0) * i) / nn;
          k.cyl(vcMat(0.3, 0.8), 0xc8ccd4, x, 0.48, z, 0.03, 0.03, 0.96, 6);
          k.cyl(vcMat(0.3, 0.8), 0xc8ccd4, x, 0.02, z, 0.16, 0.18, 0.04, 10);
        }
        k.box(vcMat(0.8), 0xc8202a, (x0 + x1) / 2, 0.85, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.04, 0.05, Math.abs(z1 - z0) + 0.04);
      };
      rope(dxm - 2.6, iz0 + 1.2, dxm - 2.6, iz0 + 5.4);
      rope(dxm + 2.6, iz0 + 1.2, dxm + 2.6, iz0 + 5.4);
      rope(dxm - 2.6, iz0 + 3.3, dxm + 0.8, iz0 + 3.3);
      for (let i = 0; i < 4; i++) ppl.standing.push({ x: dxm - 1.8 + i * 0.6, z: iz0 + 2.2 + (i % 2) * 2.2, rot: Math.PI, shirt: shirt() });
    }

    // ---- the dueling-piano bar (south wall): stage, two grand pianos nose to nose, tables, bar counter
    {
      const scx = (stx0 + stx1) / 2;
      const scz = (stz0 + stz1) / 2;
      k.box(vcMat(0.6), 0x2a1a10, scx, 0.2, scz, stx1 - stx0, 0.4, stz1 - stz0);
      k.box(glowMat(), 0xff4fa8, scx, 0.38, stz0 - 0.01, stx1 - stx0, 0.04, 0.03);
      k.box(vcMat(0.7), 0x2a0a1a, scx, 3.8, iz1 - 0.35, stx1 - stx0, 7.2, 0.15);
      quad(A.pianos, scx, 5.1, iz1 - 0.45, 7.0, 1.75, Math.PI);
      // curtains
      for (const s of [-1, 1]) {
        for (let q = 0; q < 5; q++) k.cyl(vcMat(0.9), 0x7a0a1a, scx + s * (stx1 - stx0) * 0.42 + s * q * 0.22, 2.4, iz1 - 0.6, 0.14, 0.16, 4.4, 8);
      }
      const piano = (x: number, rot: number) => {
        k.at(x, 0.4, scz + 0.2, rot, () => {
          const body = new THREE.CylinderGeometry(0.75, 0.75, 0.32, 20, 1, false, 0, Math.PI);
          k.add(body, vcMat(0.15, 0.3), 0x080808, 0.35, 0.85, 0, Math.PI / 2);
          k.box(vcMat(0.15, 0.3), 0x080808, -0.35, 0.85, 0, 0.7, 0.32, 1.5);
          k.box(vcMat(0.15, 0.3), 0x080808, -0.4, 1.35, -0.1, 1.5, 0.03, 1.3, 0, 0, 0.45);
          k.box(vcMat(0.4), 0xf4f4f0, -0.82, 0.88, 0, 0.18, 0.05, 1.4);
          k.box(vcMat(0.4), 0x101010, -0.8, 0.915, 0, 0.1, 0.02, 1.36);
          for (const [lx, lz] of [
            [-0.65, -0.6],
            [-0.65, 0.6],
            [0.8, 0],
          ]) k.cyl(vcMat(0.2, 0.4), 0x080808, lx, 0.35, lz, 0.05, 0.05, 0.7, 6);
          k.box(vcMat(0.6), 0x080808, -1.35, 0.25, 0, 0.4, 0.5, 0.9);
        });
      };
      piano(scx - 2.2, 0);
      piano(scx + 2.2, Math.PI);
      ppl.seated.push({ x: scx - 3.55, y: 0.25, z: scz + 0.2, rot: Math.PI / 2, shirt: 0x1a1a1a, vest: 0xff4fa8 });
      ppl.seated.push({ x: scx + 3.55, y: 0.25, z: scz + 0.2, rot: -Math.PI / 2, shirt: 0xf2f2f2, vest: 0x1a1a1a });
      // spotlights
      for (const s of [-1, 1]) {
        const cone = new THREE.ConeGeometry(1.1, 5.2, 16, 1, true);
        k.add(cone, additiveMat(), 0x2a1a24, scx + s * 2.2, 3.0, scz + 0.2);
      }
      // cabaret tables
      const [tx0, tx1, tz0, tz1] = NY.pianoTables;
      for (let x = tx0 + 1; x <= tx1 - 1; x += 2.5) {
        for (const z of [tz0 + 0.8, tz1 - 0.8]) {
          k.cyl(vcMat(0.3, 0.6), 0x1a1a1a, x, 0.37, z, 0.04, 0.2, 0.74, 8);
          k.cyl(vcMat(0.4), 0x2a1a10, x, 0.75, z, 0.4, 0.4, 0.04, 14);
          k.cyl(glowMat(), 0xffc070, x, 0.83, z, 0.05, 0.05, 0.1, 6);
          for (const s of [-1, 1]) {
            k.cyl(vcMat(0.6), 0x7a0a1a, x + s * 0.62, 0.45, z, 0.22, 0.2, 0.08, 10);
            if (rnd() < 0.7) ppl.seated.push({ x: x + s * 0.62, y: -0.22, z, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2, shirt: shirt() });
          }
        }
      }
      // bar counter along the east wall
      const bw = bbz1 - bbz0;
      const bcz = (bbz0 + bbz1) / 2;
      k.box(vcMat(0.15, 0.8), 0x9aa4b0, ix1 - 0.05, 2.1, bcz, 0.04, 2.2, bw);
      k.box(vcMat(0.5), 0x2a1a10, bbx0 + 0.55, 0.55, bcz, 0.6, 1.1, bw);
      k.box(vcMat(0.2, 0.3), 0x111111, bbx0 + 0.5, 1.13, bcz, 0.8, 0.06, bw + 0.2);
      k.box(glowMat(), 0xff4fa8, bbx0 + 0.2, 0.08, bcz, 0.03, 0.05, bw);
      for (const y of [1.4, 1.9]) {
        k.box(vcMat(0.4), 0x2a1a10, ix1 - 0.2, y, bcz, 0.3, 0.04, bw - 0.4);
        for (let z = bbz0 + 0.3; z < bbz1 - 0.3; z += 0.18) k.cyl(glowMat(), [0x3aa85a, 0xc8783a, 0xe8d8a8, 0x6ab8e8, 0xc8203a][Math.floor(rnd() * 5)], ix1 - 0.2, y + 0.16, z, 0.025, 0.04, 0.3, 6);
      }
      ppl.standing.push({ x: ix1 - 0.6, z: bcz, rot: -Math.PI / 2, shirt: 0x101010, vest: 0xff4fa8 });
      for (let z = bbz0 + 0.6; z < bbz1 - 0.4; z += 0.9) {
        k.cyl(vcMat(0.3, 0.8), 0x8a8e96, bbx0 - 0.4, 0.4, z, 0.035, 0.05, 0.8, 8);
        k.cyl(vcMat(0.6), 0x7a0a1a, bbx0 - 0.4, 0.82, z, 0.22, 0.2, 0.1, 12);
        if (rnd() < 0.5) ppl.seated.push({ x: bbx0 - 0.42, y: 0.15, z, rot: Math.PI / 2, shirt: shirt() });
      }
    }

    k.flush(group);
    buildPeople(group, 'sit', ppl.seated);
    buildPeople(group, 'stand', ppl.standing);
    return anim;
  });
}

// ------------------------------------------------------------------ the Strip marquee
/**
 * New York-New York's corner sign: stacked skyscraper panels in red, blue, gold and silver (chevron fins
 * like the Chrysler crown), an LED board, then the half-round cabinet with NEW YORK / NEW YORK in LED
 * pucks, Liberty's radiating crown on top and chasing bulbs round the arch. Faces up and down the Strip.
 */
export function nynyMarquee(b: WorldBuilder, x: number, z: number, ry: number): void {
  tickTheme(b);
  const g = new THREE.Group();
  const red = mat(0xb8282a, 0.35, 0.5);
  const blue = mat(0x2a4aa8, 0.35, 0.5);
  const gold = mat(0xd4a640, 0.3, 0.85);
  const silver = mat(0xd8dde4, 0.22, 0.9);
  const dark = mat(0x16181c, 0.5, 0.4);
  const granite = mat(0x4a4448, 0.6, 0.1);
  g.add(mesh(new THREE.BoxGeometry(3.4, 1.0, 2.6), granite, 0, 0.5, 0, true));
  // skyscraper stack
  const tiers: Array<[number, number, number, THREE.Material]> = [
    [2.8, 2.0, 3.6, red],
    [2.3, 1.6, 3.0, blue],
    [1.6, 1.2, 1.4, silver],
  ];
  let y = 1.0;
  tiers.forEach(([w, d, h, m]) => {
    g.add(mesh(new THREE.BoxGeometry(w, h, d), m, 0, y + h / 2, 0, true));
    // window grid stripes
    for (let k = 1; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(w + 0.04, 0.08, d + 0.04), gold, 0, y + (h * k) / 4, 0));
    y += h;
    g.add(mesh(new THREE.BoxGeometry(w + 0.25, 0.2, d + 0.25), gold, 0, y + 0.1, 0));
    y += 0.2;
  });
  // chevron fins up the sides (Chrysler-style)
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
    const fin = mesh(new THREE.BoxGeometry(0.18, 0.9, 1.2), k % 2 ? silver : gold, s * (1.55 - k * 0.12), 1.8 + k * 1.45, 0);
    fin.rotation.z = s * 0.35;
    g.add(fin);
  }
  // LED board, both faces
  const led = new LedBoard('NEW YORK-NEW YORK', ['THE BIG APPLE COASTER', 'ZARKANA • CIRQUE DU SOLEIL', 'THE BAR AT TIMES SQUARE', 'NEW YORK PIZZA • DELI', 'BROOKLYN BOWL ROOM'], ['#b8282a', '#2a4aa8', '#d4a640', '#101010', '#1f6a3a'], 320, 192);
  const face = new THREE.MeshBasicMaterial({ map: led.tex });
  const ledY = y + 2.2;
  g.add(mesh(new THREE.PlaneGeometry(6.6, 4.0), face, 0, ledY, 0.36));
  const back = mesh(new THREE.PlaneGeometry(6.6, 4.0), face, 0, ledY, -0.36);
  back.rotation.y = Math.PI;
  g.add(back);
  g.add(mesh(new THREE.BoxGeometry(6.6, 4.0, 0.7), dark, 0, ledY, 0));
  g.add(mesh(new THREE.BoxGeometry(6.9, 4.3, 0.5), gold, 0, ledY, 0));
  b.every((_dt, t) => {
    const dx = viewer.cam.x - x;
    const dz = viewer.cam.z - z;
    if (dx * dx + dz * dz < 240 * 240) led.draw(t);
  });
  // the half-round cabinet with NEW YORK / NEW YORK in pucks
  const mask = canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 74px "Arial Black", Impact, sans-serif';
    ctx.fillText('NEW YORK', w / 2, h * 0.5);
    ctx.fillText('NEW YORK', w / 2, h * 0.82);
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.arc(w / 2, h, w / 2 - 4, Math.PI, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#0f0';
    ctx.stroke();
    // crown rays radiating behind the text (accent pucks)
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + ((i + 0.5) / 9) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * 120, h + Math.sin(a) * 120);
      ctx.lineTo(w / 2 + Math.cos(a) * 230, h + Math.sin(a) * 230);
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  });
  const puck = puckMaterial(b, mask, [64, 32], 0xc8202a, 0xff4a3a, 0x0a1430, 1);
  const R = 4.2;
  const cabY = ledY + 2.45;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, R, 0, Math.PI, false);
  shape.lineTo(-R, 0);
  const ext = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 32 });
  ext.translate(0, 0, -0.45);
  const front = new THREE.ShapeGeometry(shape, 32);
  const fuv = front.attributes.uv as THREE.BufferAttribute;
  const fpos = front.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fpos.getX(i) / (2 * R) + 0.5, fpos.getY(i) / R);
  const cab = new THREE.Group();
  cab.add(mesh(ext, dark));
  const f1 = mesh(front, puck, 0, 0, 0.46);
  const f2 = mesh(front.clone(), puck, 0, 0, -0.46);
  f2.rotation.y = Math.PI;
  cab.add(f1, f2);
  // gold rim + chasing bulbs round the arch
  const rim = new THREE.TorusGeometry(R + 0.1, 0.14, 6, 40, Math.PI);
  cab.add(mesh(rim, gold));
  const bulbs = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd27a, emissiveIntensity: 0.2, roughness: 0.3 });
  b.nightGlow(bulbs, 0.2, 2.4);
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI;
    for (const s of [-1, 1]) cab.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), bulbs, Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1), s * 0.5));
  }
  cab.position.set(0, cabY, 0);
  g.add(cab);
  // Liberty's crown: seven gold rays above the arch, glowing after dark
  const rays = new THREE.MeshStandardMaterial({ color: 0xe8c050, metalness: 0.7, roughness: 0.3, emissive: 0xffc040, emissiveIntensity: 0.05 });
  b.nightGlow(rays, 0.05, 1.6);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.18 + (i / 6) * 0.64);
    const ray = mesh(new THREE.ConeGeometry(0.32, 3.0, 4), rays, Math.cos(a) * (R + 1.5), cabY + Math.sin(a) * (R + 1.5), 0);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  b.add(g);
  b.collider(x - 1.8, x + 1.8, z - 1.8, z + 1.8, 0, cabY + R, true);
  b.staticMarkers.push({ x, z, color: '#ff4a3a', glyph: '▮', size: 2.2 });
}
