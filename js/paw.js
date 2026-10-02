// 每次點按（滑鼠或手指）都在那個位置蓋一個貓掌印，彈出來再淡掉。
const style = document.createElement('style');
style.textContent = `
  .paw { position: fixed; z-index: 999; width: 46px; pointer-events: none; translate: -50% -50%; rotate: var(--r);
    animation: paw-stamp .9s ease-out forwards; }
  @keyframes paw-stamp {
    0% { opacity: 0; scale: .3; }
    18% { opacity: .95; scale: 1.12; }
    35% { opacity: .95; scale: 1; }
    100% { opacity: 0; scale: 1.05; }
  }
  @media (prefers-reduced-motion: reduce) { .paw { display: none; } }`;
document.head.append(style);

addEventListener('pointerdown', (e) => {
  const paw = new Image();
  paw.src = 'deco/paw.png';
  paw.alt = '';
  paw.className = 'paw';
  paw.style.left = `${e.clientX}px`;
  paw.style.top = `${e.clientY}px`;
  paw.style.setProperty('--r', `${Math.round(Math.random() * 50 - 25)}deg`);
  document.body.append(paw);
  paw.addEventListener('animationend', () => paw.remove());
}, { passive: true });
