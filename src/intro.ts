/**
 * "How Lou Got to Vegas" — a comic-panel intro. Click / Space / Enter advances, Esc or Skip ends.
 * Art is built from CSS + emoji so it ships with zero assets.
 */
interface Panel {
  kicker: string;
  title: string;
  scene: string; // HTML for the illustration
  caption: string;
  bubble?: string;
  palette: [string, string];
}

const LOU = '<span class="lou" aria-label="Lou the cat">🐈</span>';

const PANELS: Panel[] = [
  {
    kicker: 'Somewhere in the Midwest',
    title: 'Meet Lou.',
    palette: ['#6fa8dc', '#b6d7a8'],
    scene: `<div class="sc-sky"></div><div class="sc-turbines">🌬️ ⚙️ 🌬️ ⚙️</div><div class="sc-corn">🌽🌽🌽🌽🌽🌽🌽</div><div class="sc-dash"></div><div class="sc-lou-dash">${LOU}</div>`,
    caption:
      'Brown mackerel tabby. Sixteen pounds of pure confidence. He had everything: a sunny dashboard, a raised food bowl, and a cat tree he has never once climbed.',
  },
  {
    kicker: '2:13 AM',
    title: 'The Incident.',
    palette: ['#2b1f3a', '#5b2a52'],
    scene: `<div class="sc-fridge">🧊</div><div class="sc-brochure">VIVA<br>LAS VEGAS</div><div class="sc-lou-stare">${LOU}</div><div class="sc-zzz">!!</div>`,
    caption: 'One night Lou knocked a “VIVA LAS VEGAS” brochure off the fridge. He has not blinked since.',
    bubble: '…nine lives. one shot.',
  },
  {
    kicker: 'The Plan',
    title: 'Liquidating Assets.',
    palette: ['#3a2a14', '#7a5a2a'],
    scene: `<div class="sc-loot">🧢 🪙 🎀 💵</div><div class="sc-lou-center">${LOU}</div><div class="sc-cig">🚬🚬</div>`,
    caption:
      'He cashed out his life savings — three bottle caps, a hair tie and $14 from the couch — and immediately spent $12 of it on cigarettes. Financial advisors call this “a strategy.”',
  },
  {
    kicker: 'I-80 → I-15',
    title: '1,600 Miles of Dashboards.',
    palette: ['#d98a4a', '#5a7ab8'],
    scene: `<div class="sc-road"></div><div class="sc-car">🚗</div><div class="sc-car sc-car--2">🚙</div><div class="sc-lou-squint">${LOU}<span class="squint">😑</span></div>`,
    caption: 'Lou hitchhiked across America on the dashboards of total strangers. He silently judged every single one of them.',
    bubble: 'your music is bad.',
  },
  {
    kicker: 'Primm, Nevada',
    title: 'Customs.',
    palette: ['#c9a227', '#7a1c1c'],
    scene: `<div class="sc-bag">CAT FOOD<br><small>COSTCO SIZE</small></div><div class="sc-lou-peek">${LOU}</div><div class="sc-crumbs">· · · · ·</div>`,
    caption: 'Smuggled across the state line inside a 40-pound bag of kibble. Ate his way out somewhere around the outlet mall.',
  },
  {
    kicker: '3:47 AM • Las Vegas Blvd',
    title: 'Welcome to Fabulous Las Vegas.',
    palette: ['#120a2a', '#ff2c8a'],
    scene: `<div class="sc-sign"><span>WELCOME</span><b>to Fabulous</b><strong>LAS VEGAS</strong><em>NEVADA</em></div><div class="sc-lou-arrive">${LOU}</div><div class="sc-neon">✨🎰✨🎲✨</div>`,
    caption: 'Lou arrives with two cigarettes, zero dollars and a gambling problem roughly the size of the Luxor pyramid.',
    bubble: 'mrrp. let’s get degenerate.',
  },
];

export class IntroComic {
  private readonly root: HTMLElement;
  private index = 0;
  private resolveDone: (() => void) | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') this.finish();
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
      e.preventDefault();
      this.next();
    }
  };

  constructor() {
    this.root = document.createElement('section');
    this.root.className = 'intro';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Intro story');
    document.getElementById('game-root')!.append(this.root);
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.intro-skip')) this.finish();
      else this.next();
    });
  }

  play(): Promise<void> {
    this.index = 0;
    this.root.hidden = false;
    this.render();
    window.addEventListener('keydown', this.onKey, true);
    return new Promise((res) => (this.resolveDone = res));
  }

  private next(): void {
    if (this.index >= PANELS.length - 1) return this.finish();
    this.index += 1;
    this.render();
  }

  private finish(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.hidden = true;
    this.resolveDone?.();
    this.resolveDone = null;
  }

  private render(): void {
    const p = PANELS[this.index];
    this.root.style.setProperty('--c1', p.palette[0]);
    this.root.style.setProperty('--c2', p.palette[1]);
    this.root.innerHTML = `
      <div class="intro-panel" data-i="${this.index}">
        <div class="intro-art">${p.scene}${p.bubble ? `<div class="intro-bubble">${p.bubble}</div>` : ''}</div>
        <div class="intro-text">
          <p class="intro-kicker">${p.kicker}</p>
          <h2>${p.title}</h2>
          <p class="intro-caption">${p.caption}</p>
          <p class="intro-hint">${this.index < PANELS.length - 1 ? 'Click or press Space ▸' : 'Click to start hustling ▸'}  <span class="intro-dots">${PANELS.map((_, i) => (i === this.index ? '●' : '○')).join(' ')}</span></p>
        </div>
      </div>
      <button type="button" class="intro-skip action-btn">Skip intro ▸▸</button>`;
  }
}
