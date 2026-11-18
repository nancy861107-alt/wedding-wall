// 省效能版布幕（給電視用）：外觀跟 drape.js 一樣，但動畫只用 transform／opacity，
// 由顯示卡處理，不用每一格重畫 SVG。
// 做法：布幕「關閉」和「拉開」兩種樣子各畫一次，開關時讓關閉的布往兩側收攏（scaleX），
// 同時淡入拉開後的樣子。API 跟 createDrape 相同：open(ms)、close(ms)、edgeX(y)、set(t)。
import { createDrape } from './drape.js';

export function createDrapeLite(host, opts = {}) {
  host.innerHTML = '';
  const layer = (css) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;top:0;height:100%;${css}`;
    host.append(el);
    return el;
  };

  // 拉開後的樣子（靜態）
  const swag = layer('left:0;width:100%;opacity:0;will-change:opacity;');
  const open = createDrape(swag, opts);
  open.set(1);

  // 關閉的樣子：左右各半片，各自往外側收攏
  const panels = ['left', 'right'].map((side) => {
    const wrap = layer(`${side}:0;width:50%;overflow:hidden;will-change:transform;transform-origin:${side} center;`);
    const inner = document.createElement('div');
    inner.style.cssText = `position:absolute;top:0;height:100%;width:200%;${side === 'left' ? 'left:0' : 'right:0'}`;
    wrap.append(inner);
    createDrape(inner, opts).set(0);
    return wrap;
  });

  const ease = 'cubic-bezier(.65,0,.35,1)';
  const squeeze = (opts.spread?.[1] ?? 0.1) * 2 + 0.06;   // 收攏到跟拉開後的寬度差不多

  function apply(isOpen, ms) {
    const fadeAt = isOpen ? ms * 0.45 : 0;                  // 打開：後半段才淡入；關閉：一開始就淡出
    const fadeLen = ms * 0.55;
    panels.forEach((p) => {
      p.style.transition = ms ? `transform ${ms}ms ${ease}, opacity ${fadeLen}ms linear ${isOpen ? fadeAt : 0}ms` : 'none';
      p.style.transform = isOpen ? `scaleX(${squeeze})` : 'none';
      p.style.opacity = isOpen ? 0 : 1;
    });
    swag.style.transition = ms ? `opacity ${fadeLen}ms linear ${fadeAt}ms` : 'none';
    swag.style.opacity = isOpen ? 1 : 0;
  }

  let state = 0;
  const go = (target, ms) => new Promise((resolve) => {
    if (state === target) return resolve();
    state = target;
    host.getBoundingClientRect();                           // 先讓瀏覽器套用目前狀態，transition 才會動
    apply(target === 1, ms);
    setTimeout(resolve, ms);
  });

  apply(false, 0);
  return {
    edgeX: open.edgeX,
    open: (ms = 2600) => go(1, ms),
    close: (ms = 1400) => go(0, ms),
    set(t) { state = t >= 0.5 ? 1 : 0; apply(state === 1, 0); },
  };
}
