/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 - 공유 카드 모듈
 * ═══════════════════════════════════════════════════════════════════════════
 * 사주 정보를 이미지 카드로 공유하는 기능
 */

import {
  CHEONGAN, JIJI, CHEONGAN_HANJA, JIJI_HANJA, CHEONGAN_OHENG, JIJI_OHENG,
  ZODIAC_EMOJI, ZODIAC_ANIMALS,
  OHENG_CARD_COLORS, OHENG_CARD_DIVIDER
} from '../core/constants.js';
import { ILGAN_INTERPRETATION, ILJU_INTERPRETATION, SISUNG_INTERPRETATION } from '../data/interpretations.js';

/**
 * 공유 카드 데이터 생성
 */
export function buildShareCardData(result, hasTime) {
  if (!result) return null;

  const dayIdx60 = result.idxs.day % 60;
  const dsi = result.idxs.day % 10;
  const dbi = result.idxs.day % 12;
  const yearBi = result.idxs.year % 12;

  const stemOh = CHEONGAN_OHENG[dsi];
  const ilju = ILJU_INTERPRETATION[dayIdx60];
  const interp = ILGAN_INTERPRETATION[dsi];

  // 오행 계산
  const oheng = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const countPos = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
  for (const p of countPos) {
    const pi = result.idxs[p];
    oheng[CHEONGAN_OHENG[pi % 10]]++;
    oheng[JIJI_OHENG[pi % 12]]++;
  }
  const ohT = hasTime ? 8 : 6;
  const ohSorted = Object.entries(oheng).sort((a, b) => b[1] - a[1]);

  // 십성 계산
  const tsCnt = {};
  const tsPos = hasTime ? ['year', 'month', 'hour'] : ['year', 'month'];
  for (const p of tsPos) {
    const s = result.tgStem[p];
    if (s && s !== '일간') tsCnt[s] = (tsCnt[s] || 0) + 1;
  }
  const brPos = hasTime ? ['year', 'month', 'day', 'hour'] : ['year', 'month', 'day'];
  for (const p of brPos) {
    const b = result.tgBranch[p];
    if (b) tsCnt[b] = (tsCnt[b] || 0) + 1;
  }
  const tsSorted = Object.entries(tsCnt).sort((a, b) => b[1] - a[1]);
  const topTsName = tsSorted.length > 0 ? tsSorted[0][0] : '—';
  const topTsInfo = SISUNG_INTERPRETATION[topTsName];

  return {
    hanja: CHEONGAN_HANJA[dsi] + JIJI_HANJA[dbi],
    hangul: result.pillars.day,
    stemOh,
    animal: ZODIAC_EMOJI[yearBi],
    animalName: ZODIAC_ANIMALS[yearBi],
    iljuName: ilju ? ilju.n : '',
    iljuTitle: ilju ? ilju.t : '',
    iljuDesc: ilju ? ilju.d : '',
    ilganName: interp?.name || '',
    ilganEmoji: interp?.emoji || '',
    ilganTitle: interp?.title || '',
    personality: interp?.personality || '',
    strength: interp?.strength || '',
    topTs: topTsName,
    topTsEmoji: topTsInfo ? topTsInfo.emoji : '',
    topTsTitle: topTsInfo ? topTsInfo.title : '',
    topTsKeyword: topTsInfo ? topTsInfo.keyword : '',
    oheng,
    ohT,
    ohSorted,
    dayIdx60,
    yearBi
  };
}

/**
 * 공유 카드 렌더러 클래스
 */
export class ShareCardRenderer {
  constructor() {
    this.overlayId = 'share-overlay';
    this.cardData = null;
  }

  /**
   * 공유 카드 열기
   */
  open(result, hasTime) {
    this.cardData = buildShareCardData(result, hasTime);
    if (!this.cardData) {
      alert('먼저 사주를 계산해주세요.');
      return;
    }

    const d = this.cardData;
    const color = OHENG_CARD_COLORS[d.stemOh] || OHENG_CARD_COLORS['토'];
    const divColor = OHENG_CARD_DIVIDER[d.stemOh] || '#999';

    // 오행 바 구성
    const ohColors = { 목: '#3a8c2a', 화: '#cc3333', 토: '#b89a20', 금: '#7070a0', 수: '#2a6aaa' };
    let ohBarHtml = '';
    for (const [el, cnt] of d.ohSorted) {
      if (cnt <= 0) continue;
      ohBarHtml += `<div class="sc-oheng-seg" style="flex:${cnt};background:${ohColors[el]}">${el}${cnt}</div>`;
    }

    // 십성 키워드 태그
    let tagHtml = '';
    if (d.topTsKeyword) {
      d.topTsKeyword.split(', ').forEach(k => {
        tagHtml += `<span class="sc-back-tag">${k}</span>`;
      });
    }

    const overlay = document.createElement('div');
    overlay.className = 'share-overlay';
    overlay.id = this.overlayId;
    overlay.innerHTML = `
      <div class="share-hint">카드를 터치하면 뒤집어집니다</div>
      <div class="share-card-wrap" id="share-card-wrap">
        <div class="share-card-inner">
          <div class="share-card-front">
            <div class="sc-front" style="background:${color.bg};color:${color.text}">
              <div class="sc-element-badge" style="background:${color.badge};color:${color.accent}">${d.stemOh}</div>
              <div class="sc-hanja">${d.hanja}</div>
              <div class="sc-hangul">${d.hangul}일주</div>
              <div class="sc-divider" style="background:${divColor}"></div>
              <div class="sc-animal-emoji">${d.animal}</div>
              <div class="sc-ilju-title">${d.iljuTitle}</div>
              <div class="sc-num">${d.dayIdx60 + 1}/60</div>
              <div class="sc-brand">연세사주</div>
            </div>
          </div>
          <div class="share-card-back">
            <div class="sc-back">
              <div class="sc-back-header">
                <div class="sc-back-icon">✦</div>
                <div class="sc-back-title">사주 BTI</div>
              </div>
              <div class="sc-back-section">
                <div class="sc-back-label">일주</div>
                <div class="sc-back-value">${d.ilganEmoji} ${d.hangul} — ${d.iljuName}일주</div>
                <div class="sc-back-sub">${d.ilganTitle}</div>
              </div>
              <div class="sc-back-divider"></div>
              <div class="sc-back-section">
                <div class="sc-back-label">오행 분포</div>
                <div class="sc-oheng-bar">${ohBarHtml}</div>
                <div class="sc-back-sub" style="margin-top:6px">강: ${d.ohSorted[0][0]}(${d.ohSorted[0][1]}) · 약: ${d.ohSorted[d.ohSorted.length - 1][0]}(${d.ohSorted[d.ohSorted.length - 1][1]})</div>
              </div>
              <div class="sc-back-divider"></div>
              <div class="sc-back-section">
                <div class="sc-back-label">발달 십성</div>
                <div class="sc-back-value">${d.topTsEmoji} ${d.topTs}</div>
                <div class="sc-back-sub">${d.topTsTitle}</div>
                <div class="sc-back-tags">${tagHtml}</div>
              </div>
              <div class="sc-back-divider"></div>
              <div class="sc-back-section">
                <div class="sc-back-label">성격</div>
                <div class="sc-back-sub">${(d.personality || '').substring(0, 80)}…</div>
              </div>
              <div class="sc-back-brand">연세사주 · yonseisaju.com</div>
            </div>
          </div>
        </div>
      </div>
      <div class="share-btns">
        <button class="share-btn-item share-btn-save" id="btn-save-card">💾 이미지 저장</button>
        <button class="share-btn-item share-btn-close" id="btn-close-card">✕ 닫기</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // 이벤트 바인딩
    const wrap = overlay.querySelector('.share-card-wrap');
    wrap.addEventListener('click', () => wrap.classList.toggle('flipped'));

    overlay.querySelector('#btn-close-card').addEventListener('click', () => this.close());
    overlay.querySelector('#btn-save-card').addEventListener('click', () => this.save());

    // 오버레이 배경 클릭 시 닫기
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  /**
   * 공유 카드 닫기
   */
  close() {
    const ov = document.getElementById(this.overlayId);
    if (!ov) return;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 300);
  }

  /**
   * 공유 카드 이미지로 저장
   */
  async save() {
    const wrap = document.getElementById('share-card-wrap');
    if (!wrap) return;

    try {
      // html2canvas 동적 로드
      if (typeof html2canvas === 'undefined') {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const isFlipped = wrap.classList.contains('flipped');
      const side = isFlipped ? '뒷면' : '앞면';
      const inner = wrap.querySelector('.share-card-inner');

      // 캡처를 위해 트랜지션 일시 제거
      const origTr = inner.style.transition;
      inner.style.transition = 'none';

      const canvas = await html2canvas(wrap, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false
      });

      inner.style.transition = origTr;

      // 다운로드
      const link = document.createElement('a');
      link.download = `사주카드_${side}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

    } catch (e) {
      console.error('카드 저장 실패:', e);
      alert('이미지 저장에 실패했습니다. 스크린샷을 이용해주세요.');
    }
  }
}

export default ShareCardRenderer;
