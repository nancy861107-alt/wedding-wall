// 巴洛克雕花（顏色跟隨 currentColor）：一個角落花飾 symbol，四角鏡射使用。
const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="corner" viewBox="0 0 140 140">
      <g fill="none" stroke="currentColor" stroke-linecap="round">
        <path d="M5 138V26Q5 5 26 5H138" stroke-width="3"/>
        <path d="M14 138V32Q14 14 32 14H138" stroke-width="1.2"/>
        <path d="M24 24C58 22 70 44 54 58C43 67 30 57 38 47C43 41 51 45 48 51" stroke-width="3.2"/>
        <path d="M24 24C22 58 44 70 58 54C67 43 57 30 47 38C41 43 45 51 51 48" stroke-width="3.2"/>
        <path d="M44 14C60 4 84 6 100 16C86 13 70 17 60 26" stroke-width="2.2"/>
        <path d="M14 44C4 60 6 84 16 100C13 86 17 70 26 60" stroke-width="2.2"/>
        <path d="M100 16C108 20 112 14 118 14" stroke-width="1.6"/>
        <path d="M16 100C20 108 14 112 14 118" stroke-width="1.6"/>
      </g>
      <g fill="currentColor">
        <circle cx="22" cy="22" r="6"/>
        <path d="M58 58l9 3-6 6z"/>
        <circle cx="76" cy="9" r="2.4"/><circle cx="88" cy="9" r="2"/><circle cx="99" cy="9" r="1.6"/>
        <circle cx="9" cy="76" r="2.4"/><circle cx="9" cy="88" r="2"/><circle cx="9" cy="99" r="1.6"/>
      </g>
    </symbol>
    <symbol id="crest" viewBox="0 0 240 60">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.4">
        <path d="M120 50C98 50 90 30 104 22C114 16 124 26 116 32"/>
        <path d="M120 50C142 50 150 30 136 22C126 16 116 26 124 32"/>
        <path d="M100 40C70 44 50 30 20 36C44 26 70 34 92 28"/>
        <path d="M140 40C170 44 190 30 220 36C196 26 170 34 148 28"/>
      </g>
      <g fill="currentColor"><path d="M120 4l6 12-6 8-6-8z"/><circle cx="20" cy="36" r="3"/><circle cx="220" cy="36" r="3"/></g>
    </symbol>
  </defs>
</svg>`;

document.body.insertAdjacentHTML('afterbegin', SPRITE);

// 把四個角落花飾加到所有 .gilt 元素
export function gild(root = document) {
  root.querySelectorAll('.gilt:not([data-gilded])').forEach((el) => {
    el.dataset.gilded = '';
    for (const pos of ['tl', 'tr', 'bl', 'br']) {
      el.insertAdjacentHTML('beforeend', `<svg class="corner ${pos}" aria-hidden="true"><use href="#corner"/></svg>`);
    }
  });
}
gild();

export const crest = (cls = '') => `<svg class="crest ${cls}" viewBox="0 0 240 60" aria-hidden="true"><use href="#crest"/></svg>`;
