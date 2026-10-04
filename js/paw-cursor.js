// 貓掌游標：滑鼠移動時跟著跑，旁邊的三顆十字星會一閃一閃。
// 只在有滑鼠的裝置啟用；手機、平板（手指操作）不受影響。
if (matchMedia('(pointer: fine)').matches) {
  const STAR = '<svg viewBox="0 0 20 20"><path d="M10 0C10.8 6 14 9.2 20 10C14 10.8 10.8 14 10 20C9.2 14 6 10.8 0 10C6 9.2 9.2 6 10 0Z"/></svg>';
  // 三顆星在原圖上的位置（佔整張圖的比例）與大小
  const STARS = [
    { x: 0.917, y: 0.147, s: 0.2, d: 0 },
    { x: 0.073, y: 0.212, s: 0.16, d: 0.5 },
    { x: 0.931, y: 0.836, s: 0.11, d: 1 },
  ];
  const SIZE = 36;

  const style = document.createElement('style');
  style.textContent = `
    body.paw-cursor, body.paw-cursor * { cursor: none !important; }
    body.paw-cursor input, body.paw-cursor textarea { cursor: text !important; }
    .paw-cursor-el { position: fixed; left: 0; top: 0; z-index: 1000; width: ${SIZE}px; height: ${SIZE * 952 / 990}px;
      pointer-events: none; translate: -50% -50%; transition: opacity .15s; }
    .paw-cursor-el.hide { opacity: 0; }
    .paw-cursor-el img { width: 100%; height: 100%; display: block; }
    .paw-cursor-el svg { position: absolute; fill: #8a1c17; translate: -50% -50%;
      animation: twinkle 1.4s ease-in-out infinite; }
    @keyframes twinkle {
      0%, 100% { opacity: .35; scale: .55; rotate: 0deg; }
      50% { opacity: 1; scale: 1.15; rotate: 45deg; }
    }
    @media (prefers-reduced-motion: reduce) { .paw-cursor-el svg { animation: none; } }`;
  document.head.append(style);

  const el = document.createElement('div');
  el.className = 'paw-cursor-el hide';
  el.innerHTML = `<img src="deco/paw-bare.png" alt="">` + STARS.map((st) =>
    STAR.replace('<svg', `<svg style="left:${st.x * 100}%;top:${st.y * 100}%;width:${st.s * SIZE * 1.6}px;height:${st.s * SIZE * 1.6}px;animation-delay:${st.d}s"`)).join('');
  document.body.append(el);
  document.body.classList.add('paw-cursor');

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    el.classList.remove('hide');
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => el.classList.add('hide'));
  // 移到文字框裡改回打字游標，貓掌先藏起來
  addEventListener('pointerover', (e) => el.classList.toggle('hide', !!e.target.closest?.('input, textarea')), { passive: true });
}
