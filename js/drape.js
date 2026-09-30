// 手繪風布幕：米白波浪線畫在磚紅布上；open(t) 0 = 關閉，1 = 往兩側拉開並在半腰收束。
const NS = 'http://www.w3.org/2000/svg';

// 固定亂數，讓每次畫出來一樣
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// spread：打開後每片布幕佔畫面寬度的比例（上方、收束點、下襬）
export function createDrape(host, { lines = 15, color = '#8a1c17', ink = 'rgba(248,228,206,.85)', spread = [0.27, 0.10, 0.30], gather = 0.56 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'drape-svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  host.append(svg);

  const rand = rng(20261119);
  // 每條線的固定擺動參數
  const wobble = Array.from({ length: lines + 1 }, () => [rand() - 0.5, rand() - 0.5, rand() - 0.5, 0.5 + rand() * 0.7]);
  // 線距不規則，比較像手繪
  const spots = Array.from({ length: lines + 1 }, (_, i) => (i === 0 || i === lines ? i / lines : (i + (rand() - 0.5) * 0.7) / lines));

  let W = 0, H = 0;
  const panels = ['left', 'right'].map((side) => {
    const g = document.createElementNS(NS, 'g');
    const clipId = `drape-clip-${side}-${Math.random().toString(36).slice(2, 7)}`;
    g.innerHTML = `<clipPath id="${clipId}"><path class="shape"/></clipPath>
      <path class="shape fill" fill="${color}"/>
      <g clip-path="url(#${clipId})"><g class="shade"></g></g>
      <g class="lines" fill="none" stroke="${ink}" stroke-linecap="round"></g>`;
    svg.append(g);
    return { side, g };
  });

  // 一條線從上到下的路徑：top x → 收束點 x → 底部 x
  function linePath(xTop, xMid, xBot, yMid, w, amp) {
    const [a, b, c] = w;
    return `M${xTop} 0 C${xTop + a * amp} ${yMid * 0.35}, ${xMid + b * amp} ${yMid * 0.7}, ${xMid} ${yMid}`
      + ` S${xBot + c * amp * 1.4} ${yMid + (H - yMid) * 0.6}, ${xBot} ${H}`;
  }

  function draw(t) {
    const k = ease(Math.min(1, Math.max(0, t)));
    const half = W / 2;
    const yMid = lerp(H * 0.6, H * gather, k);
    for (const { side, g } of panels) {
      const dir = side === 'left' ? 1 : -1;
      const x0 = side === 'left' ? 0 : W;
      // 關閉：每片佔半個畫面；打開：上方剩 30%，收束點 12%，底部張開到 34%
      const topW = lerp(half + 1, W * spread[0], k);
      const midW = lerp(half + 1, W * spread[1], k);
      const botW = lerp(half + 1, W * spread[2], k);
      const amp = lerp(10, 22, k);
      const X = (frac, width) => x0 + dir * frac * width;

      const edge = linePath(X(1, topW), X(1, midW), X(1, botW), yMid, [0, 0, 0], 0);
      const shape = `M${x0} 0 L${X(1, topW)} 0 ` + edge.replace(/^M[^C]+/, '') + ` L${x0} ${H} Z`;
      g.querySelectorAll('.shape').forEach((p) => p.setAttribute('d', shape));

      let ls = '';
      for (let i = 1; i <= lines; i++) {
        const f = spots[i];
        const w = wobble[i];
        ls += `<path stroke-width="${(w[3] * (1 - k * 0.3)).toFixed(2)}" d="${linePath(X(f, topW), X(f, midW), X(f, botW), yMid, w, amp)}"/>`;
      }
      g.querySelector('.lines').innerHTML = ls;

      // 收束處的陰影
      g.querySelector('.shade').innerHTML = k > 0.02
        ? `<ellipse cx="${X(1, midW)}" cy="${yMid}" rx="${W * 0.06}" ry="${H * 0.1}" fill="rgba(40,0,0,${(0.18 * k).toFixed(2)})"/>`
        : '';

    }
  }

  let current = 0;
  function resize() {
    W = host.clientWidth; H = host.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    draw(current);
  }
  new ResizeObserver(resize).observe(host);
  resize();

  return {
    // 開幕動畫：先中間裂一條縫，再拉開
    open(duration = 2600) {
      return new Promise((resolve) => {
        const start = performance.now();
        const step = (now) => {
          current = Math.min(1, (now - start) / duration);
          draw(current);
          current < 1 ? requestAnimationFrame(step) : resolve();
        };
        requestAnimationFrame(step);
        // 分頁在背景時 requestAnimationFrame 會暫停，時間到直接打開
        setTimeout(() => { if (current < 1) { current = 1; draw(1); resolve(); } }, duration + 400);
      });
    },
    set(t) { current = t; draw(t); },
  };
}
