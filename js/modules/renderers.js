/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 - 렌더러 모듈
 * ═══════════════════════════════════════════════════════════════════════════
 * UI 렌더링을 담당하는 클래스들
 */

import { CHEONGAN, CHEONGAN_HANJA, JIJI, JIJI_HANJA, CHEONGAN_OHENG, JIJI_OHENG, CHEONGAN_EUMYANG, JIJI_EUMYANG, UI, THRESHOLDS, YUKSHIP_GAPJA } from '../core/constants.js';
import { ILGAN_INTERPRETATION, ILJU_INTERPRETATION, SISUNG_INTERPRETATION, DAILY_FORTUNE_INTERPRETATION } from '../data/interpretations.js';
import { $, $id, createElement, div, span, setInnerHTML, escapeHtml, batchUpdater } from '../utils/dom.js';
import { appState } from '../core/state.js';
import { RelationAnalyzer } from '../core/relations.js';
import { SajuCalculator } from '../core/calculator.js';

/**
 * 오행 색상 클래스 반환
 */
export function getOhengClass(oheng) {
  const classMap = { 목: 'el-wood', 화: 'el-fire', 토: 'el-earth', 금: 'el-metal', 수: 'el-water' };
  return classMap[oheng] || '';
}

/**
 * 사주 기둥 렌더러
 */
export class PillarRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
  }

  /**
   * 4주 전체 렌더링
   */
  render(result, hasTime) {
    if (!this.container) return;

    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const posLabels = { hour: '시주', day: '일주', month: '월주', year: '년주' };

    // 간지 정보바 (xx年 月 日 時 형식)
    const inp = result.input || {};
    const yearStem = CHEONGAN[result.idxs.year % 10];
    const yearBranch = JIJI[result.idxs.year % 12];
    const monthStem = CHEONGAN[result.idxs.month % 10];
    const monthBranch = JIJI[result.idxs.month % 12];
    const dayStem = CHEONGAN[result.idxs.day % 10];
    const dayBranch = JIJI[result.idxs.day % 12];

    let ganjiStr = `${yearStem}${yearBranch}年 ${monthStem}${monthBranch}月 ${dayStem}${dayBranch}日`;
    if (hasTime) {
      const hourStem = CHEONGAN[result.idxs.hour % 10];
      const hourBranch = JIJI[result.idxs.hour % 12];
      ganjiStr += ` ${hourStem}${hourBranch}時`;
    }

    let dateStr = `${inp.year || ''}년 ${inp.month || ''}월 ${inp.day || ''}일`;
    if (hasTime && inp.hour !== undefined) {
      const ap = inp.hour < 12 ? '오전' : '오후';
      let h12 = inp.hour <= 12 ? inp.hour : inp.hour - 12;
      if (h12 === 0) h12 = 12;
      dateStr += ` ${ap} ${h12}시 ${String(inp.minute || 0).padStart(2, '0')}분`;
    }

    let html = `<div class="info-bar">
      <div class="date-info">${dateStr}</div>
      <div class="ganji-info">${ganjiStr}</div>
    </div>`;

    html += '<div class="pillars-section"><h3 class="section-title">사주명식</h3>';
    html += '<div class="pillars-grid" style="grid-template-columns:repeat(4,1fr)">';

    // 시주 미상 처리
    if (!hasTime) {
      html += this._renderEmptyPillar('시주', '시간 미상');
    }

    for (const pos of positions) {
      const pillar = result.pillars[pos];
      const stemIdx = result.idxs[pos] % 10;
      const branchIdx = result.idxs[pos] % 12;

      // 음양을 +/- 로 변환
      const stemSign = CHEONGAN_EUMYANG[stemIdx] === '양' ? '+' : '-';
      const branchSign = JIJI_EUMYANG[branchIdx] === '양' ? '+' : '-';

      // 십이운성: 일간 기준 + 각 기둥 천간 기준 (일지 제외)
      let tsDisplay = result.ts[pos];
      if (pos !== 'day' && result.tsSelf && result.tsSelf[pos]) {
        tsDisplay = `${result.ts[pos]}(${result.tsSelf[pos]})`;
      }

      html += this._renderPillar({
        label: posLabels[pos],
        stem: CHEONGAN[stemIdx],
        stemHanja: CHEONGAN_HANJA[stemIdx],
        branch: JIJI[branchIdx],
        branchHanja: JIJI_HANJA[branchIdx],
        stemOheng: CHEONGAN_OHENG[stemIdx],
        branchOheng: JIJI_OHENG[branchIdx],
        stemSign: stemSign,
        branchSign: branchSign,
        tgStem: result.tgStem[pos],
        tgBranch: result.tgBranch[pos],
        ts: tsDisplay,
        isDay: pos === 'day'
      });
    }

    html += '</div></div>';
    setInnerHTML(this.container, html);
  }

  _renderPillar(data) {
    const stemClass = getOhengClass(data.stemOheng);
    const branchClass = getOhengClass(data.branchOheng);
    const dayClass = data.isDay ? ' day-pillar' : '';

    return `
      <div class="pillar-card${dayClass}">
        <div class="pillar-label">${escapeHtml(data.label)}</div>
        <div class="ten-god-stem">${data.tgStem}</div>
        <div class="char-block">
          <span class="char-kr ${stemClass}">${escapeHtml(data.stem)}</span>
          <span class="char-cn ${stemClass}">${escapeHtml(data.stemHanja)}</span>
        </div>
        <div class="char-sub">${data.stemSign}${data.stemOheng}</div>
        <div class="pillar-divider"></div>
        <div class="char-block">
          <span class="char-kr ${branchClass}">${escapeHtml(data.branch)}</span>
          <span class="char-cn ${branchClass}">${escapeHtml(data.branchHanja)}</span>
        </div>
        <div class="char-sub">${data.branchSign}${data.branchOheng}</div>
        <div class="ten-god-branch">${data.tgBranch}</div>
        <div class="twelve-stage">${data.ts}</div>
      </div>
    `;
  }

  _renderEmptyPillar(label, message) {
    return `
      <div class="pillar-card empty-pillar">
        <div class="pillar-label">${escapeHtml(label)}</div>
        <div class="ten-god-stem"></div>
        <div class="char-block">
          <span class="char-kr" style="color:#ddd">?</span>
        </div>
        <div class="char-sub" style="color:#ccc">${escapeHtml(message)}</div>
        <div class="pillar-divider"></div>
        <div class="char-block">
          <span class="char-kr" style="color:#ddd">?</span>
        </div>
        <div class="char-sub"></div>
        <div class="ten-god-branch"></div>
        <div class="twelve-stage"></div>
      </div>
    `;
  }
}

/**
 * 오행 분석 렌더러
 */
export class OhengRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
    this._transformInfo = null;
  }

  setTransformInfo(info) {
    this._transformInfo = info;
  }

  render(ohengPercent) {
    if (!this.container) return;

    const ohengOrder = ['목', '화', '토', '금', '수'];
    const colors = UI.COLORS.OHENG;

    // 최대값 기준 스케일링
    const maxPct = Math.max(...Object.values(ohengPercent));
    const scale = maxPct > 40 ? 100 / maxPct : 2.5;

    let html = '<div class="analysis-card oheng-card-new">';
    html += '<h3 class="section-title-spaced">오 행</h3>';
    html += '<div class="oheng-table-new">';

    for (const e of ohengOrder) {
      const pct = ohengPercent[e];
      const barWidth = Math.min(100, Math.round(pct * scale));

      html += `
        <div class="oheng-row-new">
          <span class="oheng-label-new" style="color:${colors[e]}">${e}</span>
          <div class="oheng-bar-bg-new">
            <div class="oheng-bar-fill-new" style="width:${barWidth}%;background:${colors[e]}"></div>
          </div>
          <span class="oheng-pct-new">${pct}%</span>
        </div>
      `;
    }
    html += '</div></div>';
    setInnerHTML(this.container, html);
  }
}

/**
 * 십성 분석 렌더러 (그룹별 표기)
 */
export class SipsungRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
  }

  render(result, hasTime, ohengPercent, tenGodCount) {
    if (!this.container) return;

    // 일간 오행 기반 그룹별 오행 매핑
    const dayStemIdx = result.idxs.day % 10;
    const dayElement = Math.floor(dayStemIdx / 2);
    const ohengNames = ['목', '화', '토', '금', '수'];
    const 생 = [1, 2, 3, 4, 0];
    const 극 = [2, 3, 4, 0, 1];
    const 역생 = [4, 0, 1, 2, 3];
    const 역극 = [3, 4, 0, 1, 2];

    // 그룹별 정의 (그룹명, 오행, 개별 십성)
    const groups = [
      { name: '비겁', oheng: ohengNames[dayElement], items: ['비견', '겁재'] },
      { name: '식상', oheng: ohengNames[생[dayElement]], items: ['식신', '상관'] },
      { name: '재성', oheng: ohengNames[극[dayElement]], items: ['편재', '정재'] },
      { name: '관성', oheng: ohengNames[역극[dayElement]], items: ['편관', '정관'] },
      { name: '인성', oheng: ohengNames[역생[dayElement]], items: ['편인', '정인'] }
    ];

    const colors = UI.COLORS.OHENG;

    // 가중치 십성 카운트 사용 (OhengAnalyzer에서 계산된 값)
    const cnt = tenGodCount || {};
    const total = Object.values(cnt).reduce((a, b) => a + b, 0) || 1;

    // 십성별 퍼센트 계산
    const sipsungPct = {};
    for (const g of groups) {
      for (const item of g.items) {
        sipsungPct[item] = Math.round((cnt[item] || 0) / total * 100);
      }
    }

    const maxPct = Math.max(...Object.values(sipsungPct), 1);
    const scale = maxPct > 25 ? 100 / maxPct : 4;

    let html = '<div class="analysis-card sipsung-card-new">';
    html += '<h3 class="section-title-spaced">십 성</h3>';
    html += '<div class="sipsung-groups-new">';

    for (const g of groups) {
      const oheng = g.oheng;
      const barColor = colors[oheng] || '#888';

      html += `<div class="sipsung-group-new">`;
      html += `<div class="sipsung-group-header-new"><span class="sipsung-group-name-new">${g.name}</span><span class="sipsung-group-oheng-new" style="color:${barColor}">${oheng}</span></div>`;

      for (const item of g.items) {
        const pct = sipsungPct[item] || 0;
        const barWidth = Math.min(100, Math.round(pct * scale));

        html += `
          <div class="sipsung-row-new">
            <span class="sipsung-name-new">${item}</span>
            <div class="sipsung-bar-bg-new">
              <div class="sipsung-bar-fill-new" style="width:${barWidth}%;background:${barColor}"></div>
            </div>
            <span class="sipsung-pct-new">${pct}%</span>
          </div>
        `;
      }
      html += '</div>';
    }

    html += '</div></div>';
    setInnerHTML(this.container, html);
  }
}

/**
 * 지장간 렌더러 (세로 레이아웃, 초기-중기-본기 순서)
 */
export class HiddenStemsRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
  }

  render(result, hasTime) {
    if (!this.container) return;

    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const posLabels = { hour: '시지', day: '일지', month: '월지', year: '년지' };
    const typeOrder = ['초기', '중기', '본기'];

    let html = '<div class="analysis-card hs-card-vertical">';
    html += '<h3 class="section-title-spaced">지장간</h3>';
    html += '<div class="hs-columns">';

    // 왼쪽에 초기/중기/본기 레이블 컬럼 추가
    html += `<div class="hs-column hs-label-column">
      <div class="hs-col-label">&nbsp;</div>
      <div class="hs-col-branch">&nbsp;</div>
      <div class="hs-col-items">
        <div class="hs-item hs-type-label"><span>초기</span></div>
        <div class="hs-item hs-type-label"><span>중기</span></div>
        <div class="hs-item hs-type-label hs-item-bon"><span>본기</span></div>
      </div>
    </div>`;

    // 시주 미상일 때 빈 컬럼 추가
    if (!hasTime) {
      html += `<div class="hs-column hs-empty">
        <div class="hs-col-label">시지</div>
        <div class="hs-col-branch">?</div>
        <div class="hs-col-items"><span class="hs-item-empty">시간 미상</span></div>
      </div>`;
    }

    for (const p of positions) {
      const branchIdx = result.idxs[p] % 12;
      const branchChar = JIJI[branchIdx];
      const branchHanja = JIJI_HANJA[branchIdx];
      const branchOheng = JIJI_OHENG[branchIdx];
      const branchColor = UI.COLORS.OHENG[branchOheng] || '#666';
      const hiddenStems = result.hiddenStems[p];

      // 타입별로 정렬 (초기, 중기, 본기 순)
      const sortedStems = [...hiddenStems].sort((a, b) =>
        typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
      );

      html += `<div class="hs-column">
        <div class="hs-col-label">${posLabels[p]}</div>
        <div class="hs-col-branch" style="color:${branchColor}">${branchChar}<span class="hs-branch-hanja">${branchHanja}</span></div>
        <div class="hs-col-items">`;

      for (const h of sortedStems) {
        const stemIdx = CHEONGAN.indexOf(h.stem);
        const stemHanja = CHEONGAN_HANJA[stemIdx];
        const elClass = getOhengClass(h.element);
        const bonClass = h.type === '본기' ? ' hs-item-bon' : '';

        html += `<div class="hs-item${bonClass}">
          <span class="hs-item-stem ${elClass}">${h.stem}${stemHanja}</span>
          <span class="hs-item-tg">${h.tenGod}</span>
        </div>`;
      }

      html += '</div></div>';
    }

    html += '</div></div>';
    setInnerHTML(this.container, html);
  }
}

/**
 * 대운/세운/월운 카드 렌더러
 */
export class FortuneCardRenderer {
  constructor(containerId) {
    this.containerId = containerId;
  }

  /**
   * 단일 포춘 카드 HTML 생성
   */
  _cardHTML(pillar, topText, bottomText, isCurrent, tgStem, tgBranch, ts, opts = {}) {
    const stemIdx = CHEONGAN.indexOf(pillar[0]);
    const branchIdx = JIJI.indexOf(pillar[1]);
    const stemClass = getOhengClass(CHEONGAN_OHENG[stemIdx]);
    const branchClass = getOhengClass(JIJI_OHENG[branchIdx]);

    const cls = 'fortune-card' +
      (isCurrent ? ' current' : '') +
      (opts.selected ? ' selected' : '') +
      (opts.clickable ? ' clickable' : '');
    const attrs = (opts.onclick ? ` onclick="${opts.onclick}"` : '') +
      (opts.data ? ` ${opts.data}` : '');

    return `<div class="${cls}"${attrs}>
      <div class="fc-age">${topText}</div>
      ${bottomText ? `<div class="fc-year">${bottomText}</div>` : ''}
      <div class="fc-tg-stem">${tgStem || ''}</div>
      <div class="fc-stem ${stemClass}">${pillar[0]}<span class="fc-cn">${CHEONGAN_HANJA[stemIdx]}</span></div>
      <div class="fc-divider"></div>
      <div class="fc-branch ${branchClass}">${pillar[1]}<span class="fc-cn">${JIJI_HANJA[branchIdx]}</span></div>
      <div class="fc-tg">${tgBranch || ''}</div>
      <div class="fc-ts">${ts || ''}</div>
    </div>`;
  }

  /**
   * 대운 전체 섹션 렌더링
   */
  renderDaeunSection(container, daeunData, termStr, onSelectCallback) {
    if (!container) return;
    if (!daeunData) {
      setInnerHTML(container, `<div class="fortune-section"><div class="section-title">대운 <span class="fortune-direction">${termStr || ''}</span></div><div class="no-gender-msg">성별을 선택하면 대운이 표시됩니다</div></div>`);
      return;
    }

    const now = new Date();
    const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
    let autoDaeunIdx = -1;

    let html = `<div class="fortune-section">
      <div class="section-title">대운</div>
      <div class="daeun-info-bar">
        <span class="daeun-direction ${daeunData.forward ? 'forward' : 'reverse'}">${daeunData.forward ? '▶ 순행' : '◀ 역행'}</span>
        <span class="daeun-start">${daeunData.startAge}세 ${daeunData.startMonth}월 시작</span>
        <span class="daeun-term">${termStr || ''}</span>
      </div>
      <div id="daeun-scroll" class="fortune-scroll">`;

    for (let di = 0; di < daeunData.list.length; di++) {
      const d = daeunData.list[di];
      const nextCalYear = di < daeunData.list.length - 1 ? daeunData.list[di + 1].calYear : d.calYear + 10;
      const isCurrent = (curYear > d.calYear || (curYear === d.calYear && curMonth >= d.startMonth)) &&
                        (curYear < nextCalYear || (curYear === nextCalYear && curMonth < d.startMonth));
      if (isCurrent) autoDaeunIdx = di;

      html += this._cardHTML(d.pillar, `${d.age}세 ${d.startMonth}월`, `${d.calYear}.${d.startMonth}`, isCurrent,
        d.tgStem, d.tgBranch, d.ts, { onclick: `window.__selectDaeun && window.__selectDaeun(${di})`, clickable: true });
    }
    html += `</div></div>`;

    setInnerHTML(container, html);

    // 대운 선택 함수 등록
    window.__selectDaeun = (idx) => {
      const cards = container.querySelectorAll('#daeun-scroll .fortune-card');
      cards.forEach((c, i) => c.classList.toggle('selected', i === idx));
      if (onSelectCallback) onSelectCallback(idx, daeunData);
    };

    return autoDaeunIdx >= 0 ? autoDaeunIdx : 0;
  }

  /**
   * 세운 섹션 렌더링
   */
  renderSeunSection(container, saeunList, title, selectedYear, onSelectCallback) {
    if (!container) return;

    let html = `<div class="section-title">${title} <span style="font-size:0.7rem;color:var(--text-dim);font-weight:400;letter-spacing:0">▲ 대운을 클릭하면 해당 범위가 표시됩니다</span></div><div class="fortune-scroll">`;

    for (const s of saeunList) {
      html += this._cardHTML(s.pillar, `${s.age}세`, `${s.year}`, s.isCurrent,
        s.tgStem, s.tgBranch, s.ts,
        {
          onclick: `window.__selectSeun && window.__selectSeun(${s.year})`,
          clickable: true,
          selected: s.year === selectedYear,
          data: `data-year="${s.year}"`
        });
    }
    html += `</div>`;

    setInnerHTML(container, html);

    // 세운 선택 함수 등록
    window.__selectSeun = (year) => {
      const cards = container.querySelectorAll('.fortune-card');
      cards.forEach(c => c.classList.toggle('selected', c.dataset.year == year));
      if (onSelectCallback) onSelectCallback(year);
    };
  }

  /**
   * 월운 섹션 렌더링
   */
  renderWolunSection(container, wolunList, year, koreanAge) {
    if (!container) return;

    let html = `<div class="section-title">월운 · ${year}년 (${koreanAge}세) <span style="font-size:0.7rem;color:var(--text-dim);font-weight:400;letter-spacing:0">▲ 세운을 클릭하면 해당 연도가 표시됩니다</span></div><div class="fortune-scroll">`;

    for (const w of wolunList) {
      const termStr = w.termDt ? `${w.termDt.getMonth() + 1}/${w.termDt.getDate()}` : '';
      html += this._cardHTML(w.pillar, w.termName, termStr, w.isCurrent, w.tgStem, w.tgBranch, w.ts);
    }
    html += `</div>`;

    setInnerHTML(container, html);
  }

  /**
   * 운세 ↔ 원국 합충 관계 렌더링
   */
  renderInteraction(container, originalResult, hasTime, daeunInfo, seunYear) {
    if (!container || !originalResult) return;

    const poss = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const posK = { hour: '시', day: '일', month: '월', year: '년' };
    const relColors = { 합: '#2d8a4e', 충: '#c0392b', 형: '#b8860b', 파: '#7f8c8d', 해: '#2874a6' };

    // 활성화된 운세 기둥 수집
    const fpList = [];
    if (daeunInfo) {
      fpList.push({ name: '대운', idx: daeunInfo.idx || 0, pillar: daeunInfo.pillar });
    }
    if (seunYear) {
      const REF_YEAR = 2002, REF_YEAR_IDX = 18;
      const yIdx = ((REF_YEAR_IDX + (seunYear - REF_YEAR)) % 60 + 60) % 60;
      fpList.push({ name: '세운', idx: yIdx, pillar: YUKSHIP_GAPJA[yIdx] });
    }

    if (fpList.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = `<div class="fortune-interaction"><div class="section-title">운세 ↔ 원국 합충</div>`;
    let hasAny = false;

    for (const fp of fpList) {
      const fSi = fp.idx % 10, fBi = fp.idx % 12;
      const notes = [];

      for (const p of poss) {
        const si = originalResult.idxs[p] % 10;
        const bi = originalResult.idxs[p] % 12;

        // 천간 검사
        const stemRels = RelationAnalyzer.checkStemPair(fSi, si);
        for (const rel of stemRels) {
          const tag = rel.type;
          const arrow = rel.result ? `→${rel.result}` : '';
          notes.push(`<span style="color:${relColors[tag]}">● ${fp.name} ${CHEONGAN[fSi]} ↔ ${posK[p]}간 ${CHEONGAN[si]} <b>${tag}${arrow}</b></span>`);
        }

        // 지지 검사
        const branchRels = RelationAnalyzer.checkBranchPair(fBi, bi);
        for (const rel of branchRels) {
          const arrow = rel.result ? `→${rel.result}` : '';
          notes.push(`<span style="color:${relColors[rel.type]}">● ${fp.name} ${JIJI[fBi]} ↔ ${posK[p]}지 ${JIJI[bi]} <b>${rel.type}${arrow}</b></span>`);
        }
      }

      // 대운 ↔ 세운 관계도 체크
      if (fpList.length === 2 && fp === fpList[1]) {
        const f0 = fpList[0];
        const stemRels = RelationAnalyzer.checkStemPair(f0.idx % 10, fp.idx % 10);
        for (const rel of stemRels) {
          const arrow = rel.result ? `→${rel.result}` : '';
          notes.push(`<span style="color:${relColors[rel.type]}">● 대운 ${CHEONGAN[f0.idx % 10]} ↔ 세운 ${CHEONGAN[fSi]} <b>${rel.type}${arrow}</b></span>`);
        }
        const branchRels = RelationAnalyzer.checkBranchPair(f0.idx % 12, fp.idx % 12);
        for (const rel of branchRels) {
          const arrow = rel.result ? `→${rel.result}` : '';
          notes.push(`<span style="color:${relColors[rel.type]}">● 대운 ${JIJI[f0.idx % 12]} ↔ 세운 ${JIJI[fBi]} <b>${rel.type}${arrow}</b></span>`);
        }
      }

      if (notes.length) {
        hasAny = true;
        html += `<div class="fi-notes">${notes.join('<br>')}</div>`;
      }
    }

    if (!hasAny) {
      html += `<div class="fi-empty">현재 선택된 운세와 원국 사이에 합충 관계가 없습니다</div>`;
    }
    html += `</div>`;

    container.innerHTML = html;
  }
}

/**
 * 용신 분석 렌더러 (억부용신 + 통관용신 카드 형태)
 */
export class YongsinRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
  }

  render(yongsinData) {
    if (!this.container) return;

    const { 용신, 용신설명, 통관, 통관설명 } = yongsinData;
    const colors = UI.COLORS.OHENG;

    let html = '<div class="analysis-card"><h3 class="section-title">용신</h3>';
    html += '<div class="yongsin-cards">';

    // 억부용신 카드
    html += `
      <div class="yongsin-card">
        <div class="yongsin-card-type">억부용신</div>
        <div class="yongsin-card-value" style="color:${colors[용신] || 'var(--accent)'}">${용신 || '—'}</div>
        <div class="yongsin-card-desc">${용신설명 || ''}</div>
      </div>
    `;

    // 통관용신 카드
    html += `
      <div class="yongsin-card${통관 ? '' : ' empty'}">
        <div class="yongsin-card-type">통관용신</div>
        <div class="yongsin-card-value" style="color:${통관 ? colors[통관] : 'var(--text-dim)'}">${통관 || '없음'}</div>
        <div class="yongsin-card-desc">${통관설명 || ''}</div>
      </div>
    `;

    html += '</div></div>';

    setInnerHTML(this.container, html);
  }
}

/**
 * 오늘의 운세 렌더러
 */
/**
 * 오늘의 간지 계산
 */
function getTodayGanji() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  // 기준일 2000-01-07(갑자일) 부터의 일수 차이
  const base = new Date(2000, 0, 7);
  const diff = Math.floor((new Date(y, m - 1, d) - base) / (24 * 60 * 60 * 1000));
  const idx = ((diff % 60) + 60) % 60;
  return { stemIdx: idx % 10, branchIdx: idx % 12, ganjiIdx: idx };
}

/**
 * 십성 계산 (간단 버전)
 * 오행 인덱스: 0=목, 1=화, 2=토, 3=금, 4=수
 */
function getTenGod(dayStemIdx, targetStemIdx) {
  if (dayStemIdx === targetStemIdx) return '비견';
  const dayElement = Math.floor(dayStemIdx / 2);
  const targetElement = Math.floor(targetStemIdx / 2);
  const sameParity = (dayStemIdx % 2) === (targetStemIdx % 2);

  if (dayElement === targetElement) return sameParity ? '비견' : '겁재';

  // 오행 상생: 목→화, 화→토, 토→금, 금→수, 수→목
  const 생 = [1, 2, 3, 4, 0]; // 생[dayElement] = 내가 생하는 오행
  // 오행 상극: 목→토, 화→금, 토→수, 금→목, 수→화
  const 극 = [2, 3, 4, 0, 1]; // 극[dayElement] = 내가 극하는 오행

  if (생[dayElement] === targetElement) return sameParity ? '식신' : '상관';
  if (극[dayElement] === targetElement) return sameParity ? '편재' : '정재';
  if (생[targetElement] === dayElement) return sameParity ? '편인' : '정인';
  if (극[targetElement] === dayElement) return sameParity ? '편관' : '정관';

  return '비견'; // fallback (should not reach here)
}

export class TodayFortuneRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
  }

  /**
   * 오늘의 운세 렌더링 (원본 renderToday 완전 구현)
   */
  render(result, hasTime) {
    if (!this.container) return;
    if (!result || !result.idxs) {
      console.warn('[TodayFortuneRenderer] Invalid result');
      return;
    }

    const today = getTodayGanji();
    const dayStemIdx = result.idxs.day % 10;
    const todayStemIdx = today.stemIdx;

    // 오늘 천간과 일간의 십성 관계
    const tg = getTenGod(dayStemIdx, todayStemIdx);
    const info = DAILY_FORTUNE_INTERPRETATION[tg];

    if (!info) {
      setInnerHTML(this.container, '<div class="empty-message">운세 정보를 계산할 수 없습니다.</div>');
      return;
    }

    const stemChar = CHEONGAN[todayStemIdx];
    const branchChar = JIJI[today.branchIdx];
    const stemHanja = CHEONGAN_HANJA[todayStemIdx];
    const branchHanja = JIJI_HANJA[today.branchIdx];
    const stemEl = CHEONGAN_OHENG[todayStemIdx];
    const branchEl = JIJI_OHENG[today.branchIdx];

    const now = new Date();
    const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[now.getDay()];

    // 운세 점수
    const luck = info.luck;
    const luckColor = luck >= 70 ? '#5a9c6a' : luck >= 50 ? '#c9a55a' : '#c75a5a';
    const luckLabel = luck >= 80 ? '대길' : luck >= 65 ? '길' : luck >= 50 ? '보통' : luck >= 35 ? '소흉' : '흉';

    // 일간 해석
    const ilganInterp = ILGAN_INTERPRETATION[dayStemIdx];

    let h = '<div class="bti-wrap">';
    h += `<div class="bti-header"><div class="bti-date">${dateStr} ${dayName}요일</div></div>`;

    // 오늘의 간지 카드
    h += `<div class="today-ganji-card">`;
    h += `<div class="today-ganji-top">`;
    h += `<div class="today-ganji-chars"><span class="today-stem ${getOhengClass(stemEl)}">${stemChar}</span><span class="today-branch ${getOhengClass(branchEl)}">${branchChar}</span></div>`;
    h += `<div class="today-ganji-hanja"><span class="${getOhengClass(stemEl)}">${stemHanja}</span><span class="${getOhengClass(branchEl)}">${branchHanja}</span></div>`;
    h += `<div class="today-ganji-oh">${stemEl} · ${branchEl}</div>`;
    h += `</div>`;
    h += `<div class="today-tg-badge">${info.icon} ${tg}</div>`;
    h += `<div class="today-title">${info.title}</div>`;
    h += `</div>`;

    // 운세 점수
    h += `<div class="today-luck-section">`;
    h += `<div class="bti-section-title">오늘의 운세 지수</div>`;
    h += `<div class="today-luck-row"><div class="today-luck-bar-bg"><div class="today-luck-bar-fill" style="width:${luck}%;background:${luckColor}"></div></div><span class="today-luck-score" style="color:${luckColor}">${luck}점 (${luckLabel})</span></div>`;
    h += `</div>`;

    // 카테고리별 운세
    h += `<div class="bti-card"><div class="bti-section-title">오늘의 운세 풀이</div>`;
    h += `<div class="today-category"><span class="today-cat-icon">✅</span><div><span class="today-cat-label">좋은 기운</span><p class="today-cat-text">${info.good}</p></div></div>`;
    h += `<div class="today-category"><span class="today-cat-icon">⚠️</span><div><span class="today-cat-label">주의할 점</span><p class="today-cat-text">${info.warn}</p></div></div>`;
    h += `<div class="today-category"><span class="today-cat-icon">💕</span><div><span class="today-cat-label">연애운</span><p class="today-cat-text">${info.love}</p></div></div>`;
    h += `<div class="today-category"><span class="today-cat-icon">💰</span><div><span class="today-cat-label">금전운</span><p class="today-cat-text">${info.money}</p></div></div>`;
    h += `</div>`;

    // 내 사주 정보 요약
    if (ilganInterp) {
      h += `<div class="bti-summary"><div class="bti-section-title">나의 사주 요약</div>`;
      h += `<div class="bti-summary-grid">`;
      h += `<div class="bti-stat"><span class="bti-stat-label">일간</span><span class="bti-stat-value">${ilganInterp.emoji} ${ilganInterp.name}</span></div>`;
      h += `<div class="bti-stat"><span class="bti-stat-label">오늘 일진</span><span class="bti-stat-value">${stemChar}${branchChar}</span></div>`;
      h += `<div class="bti-stat"><span class="bti-stat-label">관계</span><span class="bti-stat-value">${info.icon} ${tg}</span></div>`;
      h += `</div></div>`;
    }

    h += `</div>`;

    setInnerHTML(this.container, h);
  }

  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

/**
 * 합충형파해 관계 SVG 렌더러
 */
export class RelationDiagramRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
  }

  render(result, relations, hasTime) {
    if (!this.container) return;

    // 섹션 타이틀 및 카드 래퍼 시작
    let html = '<div class="analysis-card relation-card-new">';
    html += '<h3 class="section-title-spaced">합충형파해</h3>';

    if (!relations || relations.length === 0) {
      html += '<div class="no-relations">원국 내 합충형파해 없음</div></div>';
      setInnerHTML(this.container, html);
      return;
    }

    html += '<div class="relations-diagram-new">';

    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const posLabels = { hour: '시주', day: '일주', month: '월주', year: '년주' };
    const n = positions.length;
    const W = n === 4 ? 560 : 440;
    const H = 300;
    const spacing = (W - 140) / (n - 1);
    const cx = positions.map((_, i) => 70 + i * spacing);

    const colors = UI.COLORS.RELATIONS;
    const ohColors = UI.COLORS.OHENG;

    // 음양 부호
    const eumyangSign = ['양', '음'];
    const stemSign = (si) => eumyangSign[si % 2] === '양' ? '+' : '-';
    const branchEumyang = ['양', '음', '양', '음', '양', '음', '양', '음', '양', '음', '양', '음'];
    const branchSign = (bi) => branchEumyang[bi] === '양' ? '+' : '-';

    // SVG 빌드
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">`;

    // 마커 정의
    svg += '<defs>';
    for (const [cat, c] of Object.entries(colors)) {
      svg += `<marker id="rel-${cat}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><circle cx="4" cy="4" r="3" fill="${c}"/></marker>`;
    }
    svg += '</defs>';

    // 위치 계산 (크게)
    const yLabel = 24;
    const yStemKr = 72, yStemCn = 72, yStemSub = 100;
    const yDiv = 120;
    const yBranchKr = 160, yBranchCn = 160, yBranchSub = 188;

    // 기둥 렌더링
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const si = result.idxs[p] % 10;
      const bi = result.idxs[p] % 12;
      const stemOh = CHEONGAN_OHENG[si];
      const branchOh = JIJI_OHENG[bi];
      const sc = ohColors[stemOh] || '#666';
      const bc = ohColors[branchOh] || '#666';

      // 일주 테두리 (점선 박스)
      if (p === 'day') {
        svg += `<rect x="${cx[i] - 42}" y="${yLabel + 10}" width="84" height="${yBranchSub - yLabel + 10}" rx="8" ry="8" fill="none" stroke="#c9a227" stroke-width="2" stroke-dasharray="5,4"/>`;
      }

      // 위치 레이블
      svg += `<text x="${cx[i]}" y="${yLabel}" text-anchor="middle" font-size="14" fill="#a89878">${posLabels[p]}</text>`;

      // 천간 (한글 + 한자)
      svg += `<text x="${cx[i] - 12}" y="${yStemKr}" text-anchor="middle" font-size="36" font-weight="bold" fill="${sc}">${CHEONGAN[si]}</text>`;
      svg += `<text x="${cx[i] + 26}" y="${yStemCn}" text-anchor="middle" font-size="18" fill="${sc}">${CHEONGAN_HANJA[si]}</text>`;
      svg += `<text x="${cx[i]}" y="${yStemSub}" text-anchor="middle" font-size="13" fill="#888">${stemSign(si)}${stemOh}</text>`;

      // 구분선
      svg += `<line x1="${cx[i] - 38}" y1="${yDiv}" x2="${cx[i] + 38}" y2="${yDiv}" stroke="#e0d8c8" stroke-width="1"/>`;

      // 지지 (한글 + 한자)
      svg += `<text x="${cx[i] - 12}" y="${yBranchKr}" text-anchor="middle" font-size="36" font-weight="bold" fill="${bc}">${JIJI[bi]}</text>`;
      svg += `<text x="${cx[i] + 26}" y="${yBranchCn}" text-anchor="middle" font-size="18" fill="${bc}">${JIJI_HANJA[bi]}</text>`;
      svg += `<text x="${cx[i]}" y="${yBranchSub}" text-anchor="middle" font-size="13" fill="#888">${branchSign(bi)}${branchOh}</text>`;
    }

    // 관계 화살표 렌더링
    const relGroups = this._groupRelations(relations);
    const stemArcs = relGroups.filter(g => g.row === 'stem');
    const branchArcs = relGroups.filter(g => g.row === 'branch');

    svg = this._renderArcs(svg, stemArcs, positions, cx, yStemKr - 28, true, colors);
    svg = this._renderArcs(svg, branchArcs, positions, cx, yBranchSub + 12, false, colors);

    svg += '</svg>';

    // 범례 추가
    const activeCats = [...new Set(relations.map(r => r.cat))];
    let legend = '';
    if (activeCats.length > 0) {
      legend = '<div class="rel-legend-new">';
      for (const c of ['합', '충', '형', '파', '해']) {
        if (activeCats.includes(c)) {
          legend += `<span style="color:${colors[c]}">● ${c}</span>`;
        }
      }
      legend += '</div>';
    }

    html += svg + legend + '</div></div>';
    setInnerHTML(this.container, html);
  }

  _groupRelations(relations) {
    const groups = {};
    for (const rel of relations) {
      const k = `${rel.row}|${rel.p1}|${rel.p2}`;
      if (!groups[k]) {
        groups[k] = { row: rel.row, p1: rel.p1, p2: rel.p2, cats: [], descs: [] };
      }
      if (!groups[k].cats.includes(rel.cat)) {
        groups[k].cats.push(rel.cat);
        groups[k].descs.push(rel.desc);
      }
    }
    return Object.values(groups);
  }

  _renderArcs(svgRef, arcs, positions, cx, baseY, isStem, colors) {
    const catPriority = { 합: 0, 충: 1, 형: 2, 파: 3, 해: 4 };
    arcs.sort((a, b) => {
      const spanA = Math.abs(positions.indexOf(a.p2) - positions.indexOf(a.p1));
      const spanB = Math.abs(positions.indexOf(b.p2) - positions.indexOf(b.p1));
      return spanB - spanA;
    });

    let svg = svgRef;
    arcs.forEach((g, gi) => {
      const i1 = positions.indexOf(g.p1);
      const i2 = positions.indexOf(g.p2);
      if (i1 < 0 || i2 < 0) return;

      const x1 = cx[i1], x2 = cx[i2], midX = (x1 + x2) / 2;
      const span = Math.abs(i2 - i1);
      const topCat = g.cats.sort((a, b) => catPriority[a] - catPriority[b])[0];
      const color = colors[topCat];
      const label = g.cats.join(' · ');
      const offsetStep = 22;
      const baseH = span === 1 ? 30 : 45;

      if (isStem) {
        const peakY = baseY - (baseH + gi * offsetStep);
        // 곡선 아크 + 양쪽 끝 화살표
        svg += `<path d="M${x1 + 30},${baseY} Q${midX},${peakY} ${x2 - 30},${baseY}" stroke="${color}" fill="none" stroke-width="2.5" marker-start="url(#rel-${topCat})" marker-end="url(#rel-${topCat})"/>`;
        svg += `<text x="${midX}" y="${peakY - 8}" text-anchor="middle" font-size="14" font-weight="bold" fill="${color}">${label}</text>`;
      } else {
        const peakY = baseY + (baseH + gi * offsetStep);
        svg += `<path d="M${x1 + 30},${baseY} Q${midX},${peakY} ${x2 - 30},${baseY}" stroke="${color}" fill="none" stroke-width="2.5" marker-start="url(#rel-${topCat})" marker-end="url(#rel-${topCat})"/>`;
        svg += `<text x="${midX}" y="${peakY + 18}" text-anchor="middle" font-size="14" font-weight="bold" fill="${color}">${label}</text>`;
      }
    });

    return svg;
  }
}

/**
 * 사주BTI 렌더러 - 간편한 사주 요약 카드 표시
 */
export class BTIRenderer {
  constructor(container) {
    this.container = typeof container === 'string' ? $id(container) : container;
  }

  render(result, hasTime, ohengData, yongsinData, daeunData, gender) {
    if (!this.container) return;
    if (!result || !result.idxs || !result.pillars) {
      console.warn('[BTIRenderer] Invalid result object');
      return;
    }

    // 대운/성별 저장 (AI 프롬프트용)
    this._daeunData = daeunData;
    this._gender = gender;

    const ilganIdx = result.idxs.day % 10;
    const ilgan = ILGAN_INTERPRETATION[ilganIdx];
    const iljuIdx = result.idxs.day % 60;
    const ilju = ILJU_INTERPRETATION[iljuIdx];

    // 입력 데이터 (없으면 기본값 사용)
    const inp = result.input || {};
    const hour = inp.hour ?? 12;
    const minute = inp.minute ?? 0;
    const ap = hour < 12 ? '오전' : '오후';
    let h12 = hour <= 12 ? hour : hour - 12;
    if (h12 === 0) h12 = 12;

    let dateStr = `${inp.year || ''}년 ${inp.month || ''}월 ${inp.day || ''}일`;
    if (hasTime && inp.hour !== undefined) dateStr += ` ${ap} ${h12}시 ${String(minute).padStart(2, '0')}분`;

    // 오행 통계 계산
    const ohengCount = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const OHENG_MAP_STEM = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
    const OHENG_MAP_BRANCH = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];

    for (const p of positions) {
      const stemIdx = result.idxs[p] % 10;
      const branchIdx = result.idxs[p] % 12;
      ohengCount[OHENG_MAP_STEM[stemIdx]]++;
      ohengCount[OHENG_MAP_BRANCH[branchIdx]]++;
    }

    const total = hasTime ? 8 : 6;
    const ohSorted = Object.entries(ohengCount).sort((a, b) => b[1] - a[1]);
    const maxOh = ohSorted[0];
    const minOh = ohSorted[ohSorted.length - 1];

    // 십성 통계 계산
    const tsCnt = {};
    const stemPos = hasTime ? ['year', 'month', 'hour'] : ['year', 'month'];
    for (const p of stemPos) {
      const s = result.tgStem[p];
      if (s && s !== '일간') tsCnt[s] = (tsCnt[s] || 0) + 1;
    }
    const branchPos = hasTime ? ['year', 'month', 'day', 'hour'] : ['year', 'month', 'day'];
    for (const p of branchPos) {
      const b = result.tgBranch[p];
      if (b) tsCnt[b] = (tsCnt[b] || 0) + 1;
    }
    const tsSorted = Object.entries(tsCnt).sort((a, b) => b[1] - a[1]);
    const topTs = tsSorted.length > 0 ? tsSorted[0] : ['—', 0];
    const topTsInfo = SISUNG_INTERPRETATION[topTs[0]];

    // 발달/부족 오행
    const baldaOh = ohengData ? Object.entries(ohengData).filter(([, v]) => v >= 30).map(([k]) => k) : [];
    const bujokOh = ohengData ? Object.entries(ohengData).filter(([, v]) => v <= 15).map(([k]) => k) : [];

    let html = '<div class="bti-wrap">';

    // 헤더
    html += `<div class="bti-header"><div class="bti-date">${dateStr}</div></div>`;

    // 오행 퍼센트 기반 정렬
    const ohPct = ohengData || {};
    const ohPctSorted = Object.entries(ohPct).sort((a, b) => b[1] - a[1]);
    const strongOh = ohPctSorted.length > 0 ? ohPctSorted[0] : ['—', 0];
    const weakOh = ohPctSorted.length > 0 ? ohPctSorted[ohPctSorted.length - 1] : ['—', 0];

    // 십성 퍼센트 계산 (오행 기반)
    const dayStemIdx = result.idxs.day % 10;
    const dayElement = Math.floor(dayStemIdx / 2);
    const ohengNames = ['목', '화', '토', '금', '수'];
    const 생 = [1, 2, 3, 4, 0];
    const 극 = [2, 3, 4, 0, 1];
    const 역생 = [4, 0, 1, 2, 3];
    const 역극 = [3, 4, 0, 1, 2];

    const tsGroupPct = {
      비겁: ohPct[ohengNames[dayElement]] || 0,
      식상: ohPct[ohengNames[생[dayElement]]] || 0,
      재성: ohPct[ohengNames[극[dayElement]]] || 0,
      관성: ohPct[ohengNames[역극[dayElement]]] || 0,
      인성: ohPct[ohengNames[역생[dayElement]]] || 0
    };
    const tsGroupSorted = Object.entries(tsGroupPct).sort((a, b) => b[1] - a[1]);
    const topTsGroup = tsGroupSorted[0];

    // 사주 한눈에 보기 (가독성 개선)
    html += `<div class="bti-summary bti-summary-enhanced"><div class="bti-section-title">사주 한눈에 보기</div>`;

    // 핵심 정보 카드
    html += `<div class="bti-core-info">`;
    html += `<div class="bti-core-card">
      <div class="bti-core-icon">${ilgan?.emoji || '☯'}</div>
      <div class="bti-core-label">일간</div>
      <div class="bti-core-value">${ilgan?.name || '—'}</div>
      <div class="bti-core-sub">${ilgan?.title || ''}</div>
    </div>`;
    html += `<div class="bti-core-card">
      <div class="bti-core-icon">📜</div>
      <div class="bti-core-label">일주</div>
      <div class="bti-core-value">${result.pillars.day}</div>
    </div>`;
    html += `<div class="bti-core-card">
      <div class="bti-core-icon">📅</div>
      <div class="bti-core-label">월주</div>
      <div class="bti-core-value">${result.pillars.month}</div>
    </div>`;
    html += `</div>`;

    // 오행/십성 현황
    html += `<div class="bti-stat-row">`;
    html += `<div class="bti-stat-box strong"><span class="bti-stat-emoji">💪</span><span class="bti-stat-label">강한 오행</span><span class="bti-stat-value">${strongOh[0]}</span><span class="bti-stat-pct">${Math.round(strongOh[1])}%</span></div>`;
    html += `<div class="bti-stat-box weak"><span class="bti-stat-emoji">📉</span><span class="bti-stat-label">약한 오행</span><span class="bti-stat-value">${weakOh[0]}</span><span class="bti-stat-pct">${Math.round(weakOh[1])}%</span></div>`;
    html += `<div class="bti-stat-box sipsung"><span class="bti-stat-emoji">${topTsInfo?.emoji || '⭐'}</span><span class="bti-stat-label">발달 십성</span><span class="bti-stat-value">${topTsGroup[0]}</span><span class="bti-stat-pct">${Math.round(topTsGroup[1])}%</span></div>`;
    html += `</div>`;

    // 발달/부족 오행 (있는 경우만)
    if (baldaOh.length || bujokOh.length) {
      html += `<div class="bti-oh-status">`;
      if (baldaOh.length) html += `<span class="bti-oh-tag good">발달: ${baldaOh.map(oh => `${oh}(${Math.round(ohPct[oh])}%)`).join(', ')}</span>`;
      if (bujokOh.length) html += `<span class="bti-oh-tag bad">부족: ${bujokOh.map(oh => `${oh}(${Math.round(ohPct[oh])}%)`).join(', ')}</span>`;
      html += `</div>`;
    }

    html += `</div>`;

    // 일간 해석 (원본 상세 버전)
    if (ilgan) {
      html += `<div class="bti-card"><div class="bti-section-title">일간 특징</div>`;
      html += `<div class="bti-card-header"><span class="bti-card-emoji">${ilgan.emoji}</span><div>`;
      html += `<div class="bti-card-name">${ilgan.name}</div>`;
      html += `<div class="bti-card-sub">${ilgan.title}</div>`;
      html += `</div></div>`;

      // 상세 성격 설명
      if (ilgan.personality) {
        html += `<p class="bti-card-desc">${ilgan.personality}</p>`;
      }

      // 강점/약점/직업/관계 상세 그리드
      html += `<div class="bti-detail-grid">`;
      if (ilgan.strength) {
        html += `<div class="bti-detail-item"><span class="bti-detail-label">강점</span><span class="bti-detail-value" style="color:#2d8a4e">${ilgan.strength}</span></div>`;
      }
      if (ilgan.weakness) {
        html += `<div class="bti-detail-item"><span class="bti-detail-label">약점</span><span class="bti-detail-value" style="color:#c0392b">${ilgan.weakness}</span></div>`;
      }
      if (ilgan.career) {
        html += `<div class="bti-detail-item"><span class="bti-detail-label">적합 직업</span><span class="bti-detail-value">${ilgan.career}</span></div>`;
      }
      if (ilgan.relation) {
        html += `<div class="bti-detail-item"><span class="bti-detail-label">대인관계</span><span class="bti-detail-value">${ilgan.relation}</span></div>`;
      }
      html += `</div></div>`;
    }

    // 일주 해석
    if (ilju) {
      const stemOh = OHENG_MAP_STEM[result.idxs.day % 10];
      const branchOh = OHENG_MAP_BRANCH[result.idxs.day % 12];
      html += `<div class="bti-card"><div class="bti-section-title">일주 특징</div>`;
      html += `<div class="bti-card-header"><span class="bti-card-emoji">📜</span><div>`;
      html += `<div class="bti-card-name">${ilju.n} 일주</div>`;
      html += `<div class="bti-card-sub">${ilju.t} · ${stemOh}+${branchOh}</div>`;
      html += `</div></div>`;
      html += `<p class="bti-card-desc">${ilju.d}</p></div>`;
    }

    // 발달 십성 해석 (퍼센트 기반)
    const topGroupName = topTsGroup[0];
    const topGroupPct = Math.round(topTsGroup[1]);
    const topGroupInfo = {
      비겁: { emoji: '🤝', title: '자아와 경쟁의 에너지', desc: '독립심이 강하고 주체성이 뚜렷합니다. 자기 주장이 명확하고 경쟁에서 물러서지 않습니다.' },
      식상: { emoji: '💡', title: '표현과 창의의 에너지', desc: '창의력이 풍부하고 표현력이 뛰어납니다. 예술적 감각과 언변이 좋습니다.' },
      재성: { emoji: '💰', title: '현실과 재물의 에너지', desc: '현실감각이 뛰어나고 재물 운용 능력이 좋습니다. 실용적이고 경제관념이 확실합니다.' },
      관성: { emoji: '👔', title: '규율과 책임의 에너지', desc: '책임감이 강하고 사회적 규범을 중시합니다. 리더십과 조직력이 있습니다.' },
      인성: { emoji: '📚', title: '학습과 지혜의 에너지', desc: '학습능력이 뛰어나고 지적 호기심이 강합니다. 사고력이 깊고 분석적입니다.' }
    };
    const groupInfo = topGroupInfo[topGroupName] || topGroupInfo['비겁'];

    if (topGroupPct > 0) {
      html += `<div class="bti-card"><div class="bti-section-title">발달 십성</div>`;
      html += `<div class="bti-card-header"><span class="bti-card-emoji">${groupInfo.emoji}</span><div>`;
      html += `<div class="bti-card-name">${topGroupName} (${topGroupPct}%)</div>`;
      html += `<div class="bti-card-sub">${groupInfo.title}</div>`;
      html += `</div></div>`;
      html += `<p class="bti-card-desc">${groupInfo.desc}</p>`;

      // 두 번째 발달 십성 그룹
      if (tsGroupSorted.length > 1 && tsGroupSorted[1][1] >= 15) {
        const ts2Name = tsGroupSorted[1][0];
        const ts2Pct = Math.round(tsGroupSorted[1][1]);
        const ts2Info = topGroupInfo[ts2Name];
        if (ts2Info) {
          html += `<div class="bti-divider"></div>`;
          html += `<div class="bti-card-header"><span class="bti-card-emoji">${ts2Info.emoji}</span><div>`;
          html += `<div class="bti-card-name">${ts2Name} (${ts2Pct}%)</div>`;
          html += `<div class="bti-card-sub">${ts2Info.title}</div>`;
          html += `</div></div>`;
          html += `<p class="bti-card-desc">${ts2Info.desc}</p>`;
        }
      }
      html += `</div>`;
    }

    // 용신 정보 (있는 경우)
    if (yongsinData) {
      html += `<div class="bti-card"><div class="bti-section-title">용신 분석</div>`;
      html += `<div class="bti-summary-grid">`;
      html += `<div class="bti-stat"><span class="bti-stat-label">억부용신</span><span class="bti-stat-value" style="color:${UI.COLORS.OHENG[yongsinData.용신]}">${yongsinData.용신}</span></div>`;
      html += `<div class="bti-stat"><span class="bti-stat-label">통관용신</span><span class="bti-stat-value" style="color:${yongsinData.통관 ? UI.COLORS.OHENG[yongsinData.통관] : 'var(--text-dim)'}">${yongsinData.통관 || '없음'}</span></div>`;
      html += `</div></div>`;
    }

    // AI에게 물어보기 섹션
    html += `<div class="bti-card bti-card-ai"><div class="bti-section-title">🤖 AI에게 물어보기</div>`;
    html += `<p class="bti-ai-desc">아래 사주 정보를 ChatGPT, Claude 등 AI에게 전달하면 더 심층적인 해석을 받을 수 있습니다.</p>`;
    html += `<div class="bti-ai-actions"><button class="bti-ai-copy" onclick="window.__copyChatGPT && window.__copyChatGPT(this)">📋 복사하기</button></div>`;
    html += `<div class="bti-ai-data">`;
    html += `<textarea id="chatgpt-prompt" readonly rows="16">로딩 중...</textarea>`;
    html += `</div></div>`;

    // 공유 섹션
    html += `<div class="bti-share-card">`;
    html += `<div class="bti-share-title">📤 결과 공유하기</div>`;
    html += `<div class="bti-share-buttons">`;
    html += `<button class="bti-share-btn bti-share-kakao" onclick="window.__shareKakao && window.__shareKakao()"><span class="bti-share-icon">💬</span><span>카카오톡</span></button>`;
    html += `<button class="bti-share-btn bti-share-twitter" onclick="window.__shareTwitter && window.__shareTwitter()"><span class="bti-share-icon">𝕏</span><span>트위터</span></button>`;
    html += `<button class="bti-share-btn bti-share-link" onclick="window.__shareLink && window.__shareLink(this)"><span class="bti-share-icon">🔗</span><span>링크복사</span></button>`;
    html += `</div></div>`;

    html += `</div>`; // close bti-wrap

    setInnerHTML(this.container, html);

    // ChatGPT 프롬프트 생성 및 설정
    setTimeout(() => {
      const promptEl = document.getElementById('chatgpt-prompt');
      if (promptEl) {
        const prompt = generateChatGPTText(result, hasTime, ohengData, yongsinData, this._gender, this._daeunData);
        promptEl.value = prompt;

        // 전역 복사 함수 등록
        window.__copyChatGPT = (btn) => {
          navigator.clipboard.writeText(prompt).then(() => {
            btn.textContent = '✓ 복사됨';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = '📋 프롬프트 복사';
              btn.classList.remove('copied');
            }, 2000);
          }).catch(() => alert('복사 실패'));
        };
      }

      // 공유 기능 등록
      const shareTitle = '연세사주 - 나의 사주 결과';
      const shareDesc = ilgan ? `${ilgan.emoji} ${ilgan.name} - ${ilgan.title}` : '사주 분석 결과를 확인해보세요!';
      const shareUrl = window.location.href;

      // 카카오톡 공유
      window.__shareKakao = () => {
        // Kakao SDK가 로드되어 있으면 사용
        if (window.Kakao && window.Kakao.Share) {
          try {
            window.Kakao.Share.sendDefault({
              objectType: 'feed',
              content: {
                title: shareTitle,
                description: shareDesc,
                imageUrl: window.location.origin + '/img/og-image.png',
                link: { mobileWebUrl: shareUrl, webUrl: shareUrl }
              },
              buttons: [
                { title: '나도 사주 보기', link: { mobileWebUrl: shareUrl, webUrl: shareUrl } }
              ]
            });
          } catch (e) {
            console.warn('Kakao share failed:', e);
            // Fallback: 카카오톡 웹 공유 URL
            const kakaoUrl = `https://story.kakao.com/share?url=${encodeURIComponent(shareUrl)}`;
            window.open(kakaoUrl, '_blank', 'width=600,height=400');
          }
        } else {
          // Kakao SDK 없으면 카카오스토리로 대체
          const kakaoUrl = `https://story.kakao.com/share?url=${encodeURIComponent(shareUrl)}`;
          window.open(kakaoUrl, '_blank', 'width=600,height=400');
        }
      };

      // 트위터(X) 공유
      window.__shareTwitter = () => {
        const text = `${shareTitle}\n${shareDesc}`;
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
        window.open(twitterUrl, '_blank', 'width=600,height=400');
      };

      // 링크 복사
      window.__shareLink = (btn) => {
        navigator.clipboard.writeText(shareUrl).then(() => {
          const originalText = btn.innerHTML;
          btn.innerHTML = '✓ 복사됨!';
          btn.style.background = '#2d8a4e';
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
          }, 2000);
        }).catch(() => {
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = shareUrl;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          document.body.appendChild(textArea);
          textArea.select();
          try {
            document.execCommand('copy');
            const originalText = btn.innerHTML;
            btn.innerHTML = '✓ 복사됨!';
            btn.style.background = '#2d8a4e';
            setTimeout(() => {
              btn.innerHTML = originalText;
              btn.style.background = '';
            }, 2000);
          } catch (e) {
            alert('링크 복사에 실패했습니다.');
          }
          document.body.removeChild(textArea);
        });
      };
    }, 0);
  }

  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

/**
 * ChatGPT 프롬프트 텍스트 생성 (상세 버전)
 */
export function generateChatGPTText(result, hasTime, ohengData, yongsinData, gender, daeunData, relationsData) {
  if (!result || !result.idxs) return '';

  const dsi = result.idxs.day % 10;
  const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
  const posK = { hour: '시', day: '일', month: '월', year: '년' };
  const L = [];

  // 생년월일시 정보
  L.push('[생년월일시]');
  const inp = result.input || {};
  L.push(`양력: ${inp.year}년 ${inp.month}월 ${inp.day}일 ${hasTime ? `${inp.hour}시 ${inp.minute || 0}분` : '시간 미상'}`);
  if (gender) L.push(`성별: ${gender === 'm' ? '남성' : gender === 'f' ? '여성' : '미지정'}`);

  // 사주 4주
  L.push('');
  L.push('[사주명식 | 4주]');
  for (const p of positions) {
    const s = result.pillars[p][0], b = result.pillars[p][1];
    const si = CHEONGAN.indexOf(s), bi = JIJI.indexOf(b);
    L.push(`${posK[p]}주: ${s}${CHEONGAN_HANJA[si]}${b}${JIJI_HANJA[bi]}`);
  }

  // 간지 상세
  L.push('');
  L.push('[간지 상세 | 음양/오행/십성/십이운성]');
  for (const p of positions) {
    const si = result.idxs[p] % 10, bi = result.idxs[p] % 12;
    const sYY = CHEONGAN_EUMYANG[si], sOH = CHEONGAN_OHENG[si];
    const bYY = JIJI_EUMYANG[bi], bOH = JIJI_OHENG[bi];
    const tsMain = result.ts[p];
    if (p === 'day') {
      L.push(`일간(${CHEONGAN[si]}${CHEONGAN_HANJA[si]}): ${sYY} | ${sOH}`);
      L.push(`일지(${JIJI[bi]}${JIJI_HANJA[bi]}): ${bYY} | ${bOH} | ${result.tgBranch[p]} | ${tsMain}`);
    } else {
      L.push(`${posK[p]}간(${CHEONGAN[si]}${CHEONGAN_HANJA[si]}): ${sYY} | ${sOH} | ${result.tgStem[p]}`);
      L.push(`${posK[p]}지(${JIJI[bi]}${JIJI_HANJA[bi]}): ${bYY} | ${bOH} | ${result.tgBranch[p]} | ${tsMain}`);
    }
  }

  // 십성 분포
  L.push('');
  L.push('[십성 분포]');
  const tsCnt = {};
  const stemPos = hasTime ? ['year', 'month', 'hour'] : ['year', 'month'];
  for (const p of stemPos) {
    const s = result.tgStem[p];
    if (s && s !== '일간' && s !== '?') tsCnt[s] = (tsCnt[s] || 0) + 1;
  }
  const branchPos = hasTime ? ['year', 'month', 'day', 'hour'] : ['year', 'month', 'day'];
  for (const p of branchPos) {
    const b = result.tgBranch[p];
    if (b && b !== '?') tsCnt[b] = (tsCnt[b] || 0) + 1;
  }
  const tsNames = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
  L.push(tsNames.map(t => `${t}:${tsCnt[t] || 0}`).join(' | '));

  // 십이운성 분포
  L.push('');
  L.push('[십이운성]');
  for (const p of positions) {
    L.push(`${posK[p]}주: ${result.ts[p]}`);
  }

  // 지장간
  L.push('');
  L.push('[지장간 | 지지 속 천간]');
  const allStems = positions.map(p => result.idxs[p] % 10);
  for (const p of positions) {
    const bi = result.idxs[p] % 12;
    L.push(`${posK[p]}지(${JIJI[bi]}${JIJI_HANJA[bi]}) 지장간:`);
    for (const h of result.hiddenStems[p]) {
      const hsi = CHEONGAN.indexOf(h.stem);
      const 투출 = allStems.includes(hsi) ? 'Y' : 'N';
      L.push(`  * ${h.type}: ${h.stem}${CHEONGAN_HANJA[hsi]} | ${h.element} | ${h.tenGod} | 투출(${투출})`);
    }
  }

  // 오행 분포
  if (ohengData) {
    L.push('');
    L.push('[오행 분포 (%)]');
    const pct = ohengData.percent || ohengData;
    L.push(`목: ${Math.round(pct.목 || 0)}% | 화: ${Math.round(pct.화 || 0)}% | 토: ${Math.round(pct.토 || 0)}% | 금: ${Math.round(pct.금 || 0)}% | 수: ${Math.round(pct.수 || 0)}%`);
  }

  // 용신
  if (yongsinData) {
    L.push('');
    L.push('[용신 분석]');
    L.push(`억부용신: ${yongsinData.용신 || '—'} (${yongsinData.용신설명 || ''})`);
    if (yongsinData.통관) {
      L.push(`통관용신: ${yongsinData.통관} (${yongsinData.통관설명})`);
    }
    if (yongsinData.oheng) {
      const ohengStr = Object.entries(yongsinData.oheng).map(([k, v]) => `${k}:${v}%`).join(' ');
      L.push(`오행분포: ${ohengStr}`);
    }
  }

  // 합충형파해 관계
  L.push('');
  L.push('[합충형파해 관계]');
  try {
    const rels = RelationAnalyzer.analyze(result, hasTime);
    if (rels && rels.length > 0) {
      for (const r of rels) {
        L.push(`${r.type}: ${r.from} ↔ ${r.to} (${r.detail || ''})`);
      }
    } else {
      L.push('특별한 합충 관계 없음');
    }
  } catch (e) {
    L.push('관계 분석 오류');
  }

  // 대운 정보
  if (daeunData && daeunData.list) {
    L.push('');
    L.push('[대운]');
    L.push(`방향: ${daeunData.forward ? '순행' : '역행'}`);
    L.push(`시작: ${daeunData.startAge}세 ${daeunData.startMonth}월`);
    L.push('대운 목록:');
    const currentYear = new Date().getFullYear();
    for (const d of daeunData.list.slice(0, 8)) {
      const isCurrent = currentYear >= d.calYear && currentYear < d.calYear + 10;
      L.push(`  ${d.age}세~${d.age + 9}세 (${d.calYear}~${d.calYear + 9}): ${d.pillar} | ${d.tgStem} | ${d.ts}${isCurrent ? ' ★현재' : ''}`);
    }
  }

  // 세운 정보 (올해)
  const thisYear = new Date().getFullYear();
  L.push('');
  L.push(`[${thisYear}년 세운]`);
  const yearStemIdx = (thisYear - 4) % 10;
  const yearBranchIdx = (thisYear - 4) % 12;
  const yearStem = CHEONGAN[yearStemIdx];
  const yearBranch = JIJI[yearBranchIdx];
  const yearTgStem = getTenGod(dsi, yearStemIdx);
  L.push(`${thisYear}년: ${yearStem}${CHEONGAN_HANJA[yearStemIdx]}${yearBranch}${JIJI_HANJA[yearBranchIdx]} | 십성: ${yearTgStem}`);

  // 한 줄 요약
  L.push('');
  L.push('[요약]');
  L.push(`일간: ${CHEONGAN[dsi]}(${CHEONGAN_HANJA[dsi]}) ${CHEONGAN_OHENG[dsi]} ${CHEONGAN_EUMYANG[dsi]}`);
  if (yongsinData) {
    let summary = `억부용신: ${yongsinData.용신 || '—'}`;
    if (yongsinData.통관) summary += `, 통관용신: ${yongsinData.통관}`;
    L.push(summary);
  }

  return L.join('\n');
}

/**
 * ChatGPT 프롬프트 복사
 */
export function copyChatGPTPrompt(text, buttonElement) {
  navigator.clipboard.writeText(text).then(() => {
    if (buttonElement) {
      const originalText = buttonElement.textContent;
      buttonElement.textContent = '복사 완료!';
      buttonElement.classList.add('copied');
      setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.classList.remove('copied');
      }, 2000);
    }
  }).catch(err => {
    console.error('복사 실패:', err);
    alert('클립보드 복사에 실패했습니다.');
  });
}
/**
 * 푸터 렌더러 - 저작권 및 연락처 정보
 */
export class FooterRenderer {
  static render() {
    const footerEl = document.getElementById('app-footer');
    if (!footerEl) return;

    const html = `
      <div class="footer-content">
        <div class="footer-info">
          <span>대표 반우석</span>
          <span class="footer-divider">|</span>
          <a href="tel:010-4729-8645">010-4729-8645</a>
          <span class="footer-divider">|</span>
          <a href="mailto:aksd374@yonsei.ac.kr">aksd374@yonsei.ac.kr</a>
          <span class="footer-divider">|</span>
          <a href="#" onclick="openLegalModal('terms'); return false;">이용약관</a>
          <span class="footer-divider">|</span>
          <a href="#" onclick="openLegalModal('privacy'); return false;">개인정보처리방침</a>
        </div>
        <div class="footer-social">
          <a href="https://www.instagram.com/saju_yonsei/" class="social-link" title="Instagram" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
          </a>
          <a href="https://x.com/saju_yonsei" class="social-link" title="X (Twitter)" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <a href="#" class="social-link naver" title="Naver Blog">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z"/></svg>
          </a>
        </div>
        <div class="footer-copyright">
          © 2026 연세사주. All rights reserved.
        </div>
      </div>
    `;

    setInnerHTML(footerEl, html);
  }
}

/**
 * 사이드바 렌더러 - 지금의 사주, 지금의 기운, 오늘의 운세
 */
export class SidebarRenderer {
  constructor() {
    this.containers = {
      todaySaju: $id('sidebar-today-saju'),
      todaySajuContent: $id('sidebar-today-saju-content'),
      todayEnergy: $id('sidebar-today-energy'),
      todayEnergyContent: $id('sidebar-today-energy-content'),
      todayFortune: $id('sidebar-today-fortune'),
      todayFortuneContent: $id('sidebar-today-fortune-content')
    };

    // 지금의 사주/기운은 항상 표시
    this._renderTodaySaju();
    this._renderTodayEnergy();

    // 1분마다 갱신
    setInterval(() => {
      this._renderTodaySaju();
      this._renderTodayEnergy();
    }, 60000);
  }

  /**
   * 전체 사이드바 렌더링 (계산 결과 있을 때)
   */
  render(result, hasTime, ohengData, yongsinData) {
    if (!result) {
      this.hide();
      return;
    }

    // 오늘의 운세 렌더링
    this._renderTodayFortune(result);
  }

  /**
   * 지금의 사주 렌더링 (년/월/일/시 4주 표시)
   */
  _renderTodaySaju() {
    const { todaySajuContent, todaySaju } = this.containers;
    if (!todaySajuContent || !todaySaju) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 현재 시간의 사주 계산
    let result;
    try {
      result = SajuCalculator.calculate(year, month, day, hour, minute);
    } catch (e) {
      // 폴백: 일간지만 표시
      const today = getTodayGanji();
      const stem = CHEONGAN[today.stemIdx];
      const stemHanja = CHEONGAN_HANJA[today.stemIdx];
      const branch = JIJI[today.branchIdx];
      const branchHanja = JIJI_HANJA[today.branchIdx];
      setInnerHTML(todaySajuContent, `<div class="sb-today-ganji"><span class="sb-ganji-char">${stem}${stemHanja}${branch}${branchHanja}</span></div>`);
      return;
    }

    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[now.getDay()];
    const ap = hour < 12 ? '오전' : '오후';
    const h12 = hour <= 12 ? hour : hour - 12;
    const dateStr = `${year}년 ${month}월 ${day}일 (${weekday}) ${ap} ${h12}시`;

    const colors = UI.COLORS.OHENG;
    const pillars = [
      { label: '시주', idx: result.idxs.hour },
      { label: '일주', idx: result.idxs.day },
      { label: '월주', idx: result.idxs.month },
      { label: '년주', idx: result.idxs.year }
    ];

    let html = `<div class="sb-today-date">${dateStr}</div>`;
    html += '<div class="sb-saju-grid">';

    for (const p of pillars) {
      const si = p.idx % 10;
      const bi = p.idx % 12;
      const stemOh = CHEONGAN_OHENG[si];
      const branchOh = JIJI_OHENG[bi];

      html += `
        <div class="sb-saju-pillar">
          <div class="sb-saju-label">${p.label}</div>
          <div class="sb-saju-stem" style="color:${colors[stemOh]}">${CHEONGAN[si]}${CHEONGAN_HANJA[si]}</div>
          <div class="sb-saju-branch" style="color:${colors[branchOh]}">${JIJI[bi]}${JIJI_HANJA[bi]}</div>
          <div class="sb-saju-info">${stemOh}/${branchOh}</div>
        </div>
      `;
    }

    html += '</div>';
    setInnerHTML(todaySajuContent, html);
  }

  /**
   * 지금의 기운 렌더링
   */
  _renderTodayEnergy() {
    const { todayEnergyContent, todayEnergy } = this.containers;
    if (!todayEnergyContent || !todayEnergy) return;

    // 현재 시간 기준 간지 계산
    const now = new Date();
    let stemIdx, branchIdx;
    try {
      const result = SajuCalculator.calculate(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
      stemIdx = result.idxs.hour % 10;
      branchIdx = result.idxs.hour % 12;
    } catch (e) {
      const today = getTodayGanji();
      stemIdx = today.stemIdx;
      branchIdx = today.branchIdx;
    }

    const stemOheng = CHEONGAN_OHENG[stemIdx];
    const branchOheng = JIJI_OHENG[branchIdx];

    // 오행별 기운 메시지
    const ohengMessages = {
      목: { icon: '🌳', msg: '성장과 시작의 기운', tip: '새로운 일을 시작하기 좋은 때' },
      화: { icon: '🔥', msg: '열정과 활력의 기운', tip: '적극적인 활동에 좋은 때' },
      토: { icon: '🏔️', msg: '안정과 균형의 기운', tip: '차분하게 정리하기 좋은 때' },
      금: { icon: '⚔️', msg: '결단과 실행의 기운', tip: '중요한 결정을 내리기 좋은 때' },
      수: { icon: '💧', msg: '지혜와 소통의 기운', tip: '공부와 대화에 좋은 때' }
    };

    const mainOheng = stemOheng;
    const info = ohengMessages[mainOheng] || ohengMessages['토'];

    let html = `
      <div class="sb-energy-main">
        <span class="sb-energy-icon">${info.icon}</span>
        <span class="sb-energy-text">${info.msg}</span>
      </div>
      <div class="sb-energy-tip">${info.tip}</div>
      <div class="sb-energy-oheng">
        <span>주 기운: ${mainOheng}</span>
        <span>보조 기운: ${branchOheng}</span>
      </div>
    `;

    setInnerHTML(todayEnergyContent, html);
  }

  /**
   * 오늘의 운세 렌더링 (사주 계산 후)
   */
  _renderTodayFortune(result) {
    const { todayFortuneContent, todayFortune } = this.containers;
    if (!todayFortuneContent || !todayFortune) return;

    const today = getTodayGanji();
    const dayStemIdx = result.idxs.day % 10;
    const todayStemIdx = today.stemIdx;

    // 오늘 천간과 일간의 십성 관계
    const tg = getTenGod(dayStemIdx, todayStemIdx);

    const fortuneInfo = {
      비견: { icon: '🤝', title: '동료운', desc: '협력과 경쟁이 공존하는 날', luck: 60 },
      겁재: { icon: '⚔️', title: '경쟁운', desc: '자신감이 높아지지만 충동에 주의', luck: 50 },
      식신: { icon: '🍀', title: '행복운', desc: '여유롭고 창의력이 넘치는 날', luck: 80 },
      상관: { icon: '💡', title: '표현운', desc: '감정 표현이 활발한 날', luck: 65 },
      편재: { icon: '💰', title: '재물운', desc: '투자와 거래에 유리한 날', luck: 75 },
      정재: { icon: '🏦', title: '안정운', desc: '꾸준한 수입이 기대되는 날', luck: 70 },
      편관: { icon: '⚡', title: '변화운', desc: '급변하는 상황에 대처하는 날', luck: 55 },
      정관: { icon: '🏛️', title: '성취운', desc: '목표 달성과 인정받는 날', luck: 85 },
      편인: { icon: '📚', title: '학습운', desc: '새로운 것을 배우기 좋은 날', luck: 70 },
      정인: { icon: '🙏', title: '지원운', desc: '도움을 받거나 주는 날', luck: 75 }
    };

    const info = fortuneInfo[tg] || fortuneInfo['비견'];
    const luckColor = info.luck >= 70 ? '#2d8a4e' : info.luck >= 50 ? '#c9a55a' : '#c75a5a';

    let html = `
      <div class="sb-fortune-badge">${info.icon} ${tg}</div>
      <div class="sb-fortune-title">${info.title}</div>
      <div class="sb-fortune-desc">${info.desc}</div>
      <div class="sb-fortune-luck">
        <div class="sb-luck-bar-bg">
          <div class="sb-luck-bar-fill" style="width:${info.luck}%;background:${luckColor}"></div>
        </div>
        <span class="sb-luck-score" style="color:${luckColor}">${info.luck}점</span>
      </div>
    `;

    setInnerHTML(todayFortuneContent, html);
    todayFortune.style.display = '';
  }

  /**
   * 사이드바 숨기기
   */
  hide() {
    const { todayFortune } = this.containers;
    if (todayFortune) todayFortune.style.display = 'none';
  }
}

export default {
  getOhengClass,
  getTodayGanji,
  getTenGod,
  PillarRenderer,
  OhengRenderer,
  SipsungRenderer,
  HiddenStemsRenderer,
  FortuneCardRenderer,
  YongsinRenderer,
  TodayFortuneRenderer,
  RelationDiagramRenderer,
  BTIRenderer,
  FooterRenderer,
  SidebarRenderer,
  generateChatGPTText,
  copyChatGPTPrompt
};
