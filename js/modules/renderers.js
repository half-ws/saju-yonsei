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

    // 선택된 인물 이름/직업 표시 (result 객체에서 직접 읽기)
    const _pName = result.personName || '';
    const _pNote = result.personNote || '';
    const personInfoHtml = _pName
      ? '<div class="person-info-label"><span class="person-name-label">' + escapeHtml(_pName) + '</span>' + (_pNote ? '<span class="person-note-label">' + escapeHtml(_pNote) + '</span>' : '') + '</div>'
      : '';

    let html = `<div class="info-bar">
      ${personInfoHtml}
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

    let html = `<div class="section-title">월운 · ${year}년 (${koreanAge}세) <span style="font-size:0.7rem;color:var(--text-dim);font-weight:400;letter-spacing:0">▲ 세운을 클릭하면 해당 연도가 표시됩니다 · 월운을 클릭하면 일일 만세력이 표시됩니다</span></div><div class="fortune-scroll" id="wolun-scroll">`;

    for (let i = 0; i < wolunList.length; i++) {
      const w = wolunList[i];
      const termStr = w.termDt ? `${w.termDt.getMonth() + 1}/${w.termDt.getDate()}` : '';
      html += this._cardHTML(w.pillar, w.termName, termStr, w.isCurrent, w.tgStem, w.tgBranch, w.ts, {
        onclick: `window.__selectWolun && window.__selectWolun(${i})`,
        clickable: true,
        data: `data-wolun-idx="${i}"`
      });
    }
    html += `</div><div id="daily-fortune-container"></div>`;

    setInnerHTML(container, html);

    // 월운 클릭 → 일일 만세력
    window.__selectWolun = (idx) => {
      const cards = container.querySelectorAll('#wolun-scroll .fortune-card');
      cards.forEach((c, i) => c.classList.toggle('selected', i === idx));

      const w = wolunList[idx];
      const dailyContainer = document.getElementById('daily-fortune-container');
      if (!dailyContainer || !w) return;

      // 해당 월의 시작일~말일 계산
      const termDt = w.termDt;
      let startDate, endDate;
      if (termDt) {
        startDate = new Date(termDt);
        // 다음 월운 절기일 또는 해당월 말일
        if (idx + 1 < wolunList.length && wolunList[idx + 1].termDt) {
          endDate = new Date(wolunList[idx + 1].termDt);
          endDate.setDate(endDate.getDate() - 1);
        } else {
          endDate = new Date(termDt.getFullYear(), termDt.getMonth() + 1, 0);
        }
      } else {
        // 절기 정보 없으면 해당 월 기준
        const m = idx + 1;
        startDate = new Date(year, m - 1, 1);
        endDate = new Date(year, m, 0);
      }

      // 60갑자 일진 계산 (기준: 2000.1.1 = 갑진일, idx=40)
      const REF_DATE = new Date(2000, 0, 1);
      const REF_IDX = 40;
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

      let dHtml = `<div class="daily-fortune-section">
        <div class="section-title" style="font-size:0.9rem;margin:12px 0 8px">일일 만세력 · ${w.termName} (${startDate.getMonth()+1}/${startDate.getDate()} ~ ${endDate.getMonth()+1}/${endDate.getDate()})</div>
        <div class="daily-fortune-grid">`;

      // 요일 헤더
      for (const d of dayNames) {
        dHtml += `<div class="daily-fortune-header">${d}</div>`;
      }

      // 시작일 앞 빈칸
      const startDay = startDate.getDay();
      for (let i = 0; i < startDay; i++) {
        dHtml += `<div class="daily-fortune-cell empty"></div>`;
      }

      // 날짜별 일진
      const today = new Date();
      const cur = new Date(startDate);
      while (cur <= endDate) {
        const diffDays = Math.round((cur - REF_DATE) / 86400000);
        const dayIdx = ((REF_IDX + diffDays) % 60 + 60) % 60;
        const ganji = YUKSHIP_GAPJA[dayIdx];
        const isToday = cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth() && cur.getDate() === today.getDate();
        const stemIdx = dayIdx % 10;
        const branchIdx = dayIdx % 12;
        const stemClass = getOhengClass(CHEONGAN_OHENG[stemIdx]);
        const branchClass = getOhengClass(JIJI_OHENG[branchIdx]);

        dHtml += `<div class="daily-fortune-cell${isToday ? ' today' : ''}">
          <div class="daily-date">${cur.getDate()}</div>
          <div class="daily-ganji"><span class="${stemClass}">${ganji[0]}</span><span class="${branchClass}">${ganji[1]}</span></div>
        </div>`;
        cur.setDate(cur.getDate() + 1);
      }

      dHtml += `</div></div>`;
      dailyContainer.innerHTML = dHtml;
    };

    // 현재 월운 자동 선택 (일일 만세력 바로 표시)
    const currentIdx = wolunList.findIndex(w => w.isCurrent);
    if (currentIdx >= 0) {
      setTimeout(() => window.__selectWolun(currentIdx), 0);
    }
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

    let allNotes = [];

    for (const fp of fpList) {
      const fSi = fp.idx % 10, fBi = fp.idx % 12;

      for (const p of poss) {
        const si = originalResult.idxs[p] % 10;
        const bi = originalResult.idxs[p] % 12;

        // 천간 검사
        const stemRels = RelationAnalyzer.checkStemPair(fSi, si);
        for (const rel of stemRels) {
          const tag = rel.type;
          const arrow = rel.result ? `→${rel.result}` : '';
          allNotes.push({ color: relColors[tag], text: `${fp.name} ${CHEONGAN[fSi]}↔${posK[p]}간 ${CHEONGAN[si]} ${tag}${arrow}` });
        }

        // 지지 검사
        const branchRels = RelationAnalyzer.checkBranchPair(fBi, bi);
        for (const rel of branchRels) {
          const arrow = rel.result ? `→${rel.result}` : '';
          allNotes.push({ color: relColors[rel.type], text: `${fp.name} ${JIJI[fBi]}↔${posK[p]}지 ${JIJI[bi]} ${rel.type}${arrow}` });
        }
      }

      // 대운 ↔ 세운 관계도 체크
      if (fpList.length === 2 && fp === fpList[1]) {
        const f0 = fpList[0];
        const stemRels = RelationAnalyzer.checkStemPair(f0.idx % 10, fp.idx % 10);
        for (const rel of stemRels) {
          const arrow = rel.result ? `→${rel.result}` : '';
          allNotes.push({ color: relColors[rel.type], text: `대운 ${CHEONGAN[f0.idx % 10]}↔세운 ${CHEONGAN[fSi]} ${rel.type}${arrow}` });
        }
        const branchRels = RelationAnalyzer.checkBranchPair(f0.idx % 12, fp.idx % 12);
        for (const rel of branchRels) {
          const arrow = rel.result ? `→${rel.result}` : '';
          allNotes.push({ color: relColors[rel.type], text: `대운 ${JIJI[f0.idx % 12]}↔세운 ${JIJI[fBi]} ${rel.type}${arrow}` });
        }
      }
    }

    let html = `<div class="fortune-interaction-log">`;
    if (allNotes.length) {
      html += `<span class="fi-log-label">합충:</span>`;
      html += allNotes.map(n => `<span class="fi-log-item" style="color:${n.color}">${n.text}</span>`).join('');
    } else {
      html += `<span class="fi-log-empty">합충 없음</span>`;
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

    const positions = ['hour', 'day', 'month', 'year'];
    const posLabels = { hour: '시주', day: '일주', month: '월주', year: '년주' };
    const n = positions.length;
    const W = 560;
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

      // 시주 미상일 때 빈 칸 표시
      if (p === 'hour' && !hasTime) {
        svg += `<text x="${cx[i]}" y="${yLabel}" text-anchor="middle" font-size="14" fill="#999">${posLabels[p]}</text>`;
        svg += `<text x="${cx[i]}" y="${yDiv}" text-anchor="middle" font-size="15" fill="#ccc">미상</text>`;
        continue;
      }

      const si = result.idxs[p] % 10;
      const bi = result.idxs[p] % 12;
      const stemOh = CHEONGAN_OHENG[si];
      const branchOh = JIJI_OHENG[bi];
      const sc = ohColors[stemOh] || '#666';
      const bc = ohColors[branchOh] || '#666';

      // 위치 레이블
      svg += `<text x="${cx[i]}" y="${yLabel}" text-anchor="middle" font-size="14" fill="#999">${posLabels[p]}</text>`;

      // 천간 (한글 + 한자)
      svg += `<text x="${cx[i] - 12}" y="${yStemKr}" text-anchor="middle" font-size="36" font-weight="bold" fill="${sc}">${CHEONGAN[si]}</text>`;
      svg += `<text x="${cx[i] + 26}" y="${yStemCn}" text-anchor="middle" font-size="18" fill="${sc}">${CHEONGAN_HANJA[si]}</text>`;
      svg += `<text x="${cx[i]}" y="${yStemSub}" text-anchor="middle" font-size="13" fill="#888">${stemSign(si)}${stemOh}</text>`;

      // 구분선
      svg += `<line x1="${cx[i] - 38}" y1="${yDiv}" x2="${cx[i] + 38}" y2="${yDiv}" stroke="#d0d0d0" stroke-width="1"/>`;

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
    const iljuName = YUKSHIP_GAPJA[iljuIdx];
    const ilju = ILJU_INTERPRETATION[iljuName];

    // 입력 데이터 (없으면 기본값 사용)
    const inp = result.input || {};
    const hour = inp.hour ?? 12;
    const minute = inp.minute ?? 0;
    const ap = hour < 12 ? '오전' : '오후';
    let h12 = hour <= 12 ? hour : hour - 12;
    if (h12 === 0) h12 = 12;

    let dateStr = `${inp.year || ''}년 ${inp.month || ''}월 ${inp.day || ''}일`;
    if (hasTime && inp.hour !== undefined) dateStr += ` ${ap} ${h12}시 ${String(minute).padStart(2, '0')}분`;

    // 간지 문자열 계산 (xx年 xx月 xx日 xx時 형식)
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

    // 선택된 인물 이름/직업 표시 (result 객체에서 직접 읽기)
    const _pName2 = result.personName || '';
    const _pNote2 = result.personNote || '';
    const personInfoHtml2 = _pName2
      ? '<div class="person-info-label"><span class="person-name-label">' + escapeHtml(_pName2) + '</span>' + (_pNote2 ? '<span class="person-note-label">' + escapeHtml(_pNote2) + '</span>' : '') + '</div>'
      : '';

    // 정보바 (날짜 + 간지)
    html += `<div class="info-bar" style="margin-bottom:16px;">
      ${personInfoHtml2}
      <div class="date-info">${dateStr}</div>
      <div class="ganji-info">${ganjiStr}</div>
    </div>`;

    /* 사주명식 카드 제거됨 — BTI 탭에서는 한눈에 보기부터 시작 */

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

    // 핵심 정보 카드 (압축형)
    html += `<div class="bti-core-info bti-core-compact">`;
    html += `<div class="bti-core-card"><span class="bti-core-label">일간</span><span class="bti-core-value">${ilgan?.name || '—'}</span></div>`;
    html += `<div class="bti-core-card"><span class="bti-core-label">일주</span><span class="bti-core-value">${result.pillars.day}</span></div>`;
    html += `<div class="bti-core-card"><span class="bti-core-label">월주</span><span class="bti-core-value">${result.pillars.month}</span></div>`;
    html += `</div>`;

    // 강한 오행 (25% 이상 모두), 약한 오행 (13% 이하 모두), 발달 십성 (25% 이상 모두)
    const strongOhList = ohPctSorted.filter(([, v]) => v >= 25);
    const weakOhList = ohPctSorted.filter(([, v]) => v <= 13);
    const strongTsList = tsGroupSorted.filter(([, v]) => v >= 25);

    html += `<div class="bti-stat-row">`;
    // 강한 오행
    html += `<div class="bti-stat-box strong"><span class="bti-stat-label">강한 오행</span>`;
    if (strongOhList.length > 0) {
      html += `<span class="bti-stat-value">${strongOhList.map(([k]) => k).join(', ')}</span>`;
      html += `<span class="bti-stat-pct">${strongOhList.map(([k, v]) => `${Math.round(v)}%`).join(', ')}</span>`;
    } else {
      html += `<span class="bti-stat-value">없음</span>`;
    }
    html += `</div>`;
    // 약한 오행
    html += `<div class="bti-stat-box weak"><span class="bti-stat-label">약한 오행</span>`;
    if (weakOhList.length > 0) {
      html += `<span class="bti-stat-value">${weakOhList.map(([k]) => k).join(', ')}</span>`;
      html += `<span class="bti-stat-pct">${weakOhList.map(([k, v]) => `${Math.round(v)}%`).join(', ')}</span>`;
    } else {
      html += `<span class="bti-stat-value">없음</span>`;
    }
    html += `</div>`;
    // 발달 십성
    html += `<div class="bti-stat-box sipsung"><span class="bti-stat-label">발달 십성</span>`;
    if (strongTsList.length > 0) {
      html += `<span class="bti-stat-value">${strongTsList.map(([k]) => k).join(', ')}</span>`;
      html += `<span class="bti-stat-pct">${strongTsList.map(([k, v]) => `${Math.round(v)}%`).join(', ')}</span>`;
    } else {
      html += `<span class="bti-stat-value">${topTsGroup[0]}</span>`;
      html += `<span class="bti-stat-pct">${Math.round(topTsGroup[1])}%</span>`;
    }
    html += `</div>`;
    html += `</div>`;

    html += `</div>`;

    html += '<div class="bti-row-juji">';

    // 일간 해석 (고서 기반 상세 버전)
    if (ilgan) {
      html += `<div class="bti-card"><div class="bti-section-title">일간 특징</div>`;
      html += `<div class="bti-card-header"><span class="bti-card-emoji">${ilgan.emoji}</span><div>`;
      html += `<div class="bti-card-name">${ilgan.name}</div>`;
      html += `<div class="bti-card-sub">${ilgan.title}</div>`;
      html += `</div></div>`;

      // 일간 개념 설명
      html += `<p class="bti-card-desc">일간(日干)은 사주의 네 기둥 중 '일주'의 천간으로, 나 자신을 대표하는 글자입니다. 사주 해석의 중심이 되며, 성격, 가치관, 행동 방식의 근본을 나타냅니다.</p>`;

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
      if (ilgan.caution) {
        html += `<div class="bti-detail-item"><span class="bti-detail-label">주의점</span><span class="bti-detail-value" style="color:#e65100">${ilgan.caution}</span></div>`;
      }
      if (ilgan.career) {
        html += `<div class="bti-detail-item"><span class="bti-detail-label">적합 직업</span><span class="bti-detail-value">${ilgan.career}</span></div>`;
      }
      if (ilgan.relation) {
        html += `<div class="bti-detail-item"><span class="bti-detail-label">대인관계</span><span class="bti-detail-value">${ilgan.relation}</span></div>`;
      }
      html += `</div>`;

      // 고유 개성 (카드 프레임 없이)
      if (ilgan.unique) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">${ilgan.name}만의 개성</span><p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${ilgan.unique}</p></div>`;
      }

      // 고서 해석 (카드 프레임 없이)
      if (ilgan.classic) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">고서 해석</span><p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${ilgan.classic}</p></div>`;
      }

      html += `</div>`;
    }

    // 일주 해석
    if (ilju) {
      const stemOh = OHENG_MAP_STEM[result.idxs.day % 10];
      const branchOh = OHENG_MAP_BRANCH[result.idxs.day % 12];
      html += `<div class="bti-card"><div class="bti-section-title">일주 특징</div>`;
      html += `<div class="bti-card-header"><span class="bti-card-emoji">📜</span><div>`;
      html += `<div class="bti-card-name">${ilju.name} 일주</div>`;
      html += `<div class="bti-card-sub">${ilju.theme} · ${stemOh}+${branchOh}</div>`;
      html += `</div></div>`;

      // 일지/십이운성/살 정보 표시
      if (ilju.ilji || ilju.sibiunsung || ilju.sal) {
        html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">`;
        if (ilju.ilji) html += `<span style="background:#e8f4f8;color:#2980b9;padding:4px 10px;border-radius:8px;font-size:0.8rem;font-weight:600;">일지: ${ilju.ilji}</span>`;
        if (ilju.sibiunsung) html += `<span style="background:#f0e8f8;color:#8e44ad;padding:4px 10px;border-radius:8px;font-size:0.8rem;font-weight:600;">십이운성: ${ilju.sibiunsung}</span>`;
        if (ilju.sal && ilju.sal.length > 0) {
          for (const s of ilju.sal) {
            html += `<span style="background:#fde8e8;color:#c0392b;padding:4px 10px;border-radius:8px;font-size:0.8rem;font-weight:600;">${s}</span>`;
          }
        }
        html += `</div>`;
      }

      // 특별 태그 표시
      if (ilju.tags && ilju.tags.length > 0) {
        html += `<div style="margin:12px 0;">`;
        for (const tag of ilju.tags) {
          html += `<span style="display:inline-block;background:#ffeaa7;color:#d63031;padding:4px 10px;border-radius:12px;font-size:0.8rem;margin-right:6px;font-weight:600;">${tag}</span>`;
        }
        html += `</div>`;
      }

      // 일주 개념 설명
      html += `<p class="bti-card-desc">일주(日柱)는 태어난 날의 천간과 지지의 조합으로, 자신의 무의식적 성격과 내면을 나타냅니다. 배우자궁이기도 하여 대인관계와 결혼생활의 패턴을 보여줍니다.</p>`;

      html += `<p class="bti-card-desc">${ilju.personality}</p>`;

      // 일주 상세 정보 (카드 프레임 없이)
      if (ilju.strength || ilju.weakness) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">강점과 약점</span>`;
        if (ilju.strength) html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;"><strong style="color:#2d8a4e;">강점:</strong> ${ilju.strength}</p>`;
        if (ilju.weakness) html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;"><strong style="color:#c0392b;">약점:</strong> ${ilju.weakness}</p>`;
        html += `</div>`;
      }
      if (ilju.career) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">적합 직업</span>`;
        html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${ilju.career}</p>`;
        html += `</div>`;
      }
      if (ilju.love) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">연애/결혼</span>`;
        html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${ilju.love}</p>`;
        html += `</div>`;
      }
      if (ilju.tips) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">개운 TIP</span>`;
        html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${ilju.tips}</p>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    // 월주 해석 (사회적 재능/의식적 발현)
    const woljuIdx = result.idxs.month % 60;
    const woljuName = YUKSHIP_GAPJA[woljuIdx];
    const wolju = ILJU_INTERPRETATION[woljuName];
    if (wolju) {
      const monthStemOh = OHENG_MAP_STEM[result.idxs.month % 10];
      const monthBranchOh = OHENG_MAP_BRANCH[result.idxs.month % 12];
      html += `<div class="bti-card"><div class="bti-section-title">월주 특징 (사회적 재능)</div>`;
      html += `<div class="bti-card-header"><span class="bti-card-emoji">📅</span><div>`;
      html += `<div class="bti-card-name">${wolju.name} 월주</div>`;
      html += `<div class="bti-card-sub">${wolju.theme} · ${monthStemOh}+${monthBranchOh}</div>`;
      html += `</div></div>`;

      // 일지/십이운성/살 정보 표시
      if (wolju.ilji || wolju.sibiunsung || wolju.sal) {
        html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">`;
        if (wolju.ilji) html += `<span style="background:#e8f4f8;color:#2980b9;padding:4px 10px;border-radius:8px;font-size:0.8rem;font-weight:600;">월지: ${wolju.ilji}</span>`;
        if (wolju.sibiunsung) html += `<span style="background:#f0e8f8;color:#8e44ad;padding:4px 10px;border-radius:8px;font-size:0.8rem;font-weight:600;">십이운성: ${wolju.sibiunsung}</span>`;
        if (wolju.sal && wolju.sal.length > 0) {
          for (const s of wolju.sal) {
            html += `<span style="background:#fde8e8;color:#c0392b;padding:4px 10px;border-radius:8px;font-size:0.8rem;font-weight:600;">${s}</span>`;
          }
        }
        html += `</div>`;
      }

      // 특별 태그 표시
      if (wolju.tags && wolju.tags.length > 0) {
        html += `<div style="margin:12px 0;">`;
        for (const tag of wolju.tags) {
          html += `<span style="display:inline-block;background:#ffeaa7;color:#d63031;padding:4px 10px;border-radius:12px;font-size:0.8rem;margin-right:6px;font-weight:600;">${tag}</span>`;
        }
        html += `</div>`;
      }

      // 월주 개념 설명
      html += `<p class="bti-card-desc">월주(月柱)는 태어난 달의 천간과 지지의 조합으로, 의식적으로 발현되는 사회적 재능과 직업적 역량을 나타냅니다. 일주가 무의식적 성격이라면, 월주는 사회에서 의지적으로 발휘하는 능력입니다.</p>`;

      html += `<p class="bti-card-desc">${wolju.personality}</p>`;

      // 월주 상세 정보 (카드 프레임 없이)
      if (wolju.strength || wolju.weakness) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">사회적 강점과 약점</span>`;
        if (wolju.strength) html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;"><strong style="color:#2d8a4e;">강점:</strong> ${wolju.strength}</p>`;
        if (wolju.weakness) html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;"><strong style="color:#c0392b;">약점:</strong> ${wolju.weakness}</p>`;
        html += `</div>`;
      }
      if (wolju.career) {
        html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">적합 직업 (월주 기반)</span>`;
        html += `<p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${wolju.career}</p>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    html += '</div>'; // close bti-row-juji

    // 오행 해석 섹션
    const OHENG_INTERPRETATION = {
      목: {
        emoji: '🌳',
        name: '목(木)',
        element: '나무',
        keyword: '성장, 발전, 시작, 인자함',
        nature: '봄의 기운으로 생명력과 성장을 상징합니다. 나무가 위로 뻗어가듯 발전과 확장의 에너지입니다.',
        strong: '목이 강하면 진취적이고 도전정신이 강합니다. 새로운 것을 시작하고 추진하는 능력이 뛰어나며, 인자하고 자비로운 마음을 가집니다. 다만 과하면 고집이 세고 융통성이 부족해질 수 있습니다.',
        weak: '목이 약하면 결단력이 부족하고 우유부단할 수 있습니다. 시작은 잘하지만 마무리가 약하거나, 새로운 도전에 두려움을 느낄 수 있습니다.',
        balance: '목을 보충하려면 녹색 계열의 색, 동쪽 방향, 봄철 활동, 채소류 섭취가 도움됩니다.'
      },
      화: {
        emoji: '🔥',
        name: '화(火)',
        element: '불',
        keyword: '표현, 열정, 에너지, 예의',
        nature: '여름의 기운으로 열정과 에너지를 상징합니다. 불이 빛과 열을 발산하듯 표현력과 활력의 에너지입니다.',
        strong: '화가 강하면 열정적이고 표현력이 뛰어납니다. 리더십이 있고 사람들을 끌어당기는 매력이 있습니다. 예의 바르고 밝은 성격입니다. 다만 과하면 조급하고 급한 성격이 될 수 있습니다.',
        weak: '화가 약하면 소극적이고 자신을 표현하는 데 어려움을 겪습니다. 열정이 부족하거나 활력이 떨어질 수 있습니다.',
        balance: '화를 보충하려면 붉은색 계열의 색, 남쪽 방향, 여름철 활동, 쓴맛 음식이 도움됩니다.'
      },
      토: {
        emoji: '🏔️',
        name: '토(土)',
        element: '흙',
        keyword: '중용, 신뢰, 연결, 중재',
        nature: '환절기의 기운으로 중심과 조화를 상징합니다. 흙이 만물을 품듯 안정과 신뢰의 에너지입니다.',
        strong: '토가 강하면 안정적이고 신뢰감을 줍니다. 중재 능력이 뛰어나고 사람들 사이를 연결하는 역할을 잘합니다. 다만 과하면 고집이 세고 변화를 싫어할 수 있습니다.',
        weak: '토가 약하면 중심이 흔들리기 쉽고 신뢰를 주기 어렵습니다. 이곳저곳 떠돌거나 안정감이 부족할 수 있습니다.',
        balance: '토를 보충하려면 황색/갈색 계열의 색, 중앙, 단맛 음식, 땅과 접촉하는 활동이 도움됩니다.'
      },
      금: {
        emoji: '⚔️',
        name: '금(金)',
        element: '쇠',
        keyword: '결단, 정의, 완벽, 구분',
        nature: '가을의 기운으로 수렴과 결단을 상징합니다. 쇠가 날카롭듯 분별력과 결단력의 에너지입니다.',
        strong: '금이 강하면 결단력과 실행력이 뛰어납니다. 정의감이 강하고 옳고 그름을 명확히 구분합니다. 완벽주의적 성향이 있습니다. 다만 과하면 냉정하고 비판적일 수 있습니다.',
        weak: '금이 약하면 우유부단하고 결정을 내리기 어렵습니다. 정리정돈이 안 되거나 마무리가 약할 수 있습니다.',
        balance: '금을 보충하려면 흰색/금색 계열의 색, 서쪽 방향, 가을철 활동, 매운맛 음식이 도움됩니다.'
      },
      수: {
        emoji: '💧',
        name: '수(水)',
        element: '물',
        keyword: '지혜, 사색, 유연함, 적응',
        nature: '겨울의 기운으로 저장과 지혜를 상징합니다. 물이 흐르듯 유연함과 지혜의 에너지입니다.',
        strong: '수가 강하면 지혜롭고 통찰력이 뛰어납니다. 유연하게 상황에 적응하고 깊이 있는 사고를 합니다. 다만 과하면 우울해지거나 너무 많은 생각에 빠질 수 있습니다.',
        weak: '수가 약하면 깊이 있는 사고가 어렵고 표면적인 판단을 하기 쉽습니다. 적응력이 떨어지거나 고집이 셀 수 있습니다.',
        balance: '수를 보충하려면 검정색/파란색 계열의 색, 북쪽 방향, 겨울철 활동, 짠맛 음식이 도움됩니다.'
      }
    };

    // 강한 오행 + 약한 오행 + 발달 십성을 한 줄로 묶는 래퍼
    html += '<div class="bti-row-oheng">';

    // 강한 오행 카드
    html += `<div class="bti-card"><div class="bti-section-title">강한 오행</div>`;
    if (strongOhList.length > 0) {
      for (const [oh, pct] of strongOhList) {
        const ohInfo = OHENG_INTERPRETATION[oh];
        if (ohInfo) {
          html += `<div style="margin:8px 0;padding:10px;background:rgba(0,0,0,0.03);border-radius:10px;">`;
          html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">`;
          html += `<span style="font-size:1.1rem;">${ohInfo.emoji}</span>`;
          html += `<span style="font-weight:700;color:${UI.COLORS.OHENG[oh]}">${ohInfo.name} (${Math.round(pct)}%)</span>`;
          html += `</div>`;
          html += `<p class="bti-card-desc" style="margin:0;">${ohInfo.strong}</p>`;
          html += `</div>`;
        }
      }
    } else {
      html += `<p class="bti-card-desc">강한 오행이 없습니다.</p>`;
    }
    html += `</div>`;

    // 약한 오행 카드
    html += `<div class="bti-card"><div class="bti-section-title">약한 오행</div>`;
    if (weakOhList.length > 0) {
      for (const [oh, pct] of weakOhList) {
        const ohInfo = OHENG_INTERPRETATION[oh];
        if (ohInfo) {
          html += `<div style="margin:8px 0;padding:10px;background:rgba(0,0,0,0.03);border-radius:10px;">`;
          html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">`;
          html += `<span style="font-size:1.1rem;">${ohInfo.emoji}</span>`;
          html += `<span style="font-weight:700;color:${UI.COLORS.OHENG[oh]}">${ohInfo.name} (${Math.round(pct)}%)</span>`;
          html += `</div>`;
          html += `<p class="bti-card-desc" style="margin:0;">${ohInfo.weak}</p>`;
          html += `</div>`;
        }
      }
    } else {
      html += `<p class="bti-card-desc">약한 오행이 없습니다.</p>`;
    }
    html += `</div>`;

    // 발달 십성 해석 (퍼센트 기반)
    const topGroupName = topTsGroup[0];
    const topGroupPct = Math.round(topTsGroup[1]);

    // 그룹 -> 개별 십성 매핑 (음양 구분)
    const groupToSipsung = {
      비겁: dayStemIdx % 2 === 0 ? ['비견', '겁재'] : ['겁재', '비견'],
      식상: dayStemIdx % 2 === 0 ? ['식신', '상관'] : ['상관', '식신'],
      재성: dayStemIdx % 2 === 0 ? ['편재', '정재'] : ['정재', '편재'],
      관성: dayStemIdx % 2 === 0 ? ['편관', '정관'] : ['정관', '편관'],
      인성: dayStemIdx % 2 === 0 ? ['편인', '정인'] : ['정인', '편인']
    };

    if (topGroupPct > 0) {
      const topSipsungPair = groupToSipsung[topGroupName] || ['비견', '겁재'];
      const mainSipsung = topSipsungPair[0];
      const mainSipsungInfo = SISUNG_INTERPRETATION[mainSipsung];

      html += `<div class="bti-card"><div class="bti-section-title">발달 십성 특징</div>`;

      if (mainSipsungInfo) {
        html += `<div class="bti-card-header"><span class="bti-card-emoji">${mainSipsungInfo.emoji}</span><div>`;
        html += `<div class="bti-card-name">1. ${mainSipsung} (${topGroupName} ${topGroupPct}%)</div>`;
        html += `<div class="bti-card-sub">${mainSipsungInfo.title} — ${mainSipsungInfo.subtitle}</div>`;
        html += `</div></div>`;
        html += `<p class="bti-card-desc">${mainSipsungInfo.desc}</p>`;
        html += `<div class="bti-card-keyword">${mainSipsungInfo.keyword.split(', ').map(k => `<span>${k}</span>`).join('')}</div>`;

        // 상세 정보 그리드
        html += `<div class="bti-detail-grid">`;
        if (mainSipsungInfo.strength) {
          html += `<div class="bti-detail-item"><span class="bti-detail-label">강점</span><span class="bti-detail-value" style="color:#2d8a4e">${mainSipsungInfo.strength}</span></div>`;
        }
        if (mainSipsungInfo.weakness) {
          html += `<div class="bti-detail-item"><span class="bti-detail-label">약점</span><span class="bti-detail-value" style="color:#c0392b">${mainSipsungInfo.weakness}</span></div>`;
        }
        html += `</div>`;

        // 적합 직업 (카드 프레임 없이)
        if (mainSipsungInfo.career1) {
          html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">적합 직업</span><p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${mainSipsungInfo.career1}</p></div>`;
        }

        // 고서 해석 (카드 프레임 없이)
        if (mainSipsungInfo.classic) {
          html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">고서 해석</span><p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${mainSipsungInfo.classic}</p></div>`;
        }
      }

      // 두 번째 발달 십성 그룹
      if (tsGroupSorted.length > 1 && tsGroupSorted[1][1] >= 15) {
        const ts2Name = tsGroupSorted[1][0];
        const ts2Pct = Math.round(tsGroupSorted[1][1]);
        const ts2SipsungPair = groupToSipsung[ts2Name] || ['비견', '겁재'];
        const ts2Sipsung = ts2SipsungPair[0];
        const ts2Info = SISUNG_INTERPRETATION[ts2Sipsung];

        if (ts2Info) {
          html += `<div class="bti-divider"></div>`;
          html += `<div class="bti-card-header"><span class="bti-card-emoji">${ts2Info.emoji}</span><div>`;
          html += `<div class="bti-card-name">2. ${ts2Sipsung} (${ts2Name} ${ts2Pct}%)</div>`;
          html += `<div class="bti-card-sub">${ts2Info.title} — ${ts2Info.subtitle}</div>`;
          html += `</div></div>`;
          html += `<p class="bti-card-desc">${ts2Info.desc}</p>`;
          html += `<div class="bti-card-keyword">${ts2Info.keyword.split(', ').map(k => `<span>${k}</span>`).join('')}</div>`;

          // 상세 정보 그리드
          html += `<div class="bti-detail-grid">`;
          if (ts2Info.strength) {
            html += `<div class="bti-detail-item"><span class="bti-detail-label">강점</span><span class="bti-detail-value" style="color:#2d8a4e">${ts2Info.strength}</span></div>`;
          }
          if (ts2Info.weakness) {
            html += `<div class="bti-detail-item"><span class="bti-detail-label">약점</span><span class="bti-detail-value" style="color:#c0392b">${ts2Info.weakness}</span></div>`;
          }
          html += `</div>`;

          // 적합 직업 (카드 프레임 없이)
          if (ts2Info.career1) {
            html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">적합 직업</span><p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${ts2Info.career1}</p></div>`;
          }

          // 고서 해석 (카드 프레임 없이)
          if (ts2Info.classic) {
            html += `<div style="margin-top:14px;"><span style="font-weight:600;color:var(--text);">고서 해석</span><p style="color:var(--text-secondary);line-height:1.7;margin:6px 0 0 0;">${ts2Info.classic}</p></div>`;
          }
        }
      }
      html += `</div>`;
    }

    html += '</div>'; // close bti-row-oheng

    // 오행 분포 특성 (전체 폭)
    html += `<div class="bti-card"><div class="bti-section-title">오행 분포 특성</div>`;
    const presentOh = ohPctSorted.filter(([, v]) => v > 0).length;
    const hasWeakOh = weakOhList.length > 0;
    if (presentOh === 5 && !hasWeakOh) {
      html += `<p class="bti-card-desc">오행이 모두 고르게 갖춰져 있습니다. 균형 잡힌 기운으로 어느 한쪽으로 치우치지 않는 안정적인 성격을 가집니다.</p>`;
    } else if (presentOh === 5 && hasWeakOh) {
      html += `<p class="bti-card-desc">오행이 모두 갖춰져 있으나 <strong>${weakOhList.map(([k]) => k).join(', ')}</strong> 오행이 약합니다.</p>`;
    } else {
      const missingOh = ['목', '화', '토', '금', '수'].filter(oh => !ohPctSorted.find(([o, v]) => o === oh && v > 0));
      if (missingOh.length > 0) {
        html += `<p class="bti-card-desc">사주에 <strong>${missingOh.join(', ')}</strong> 오행이 없습니다.</p>`;
      }
    }
    html += `</div>`;

    // 2026년 세운 분석 카드 (병오년)
    html += `<div class="bti-card"><div class="bti-section-title">2026년 세운 분석</div>`;

    // 2026년 병오년 기본 정보
    html += `<div style="margin-bottom:14px;">`;
    html += `<span style="font-weight:600;color:var(--text);font-size:0.95rem;">2026년 병오년(丙午年)</span>`;
    html += `<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">`;
    html += `<span style="font-size:1.5rem;font-weight:700;color:#cc3333">丙午</span>`;
    html += `<span style="color:var(--text-dim);font-size:0.9rem;">병오 · 붉은 말의 해</span>`;
    html += `</div>`;
    html += `<p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.6;margin:8px 0 0 0;">천간 병(丙)은 화(火), 지지 오(午)도 화(火)로 화기(火氣)가 매우 강한 해입니다. 열정, 에너지, 표현력, 변화의 기운이 넘치는 한 해가 될 것입니다.</p>`;
    html += `</div>`;

    // 병오년 특성
    html += `<div style="margin-bottom:14px;">`;
    html += `<span style="font-weight:600;color:var(--text);font-size:0.95rem;">병오년 전체 운세 특성</span>`;
    html += `<ul style="margin:8px 0 0 20px;color:var(--text-secondary);font-size:0.9rem;line-height:1.8;">`;
    html += `<li><strong>강한 화기:</strong> 천간과 지지 모두 화(火)로 이루어져 화기가 극강합니다. 열정과 추진력이 넘치지만, 조급함과 다툼에 주의해야 합니다.</li>`;
    html += `<li><strong>변화와 활동:</strong> 정체되어 있던 일들이 급격히 움직이고, 새로운 시작과 변화가 많은 해입니다.</li>`;
    html += `<li><strong>표현과 소통:</strong> 자신을 표현하고 드러내는 것이 유리합니다. 창작, 발표, 홍보 활동에 좋습니다.</li>`;
    html += `<li><strong>주의사항:</strong> 화기 과다로 인한 건강 문제(심장, 혈압, 열성 질환), 급한 성격으로 인한 실수, 금전적 충동에 주의가 필요합니다.</li>`;
    html += `</ul>`;
    html += `</div>`;

    // 일간별 2026년 운세 해석
    const ILGAN_2026_INTERPRETATION = {
      갑: {
        name: '갑목(甲木) 일간',
        emoji: '🌲',
        relation: '식신운(食神運)',
        relationDesc: '갑목 → 병화 = 식신 (내가 낳는 것, 음양 동일)',
        symbol: '창작력, 표현력, 활동성, 호기심, 실행력',
        summary: '자신의 능력과 재능을 아낌없이 드러내는 해입니다.',
        nature: '갑목은 독립과 자유를 중시하며, 자신감과 명예욕이 강한 일간입니다. 시작하는 힘이 뛰어나고 위로 뻗어나가려는 성향이 있어, 목표를 세우면 성취를 향해 나아갑니다. 희망차고 순수한 정조를 지니며, 단순하고 솔직한 태도로 매사에 앞장섭니다. 폭넓게 상황을 파악해 적재적소에 배치하는 능력이 있으나, 요령보다는 정면돌파를 선호합니다.',
        sipsungDesc: '식신은 안정적이고 보수적이며 중후한 기운입니다. 타인과의 관계에서 이해와 조화를 중시하고, 내면의 안정과 지속적인 성장을 추구합니다. "언어 표현", "의식주", "말하는 직업"과 깊은 연관이 있으며, 주어진 구조화된 틀을 더 체계적으로 정리하는 능력이 뛰어납니다.',
        combination: [
          '2026년은 갑목 일간에게 자신의 능력, 재능, 숨겨진 실력을 아낌없이 드러내는 시기입니다. 표현력과 창조력이 대폭 상승하며, 실질적인 산출물과 행동, 노력에 대한 성적표를 받는 해입니다.',
          '자기 재능을 드러내는 해입니다. 그동안 쌓아온 실력이 세상에 노출됩니다. 갑목 특유의 순수하고 희망찬 에너지가 식신을 통해 안정적으로 표현됩니다.',
          '실전 무대에 자주 서게 됩니다. 갑목의 진가는 실전에서 발휘되므로, 본인의 재능을 확인받는 시기입니다. 식신의 부드러운 감정 표현과 갑목의 당당한 자신감이 조화를 이루어, 다소 거칠 수 있는 갑목의 표현이 한층 세련되게 다듬어집니다.',
          '창의적 활동력을 발휘합니다. 식신은 "능동적으로 변화를 일으키고, 무언가를 바꾸려는 힘, 기르고 가르치는 힘"을 나타냅니다. 갑목의 진취성과 결합하여 본인이 하고 싶은 일을 하면서도 의식주에 큰 문제가 생기지 않는 흐름이 형성됩니다.',
          '체력 소모에 주의해야 합니다. 기운이 외부로 빠져나가는 구조이므로 에너지 관리가 필수입니다. 병오년의 강한 화 기운이 과도하면 기운을 너무 많이 쏟아낼 수 있습니다.'
        ],
        keywords: [
          { title: '워커홀릭', desc: '할 일이 산더미처럼 밀려오지만, 오랜만에 자기효능감을 느끼는 해입니다. 일이 나에게 맞다는 느낌, 활력 있게 주도적으로 일에 몰입하게 됩니다. 쉬는 게 오히려 더 어렵고, 쉬면 마음이 불편할 수 있습니다. 죽기 전까지 평생 쥐고 싶은 일을 구체적으로 실행하기 좋은 해입니다.' },
          { title: '도파민 + 과몰입', desc: '누군가에게 과몰입하거나, 상대 말 한마디에 휘둘리기 쉬운 시기입니다. 연애, 새로운 만남, 자극에 대한 문턱이 낮아지며, 이성에 더 관심을 갖고 적극적으로 다가오는 이성도 증가합니다. 병오년은 이성 관련 구설수나 스캔들이 터지기 쉬운 해입니다. 무의미한 음주와 흡연, 게임, SNS 중독도 주의하며, 생활 균형을 깨는 몰입은 거리두기가 필요합니다.' },
          { title: '자기 PR', desc: '"○○ 분야 전문가 = 나"라는 개인 키워드 태그를 만드는 것이 좋습니다. 2026년은 뾰족하고 선명하게 자기 브랜딩을 할 때입니다. 프리랜서나 창업자 입장에겐 야망만큼 보상받는 시기입니다. 다만 직장인의 경우 정해진 업무에 치여 퇴근 후 공허함을 느낄 수 있습니다. 예술계 종사자의 경우, 프로듀서나 감독에게 선택받아 실력을 발휘하는 흐름입니다.' }
        ],
        flow: {
          상반기: '마음껏 자기 표현을 하세요. PR, 마케팅 전략, 이직/취업 고민, 커리어 기획, 부업 시작에 적합합니다. 연애도 상반기에 시작하는 것이 좋습니다.',
          하반기: '상반기 성과에 대한 피드백과 수정의 시기입니다. 완성과 마무리에 집중하세요. 연애도 하반기에 점검합니다.'
        },
        advice: '창작 활동, 발표, 프레젠테이션에 적극적으로 나서세요. 말과 언어를 다루는 직업 중에서도 차분하고 현실적인 분야에서 능력을 발휘하세요. 단, 무리하지 말고 체력 안배를 철저히 하세요. 갑목의 기획·추진력은 탁월하나 마무리에 관심이 떨어지는 경향이 있으니, 식신의 꼼꼼함을 빌려 마무리까지 신경 쓰세요.'
      },
      을: {
        name: '을목(乙木) 일간',
        emoji: '🌿',
        relation: '상관운(傷官運)',
        relationDesc: '을목 → 병화 = 상관 (내가 낳는 것, 음양 교차)',
        symbol: '혁신, 표현력, 감수성, 민첩함, 날카로움',
        summary: '창의적 돌파력이 상승하고 개인 매력이 빛나는 해입니다.',
        nature: '을목은 겉으로는 유연하고 연약해 보이지만, 끈질기게 살아남는 힘이 있습니다. 환경에 적응하며 피어나는 타입으로, "유연 생존력의 달인"이라 불립니다. 이해타산에 밝은 "장사꾼 본성"이 있어 실속과 계산에 강하고 검소한 기질이 있습니다. 내면은 부드럽고 온화하면서도 생활력이 강합니다. 한편 고독과 동거하는 외로움이 있어, 감정 표현을 아끼고 타인과의 공유를 꺼리는 면이 있습니다.',
        sipsungDesc: '상관은 자기 인식이 뚜렷하며, 감정과 생각을 직접적이고 자유롭게 드러내는 기운입니다. 식신보다 표현의 강도와 방향이 외향적으로 뻗어나가므로, 표현이 직설적이고 반응 속도가 빠릅니다. 매우 적극적이고 개방적이며 활동적이고, 늘 재미있는 일을 찾아다니는 자유로운 영혼입니다. 돌파력, 기획력, 계획성이 있고, 권위나 규범을 잘 거스르며 스스로 길을 만듭니다.',
        combination: [
          '을목에게 병오년은 갑목보다 더 날카롭고 예민하게 다가옵니다. 창의적 돌파력이 상승하며, 기존 틀을 깨는 아이디어가 폭발합니다.',
          '을목의 환경 적응력과 상관의 독창성이 만나, 기존에 없던 새로운 방식을 창안해내는 힘이 강해집니다.',
          '표현력이 급격히 확장됩니다. 평소 감정 표현을 아끼던 을목이 상관의 영향으로 자유롭게 자신을 드러내게 됩니다. 이는 해방감을 주기도 하지만, 익숙하지 않은 방식이라 본인도 당황할 수 있습니다.',
          '감정 기복에 주의해야 합니다. 상관의 특성상 날이 서기 쉽습니다. 을목 특유의 고독감과 상관의 예민함이 결합하면, 작은 자극에도 과민하게 반응할 수 있습니다.',
          '언행을 조심해야 합니다. 상관은 "상처를 주든 말든 맞는 말을 직설적으로 하는" 경향이 있습니다. 을목의 실리주의와 만나면 "할 말은 하는" 모습이 되지만, 이것이 구설수로 이어질 수 있습니다.'
        ],
        keywords: [
          { title: '뛰어난 개인 매력', desc: '갑목은 직선적이고 약간 투박한 반면, 을목은 유연함과 특유의 매력이 있습니다. 2026년에는 인간관계 아우라가 강해지며, 연애와 인간관계 성공률이 갑목보다 높습니다. 2026년 전에 자기관리가 필수입니다. 외모 대업그레이드 시기이므로 미리 준비해야 제때 매력을 발산할 수 있습니다.' },
          { title: '창업 및 업무 주도', desc: '과거에는 시키는 대로 했다면, 이제는 "내 것을 하겠다"는 마음이 생깁니다. 취미나 관심사를 수익화하거나, 기존 업무를 확장·전환하는 시기입니다. 이미 내실이 준비된 사람들은 자기 간판을 거는 시기입니다. 소규모 개업이나 창업에 적합합니다. 직장인들의 PR이 이직·승진과 연결됩니다.' },
          { title: '3년짜리 프로젝트', desc: '본업 외에 부업, 파생, 확장 프로젝트가 적합합니다. 개인만의 무기를 만들어 대활약할 타이밍입니다. 2년 안에 달성할 이상적 모습을 구체적으로 그려보세요. 목표는 실질적 삶의 질이 도약할 수 있는 야심 찬 설정이어야 합니다. 2027~2028년부터 전부 수확할 기회가 생깁니다.' }
        ],
        flow: {
          인간관계: '나에게 도움 되는 사람을 곁에 두세요. 혼자 하면 체력이 소진됩니다. 귀인이 나타날 시기입니다.',
          커리어: '지금이 엔진 시동 걸 때입니다. 게으름과 안 하는 이유를 다 버리고 집중하세요. 상반기 안에 초기 성과를 내는 것이 중요합니다.',
          재물: '진짜 큰 돈은 2027~2028년부터입니다. 2026년은 을목에게 무언가 결과를 얻기보다 뿌리 내리는 해로, 전문성을 보여주고 신뢰를 쌓는 데 집중하세요.'
        },
        advice: '창의적 분야에서 두각을 나타낼 수 있는 해입니다. 말과 행동을 한 박자 늦추는 연습이 필요합니다. 을목의 처세술을 활용하여 상관의 날카로움을 부드럽게 포장하세요. 새로운 일을 시작하되, 을목의 실리주의로 수익성을 꼼꼼히 따져보세요.'
      },
      병: {
        name: '병화(丙火) 일간',
        emoji: '☀️',
        relation: '비견운(比肩運)',
        relationDesc: '병화 → 병화 = 비견 (같은 오행, 같은 음양)',
        symbol: '자아 강화, 경쟁심, 독립심, 자존심',
        summary: '자신과 같은 기운이 두 배로 작용하는 해, 존재감이 극대화됩니다.',
        nature: '병화는 불꽃과 폭죽처럼 빛나고 따뜻한 기운입니다. 존재감이 강하고 주변을 밝히는 힘이 있으며, 예절을 중시하고 모든 상황에서 분명하고 명확합니다. 활동적이고 적극적이며 자유로운 자신감을 가졌고, 화려함을 즐기되 겸손도 갖추려 합니다. 화끈하고 당당하며 의리가 있고, 사교적이고 친화력이 좋으며 명랑하고 활달합니다. 다만 냄비 같은 열정으로 빨리 달아오르고 빨리 식는 것이 특징입니다.',
        sipsungDesc: '비견은 타인의 간섭을 꺼리고 자기중심적인 기운입니다. 독립적이고 자존심이 강하며, 주체성 있고 자발적입니다. 내면의 확신을 중시하고, 자기 영역에 대한 강한 소유 의식과 신념이 있습니다. "나", "자아의 성장 방향", "대인관계"와 연결되며, 결단력과 추진력이 강하고 남으로부터 인정받고 싶은 욕구가 큽니다.',
        combination: [
          '에너지 폭발: 평소보다 활력과 추진력이 강해집니다. 병화의 화끈한 열정이 비견을 만나 더욱 강렬해지며, 무엇이든 해낼 수 있다는 자신감이 충만합니다.',
          '존재감의 극대화: 병화는 원래 존재감이 강한데, 비견이 겹치면 주변을 완전히 압도하는 카리스마가 발휘됩니다. 리더 역할에 자연스럽게 서게 되고, 권력 지향성이 강해집니다.',
          '자기중심적 경향 강화: 극단으로 치우치기 쉽습니다. 비견의 독립심과 병화의 "한번 잡으면 남의 말을 잘 듣지 않는" 성향이 결합하여 고집이 지나치게 강해질 수 있습니다.',
          '대인관계 마찰 증가: 비견은 주변 환경과의 접점을 의미하기도 합니다. 병화의 도전정신과 결합하면 주변과의 마찰이 생길 수 있으나, 이는 자연스러운 성장통으로 받아들여도 좋습니다.'
        ],
        keywords: [
          { title: '걸어다니는 태양', desc: '2026년 병화 일간은 마치 몸집이 2배로 커지는 것과 같습니다. 나를 주목하는 눈과 귀가 많아지고, 자기 PR과 인지도 상승에 최적의 타이밍입니다. 본인이 만든 콘텐츠, 창작물, 서비스, 사업까지 전부 내놓아 보세요. 프리랜서, 사업가, 예술/연예계 종사자에게 성과 내기 좋은 시기입니다. 다만 가만히 앉아 있어도 눈에 띄므로, 원치 않은 대인관계나 비교 심리가 강해질 수 있습니다.' },
          { title: '자기 중심적 사고', desc: '병화 일간은 자기 일에 집중하고 싶은 마음이 강해집니다. 누군가 밑에 들어가기보다, "내가 직접 해보겠다"는 심리가 커지는 시기입니다. 창업이나 독립 생활로 이어질 수 있고, 회사에서도 이직 욕구가 상승합니다. 단, 중대한 결정은 절대 충동적으로 하면 안 됩니다. 감추고 싶은 비밀이 본인 의사와 상관없이 공개될 수도 있습니다.' },
          { title: '확장의 해', desc: '무언가 일을 벌이고 창업하는 데에 유리합니다. 더 큰 무대로 가고 싶다는 생각이 들고, 본인의 격과 그릇이 커지는 시기입니다. 바빠서 정신없이 뛰어다니게 되지만, 나중에 돌아보면 "그때 열심히 해서 지금이 있다"는 수확감을 느끼게 됩니다. 2028년까지 이어지며, 확장할 기회가 있을 때 확장하는 것이 좋습니다.' }
        ],
        flow: {
          전체흐름: '병화 일간은 2025년부터 4년간 새로운 인생을 개척하고 성과를 만드는 해입니다. 지금은 "막 시작하는" 추세입니다.',
          성과시기: '병(丙)은 빠른 속도감과 확장에 탁월한 글자이므로, 본인 명식에 맞는 일을 하고 있다면 성과가 빠르게 나타날 수 있습니다.'
        },
        advice: '화기가 너무 강하니 수(水) 기운으로 균형을 맞추세요. 명상, 휴식, 물 가까이 하는 것이 좋습니다. TV, SNS, 어떤 매체든 출연하기 다 좋습니다. 다만 즉흥적인 면이 있으니 중대한 결정은 신중하게 하세요.'
      },
      정: {
        name: '정화(丁火) 일간',
        emoji: '🕯️',
        relation: '겁재운(劫財運)',
        relationDesc: '정화 → 병화 = 겁재 (같은 오행, 음양 교차)',
        symbol: '경쟁심, 독립심, 명예욕, 승부욕',
        summary: '내면의 강함이 드러나고, 전문성을 키우는 해입니다.',
        nature: '정화는 화려함보다 실속을 추구하는 불꽃입니다. 조용하지만 꾸준한 불꽃으로, 관계 속에서 의리를 지키며 안정적으로 빛납니다. 표면은 나긋하고 신비로우며, 유연하고 온화하며 섬세하고 친절합니다. 명랑하고 쾌활하되 외유내강이고, 감정 절제가 잘되며 상상력이 풍부합니다. 1대1 매력 발산 최강자로, 친밀하고 고급스러운 느낌을 줍니다. 예의와 격식을 중시하며, 다만 우유부단하고 타인의 주장에 잘 휘말릴 수 있습니다.',
        sipsungDesc: '겁재는 독립적인 의지와 자기표현 욕구를 나타냅니다. 비견보다 외부 자극에 더 민감하게 반응하며, 자신의 위치나 영향력을 네트워킹 과정에서 뚜렷하게 드러내려는 경향이 있습니다. 몰입력과 실행력이 뛰어나며, 경쟁심, 적극성, 자기결정성을 의미합니다. 독립심이 강하고 경쟁적이며 투쟁적이고, 틀에 갇히지 않은 창의성을 가지고 있습니다.',
        combination: [
          '경쟁심과 독립심 급상승: 평소보다 강한 모습을 보입니다. 정화의 나긋한 외면 아래 숨겨진 강한 내면이 겁재를 만나 표면으로 드러납니다.',
          '네트워킹 확장: 병화와 달리 정화는 자기와는 다른 새로운 영역으로 확장됩니다. 겁재 특성상 다양한 분야의 사람들과 접촉하며, 자신의 영향력을 넓히려는 움직임이 강해집니다.',
          '명예욕과 승부욕 강화: 자신을 증명하고 싶은 욕구가 폭발합니다. 정화 특유의 고급스러운 이미지를 유지하면서도, 내면에서는 치열한 승부욕이 타오릅니다.',
          '내면의 끼 분출: 평소 절제하던 감정이 겁재의 자극으로 터져 나올 수 있습니다. 이는 창의적 에너지로 승화될 수도 있지만, 다혈질적 반응으로 나타날 수도 있습니다.'
        ],
        keywords: [
          { title: '전문성과 투자 공부', desc: '기본적인 경제 흐름을 익히기 좋은 때입니다. 기술과 명성도 윤곽이 잡히는 시기이며, 세상이 돌아가는 흐름을 이해하는 기간입니다. 기존에 보이지 않던 계약서나 투자에 관한 통찰력이 생깁니다. 남들에게 재물을 빼앗거나, 남들에게 재물을 나누어주거나 둘 중 하나입니다. 씀씀이도 커지므로 유의해야 합니다.' },
          { title: '필수불가결한 전문성으로 진화', desc: '조직/집단 내에서 대체 불가능한 인력이 될 수 있습니다. 병화 일간처럼 창업을 하고 개인의 끼를 뽐내는 느낌보다는 시장에서의 전문성을 띄는 방향으로 성장합니다. 그 과정에서 기존과는 다른 새로운 대인관계가 형성됩니다. 이 역시 성장통이므로 걱정할 필요 없습니다.' },
          { title: '2027년에 성과가 터진다', desc: '정화에겐 2026년에 이어, 2027년에 성과가 터지는 해입니다. 지금은 계속 상승하는 과정이며, 개인의 전문성을 키우는 해입니다. 병화는 당장 올해를 드러내지만, 정화는 본인을 드러내는 동시에 발전 과정이기도 합니다. 화려한 스포트라이트보다 내실을 다지는 해입니다.' }
        ],
        flow: {
          현재: '겉으로 드러나지 않아도 실속 있는 성과를 쌓을 수 있습니다.',
          성과시기: '2027년에 본격적인 성과가 터집니다. 2026년은 준비와 내실을 다지는 시기입니다.'
        },
        advice: '돈 관련 결정은 신중히 하고, 타인에게 돈을 빌려주지 마세요. 내 것을 지키는 데 집중하세요. 전문성을 키우는 데 투자하고, 겁재의 날카로움을 정화 특유의 고급스러움으로 포장하세요. 충동적 결정은 피하고 한 박자 쉬어가며 판단하세요.'
      },
      무: {
        name: '무토(戊土) 일간',
        emoji: '🏔️',
        relation: '편인운(偏印運)',
        relationDesc: '병화 → 무토 = 편인 (화생토, 음양 동일)',
        symbol: '예민성, 집중력, 철학적 탐구, 특수 학문',
        summary: '깊이 뿌리내리고 전문성을 키우는 해, 여유와 안정의 시기입니다.',
        nature: '무토는 묵직하고 중후한 중심축입니다. 주변의 에너지를 발산하도록 돕는 역할을 하며, 보호와 저장에 특화되어 있습니다. 따뜻하고 믿음직하며 겸손하고, 은근한 고집과 관대함이 공존합니다. 무토의 고집은 "한다면 한다"는 자기주관 발현이 뚜렷하며, "아니면 말고"라는 담대한 태도로 새로운 아이디어를 찾아 나섭니다. 말과 행동을 조심하며 신용을 중시하고, 끈기가 있어 중재와 중계 역할에 능합니다.',
        sipsungDesc: '편인은 수용적 태도와 정서적 안정감을 기반으로 하되, 정서 표현을 억제하고 감정을 축적합니다. 외부 세계와 거리가 있고, 고독하며 사유 중심적인 성격 구조를 지닙니다. 통찰력이 좋고, 직관력, 신비성, 자율성과 가깝습니다. "공부", "부동산", "문서", "도장" 중에서도 끼가 필요한 공부와 연결됩니다. 순간적인 재치와 임기응변 능력이 좋습니다.',
        combination: [
          '예민해지고 집중력 상승: 한 분야에 깊이 파고드는 경향이 강해집니다. 무토의 묵직함과 편인의 통찰력이 결합하여, 복잡한 문제를 깊이 있게 탐구하는 능력이 발휘됩니다.',
          '철학적 탐구 증가: 철학, 심리학, 명리학 등 특수 학문에 관심이 증가합니다. 편인의 신비성과 초월적 사고가 무토의 중심축 역할과 만나, 형이상학적 주제에 끌리게 됩니다.',
          '창의적 혁신 가능: 편인은 "독창적인 혁신가, 창의력이 풍부한 문제 해결자"의 기운입니다. 무토의 새로운 아이디어 추구 성향과 결합하면, 기존에 없던 해결책을 찾아낼 수 있습니다.',
          '게으름 주의: 편인의 부정적 측면으로 무기력해질 수 있습니다. 사유에만 빠져 실행이 따라가지 못하거나, 외부 세계와 단절되는 경향이 생길 수 있습니다.'
        ],
        keywords: [
          { title: '여러 경험과 깊은 전문성', desc: '2026년에 겪게 될 경험들은 삶을 통틀어 배울 점이 많습니다. 대충 넘길 수 없는 사건들이며, 무엇을 겪든 남는 것이 많습니다. 학습의 최적기이며, 원래 하던 학습이 기존보다 더 깊고 통찰력이 생깁니다. 권한과 책임이 함께 상승하고, 사회생활에서 타인에게 인정받는 권위를 획득합니다. 큰 인연을 맺을 사람을 만나게 됩니다.' },
          { title: '자산 형성 공부', desc: '무토 일간이 편인을 만나 투자에 일가견이 생깁니다. 가진 돈을 현금으로만 두지 않고 다양한 자산에 투자를 시도합니다. 재테크에 투자 공부를 시작하며, 단기 투자보단 장기 투자에 가깝습니다. 상속이나 계약, 지적재산권 등에 인연이 생깁니다.' },
          { title: '여유의 해', desc: '힘을 얻는 시기이자 깊이 뿌리내리는 시기입니다. 힘들게 느껴지던 문제가 할만해지고, 못 할 것 같던 일도 막상 해보면 괜찮습니다. 배짱이 커지고 정신력과 마인드가 강해지며, 항상 중심이 잡혀있어 쉽게 흔들리지 않습니다. 스스로의 가치관을 성립하고, 그릇을 키우는 해입니다.' }
        ],
        flow: {
          '2026년': '하고 있는 일을 세팅하고 깊이 뿌리내리는 시기입니다. 자기만의 전문 분야가 생기며, 소속 집단에서 대체 불가능한 존재가 됩니다. 업무 숙련도도 상승하고, 자기 자신의 능력치를 키우는 시기입니다.',
          '2027년 말~': '본격적인 확장이 시작됩니다. 자기 사업을 시작하는 해입니다. 2~3년 보고 장기 지속하는 게 좋습니다.'
        },
        advice: '배움에 집중하되 현실적인 목표를 세우세요. 실용적인 기술 습득이 좋습니다. 문제 발생 시 스트레스를 너무 받을 필요가 없습니다. 다 해결할 수 있는 문제입니다. 다만 사유에만 빠져 실행이 따라가지 못하지 않도록 주의하세요.'
      },
      기: {
        name: '기토(己土) 일간',
        emoji: '🌾',
        relation: '정인운(正印運)',
        relationDesc: '병화 → 기토 = 정인 (화생토, 음양 교차)',
        symbol: '학문, 명예, 어머니, 문서, 안정',
        summary: '귀인을 만나고 인정받는 해, 가장 잘 어울리는 운입니다.',
        nature: '기토는 부드럽고 수용적입니다. 강하게 맞서기보다 받아들이며 자기 것으로 만드는 유연함이 있고, 내면에 촉촉한 힘이 있습니다. 자기관리의 왕으로 스스로의 몫을 철저히 챙기며, "내가 허락한 내 편"을 아끼고 자기 영역 안에서 활동하려는 성향이 강합니다. 경청과 이해를 잘해 남의 말을 잘 들어주고 감정을 헤아리며, 사람을 잘 보듬고 잘 키웁니다. 자기가 차가운 줄 알지만 실은 숨은 팬이 많습니다.',
        sipsungDesc: '정인은 수용적 태도와 정서적 안정감을 기반으로 합니다. 전통적 질서와 규범에 대한 존중이 있고, 온화롭고 조화로운 관계를 선호합니다. 안정, 관용, 헌신, 자비심과 가깝습니다. "공부", "부동산", "문서", "도장" 중에서도 제도권, 정규 공부와 연결됩니다. 타고난 학문적 머리가 존재하며, 직관력이 발달하고 사람 중심의 가치를 중시합니다.',
        combination: [
          '마음의 안정과 평안: 병화가 기토를 생해줍니다. 정인의 정서적 안정감이 기토의 자기관리 능력과 결합하여, 내면이 풍요로워집니다.',
          '학위, 자격증 취득: 정통 학문 성취의 시기입니다. 기토의 경청 능력과 정인의 학문적 재능이 만나, 깊이 있는 학습이 가능합니다.',
          '자신감의 근거가 생김: 안정성 위에 사회활동 확장이 가능합니다. 기토가 평소 "이불 밖은 위험하다"고 느꼈다면, 정인의 든든한 지원으로 세상에 나갈 용기가 생깁니다.',
          '명예 상승: 인정받고 신뢰를 얻는 해입니다. 기토의 숨은 매력이 정인을 통해 드러나며, "숨은 팬"이 드러나는 팬이 됩니다.'
        ],
        keywords: [
          { title: '귀인이 많은 시기', desc: '나를 이끌어주는 스승, 상사, 유력자를 만납니다. 회사원이든, 사업가든, 프리랜서든 도움을 주는 사람이 많은 해입니다. 부모 관계에서도 유리합니다. 다만 모든 기회는 무조건적으로 다가오지 않고, 본인의 소고집을 내려놓고 주변 사람들에게 도움을 청할 때 등장합니다. 인연이 다소 교체될 수 있으니, 올해는 인간관계를 유형별로 정리해두면 도움이 됩니다.' },
          { title: '합격운, 취업운', desc: '전문직, 공무원, 자격증 등 합격증에 유리한 해입니다. 사람과 대면할 때 인상, 분위기가 좋게 작용합니다. 중요한 자리 갈 때 옷, 외모를 단정히 하고, 평상시 자기 모습에 신경쓰는 것이 중요합니다. 올해부터 내년까지 사회생활에서 무기가 될 자격증 또는 내실을 채우는 것이 중요합니다. 결혼 적령기 기토 일간은 결혼하는 경우가 많습니다.' },
          { title: '내 지식을 활용하기 좋은 시기', desc: '내 기획, 아이디어, 생각에서 나온 서비스를 적극적으로 판매하고 발전시키기 좋은 때입니다. 실물 자산보다 가상 자산을 다루는 것이 좋고, 3년을 바라보면 좋습니다. 콘텐츠를 만들거나 투자를 해보는 것도 좋습니다. 무언가 활발하게 돌아다닐 필요가 없는 시기이며, 남는 에너지는 독서나 공부에 활용하세요.' }
        ],
        flow: {
          특징: '기토 일간에게 병오년은 가장 잘 어울리는 해입니다. 기토의 안정성과 정인이 잘 어울리며, 동시에 기토의 장점을 통해 실리를 추구할 수 있습니다.',
          주의: '무토 일간과 마찬가지로 게을러지기 쉽습니다. 2026년에는 공부하고 지식을 축적하고 활용하기 매우 좋은 시기이므로, 욕심을 내는 것을 추천합니다.'
        },
        advice: '좋은 운을 적극 활용하세요. 공부나 자기계발에 투자하면 큰 성과가 있습니다. 평소보다 주변 평가를 더 좋게 받을 수 있으며, 사업가나 지적재산권, 브랜드, 명예와 관련해 성장을 이끌 수 있습니다. 소고집을 내려놓고 주변에 도움을 청하세요.'
      },
      경: {
        name: '경금(庚金) 일간',
        emoji: '⚔️',
        relation: '편관운(偏官運)',
        relationDesc: '병화 → 경금 = 편관 (화극금, 음양 동일)',
        symbol: '압박, 시련, 권력, 책임',
        summary: '단련의 시기, 위기가 곧 기회가 되는 해입니다.',
        nature: '경금은 날것의 강함 그 자체입니다. 그 자체로 가치 있지만, 어떻게 다듬어지느냐(화의 단련, 수의 정화)에 따라 진가가 드러납니다. 상황 대처 능력이 뛰어나고 맺고 끊음이 명확합니다. 결단력이 크며, 겉으로는 냉정하지만 속은 따뜻합니다. 마인드가 장군감이고 대범하며, 질서, 원칙, 준법 정신과 정의감이 강합니다. 이 단단함은 확신과 신념에서 옵니다. 다만 자기 세계가 너무 단단해 타협을 꺼리고 융통성이 부족해질 수 있습니다.',
        sipsungDesc: '편관은 책임감과 통제력을 기반으로 합니다. 결단력, 경쟁심, 도전성, 개혁성과 관련이 있으며 직접적이고 진취적입니다. "명예", "관직", "자유" 중에서도 배짱 있고 위협적인 방향과 연결됩니다. 대인관계를 중시하고 명예욕이 있으며, 책임과 권한을 원합니다. 금의 입장에서 화는 "나를 녹이는" 기운입니다. 약간의 마모와 수고로움이 따르지만, 이 과정을 통해 더 단단하고 날카로운 검으로 거듭날 수 있습니다.',
        combination: [
          '사회적 책임과 압박 증가: 직장이나 조직에서 무거운 역할이 부여됩니다. 경금의 의협심과 편관의 책임감이 결합하여 중요한 임무를 맡게 되지만 그만큼 부담도 큽니다. 회사나 소속 단체에서 실질적으로 행사할 수 있는 권한과 권리가 강화됩니다.',
          '단련의 시기: 경금은 "화의 단련"을 통해 진가가 드러납니다. 병오년의 강한 화 기운은 경금을 녹이는 것이 아니라, 날카롭게 만드는 과정입니다. 힘들지만 성장합니다. 올해는 단련의 기간이며, 돈보다 명예를 추구하게 됩니다.',
          '스트레스와 피로 누적: 자기 소모가 큰 시기입니다. 삶의 가치를 다소 포기하고, 일의 가치를 중요시 여깁니다. 바쁜 한 해가 될 것입니다. 경금의 대범함이 편관의 압박과 만나면, 무리해서라도 해내려는 경향이 생기고, 이것이 건강을 해칠 수 있습니다.'
        ],
        keywords: [
          { title: '실질적인 그룹과 체계성', desc: '오행에서 화(火)는 금(金)에게 직장 생활에서의 권력 확대를 의미합니다. 회사나 조직 내에서 실질적인 권한이 강화되고, 핵심 부서나 중요한 위치로 이동할 가능성이 높습니다. 프리랜서의 경우 안정적인 고객을 확보하게 됩니다. 시간을 더 체계적으로 관리하고, 업무 프로세스를 더 정돈되게 세팅할 수 있습니다.' },
          { title: '평소 못하던 일도 해낼 수 있는 시기', desc: '감당 못할 것 같던 프로젝트를 직접 추진하고 실행하게 됩니다. 이러한 경험들은 향후 사회생활에서 좋은 스펙이 됩니다. 여러 환경에서 경쟁할 수 있고, 기존의 단계를 벗어나 새로운 단계로 올라갈 절호의 기회입니다. 커리어가 완전히 바뀌기도 합니다.' },
          { title: '위기가 곧 기회', desc: '2025~2026년을 잘 버티고 나면 2027~2028년부터 자기만의 그룹이 생기고 팬덤이 생기며 새로운 수준의 커리어를 만들어갈 수 있습니다. 2026년은 문제 해결을 위해 근본을 더 깊이 다지는 해입니다. 시간이 지나면서 통찰력이나 판단의 면에서 점차 다듬어지고 날카로워집니다. 연애가 잘 되기도 하며, 인간관계에서 마음을 열고 소통하는 것이 중요합니다.' }
        ],
        flow: {
          '2026년': '힘든 일이 많아도 "단련의 기간"이라는 마인드 셋업이 가장 중요합니다. 확장보다 단련이 중요합니다.',
          '2027~2028년': '자기만의 그룹과 팬덤이 생기며 새로운 수준의 커리어를 만들어갑니다.'
        },
        advice: '도전을 피하지 말고 정면으로 맞서세요. 단, 건강관리는 필수입니다. 올해는 단련의 기간이므로 힘들어도 이겨내세요. 원래 잘하는 분야에서 더 집중해서 일을 하는 것이 중요합니다. 정신과 직관이 다시 활발해지는 시기이니, 인간관계에서 마음을 열고 소통하세요.'
      },
      신: {
        name: '신금(辛金) 일간',
        emoji: '💎',
        relation: '정관운(正官運)',
        relationDesc: '병화 → 신금 = 정관 (화극금, 음양 교차) + 병신합수(丙辛合)',
        symbol: '직장, 명예, 남편(여성), 실리 추구',
        summary: '명예와 실리 사이에서, 세상이 자신을 드러내게 하는 해입니다.',
        nature: '신금은 섬세하고 정교한 보석입니다. 거친 환경보다 정제된 환경에서 빛나며, 상황 판단에 따라 인생이 바뀝니다. 꼼꼼하고 치밀하며 자잘한 계획을 실제로 옮기는 실행력이 있습니다. 예민하지만 남의 고충을 파악해 섬세하게 챙기고 소소한 것을 돌봅니다. 깔끔하고 고급스러우며, 예리하고 귀족적입니다. 사람을 보는 기준이 정확하고 다소 엄격하여, 채널이 맞지 않으면 쉽게 마음을 열지 않습니다.',
        sipsungDesc: '정관은 책임감과 통제력을 기반으로 합니다. 체계성, 도덕성, 공정성, 책임감, 보수성, 준법정신과 관련있습니다. "명예", "관직", "자유" 중에서도 모범적이고 온화한 방향과 연결됩니다. 섬세한 감정과 명예 의식, 정의감이 있고, 의리를 중시하며 봉사 정신이 있습니다. 정관이 강하게 들어오면 사회 활동에서의 야망이 생기고, 자신을 드러내고 싶은 마음이 커집니다.',
        combination: [
          '관성이 재성으로 변화: 병신합수의 작용으로 관성이 재성으로 변합니다. 원래 신은 귀족적 성향을 띄는데 이 부분이 현실적 이익을 좇는 모습으로 변합니다. 명예와 실리 사이에서 갈등하지만, 결과적으로 실리를 우선시하게 됩니다. 정관의 책임감과 신금의 세밀함이 결합하여, 조직 내에서 신뢰를 얻을 수 있습니다.',
          '인연의 변화: 여성의 경우 좋은 인연이 찾아올 수 있으며, 남자의 경우 인연의 변화가 발생할 수 있습니다. 새로운 관계가 형성되거나 기존 관계가 변질될 수 있습니다. 결혼과 연애가 체감되기 시작합니다.',
          '세상이 자신을 드러낸다: 목 일간과 화 일간이 자신을 드러내는 것과는 다릅니다. 자신이 드러내고 싶어서 드러내는 게 아니라, 세상이 드러내게 합니다. 개인 취향이나 특기를 통해 뭔가 하고 싶은 사람이라면, 올해 모든 걸 드러내도 됩니다. 두려워할 필요 없습니다.'
        ],
        keywords: [
          { title: '사람과 이성', desc: '원래 신금 일간은 사람을 보는 눈이 정확하고 기준이 엄격하여 쉽게 마음을 열지 않습니다. 그러나 올해는 강한 화(火)가 들어오면서 평소보다 여유가 생기고, 다른 사람을 곁에 두려는 마음이 생깁니다. 연애와 결혼에 관해 여유가 생기고 기준이 낮아집니다. 자신이 먼저 관심을 표현하기도 하고, 관심을 받기도 합니다. 이는 이성뿐 아니라 모든 사람에게 해당합니다.' },
          { title: '자연스러운 유명세', desc: '자신만의 퍼포먼스가 있다면 그 기회를 통해 유명해지게 됩니다. 혼자 할 필요 없이 그룹이나 단체에서 친구들과 함께 해도 좋습니다. 콘텐츠로 만들어 올려도 좋고, 사회적인 활동을 해도 좋습니다. 경금 일간과 마찬가지로 직장 생활에서 본인의 권한이 커지기도 합니다.' },
          { title: '명예보다 실리', desc: '원래 명예를 중시하는 타입이지만 실리에 관심사를 두게 됩니다. 특히 금전 관리에 민감해져야 합니다. 이 시기에 재테크를 공부해보는 것도 좋습니다. 지금의 공부는 당장 사용되지 않더라도 3~4년 내로 사용될 가능성이 높습니다. 올해 계약이나 금전적인 부분에서 문턱이 낮아지면서 평소보다 느슨해질 수 있으니 주의하세요.' }
        ],
        flow: {
          특징: '여러모로 정신없는 해가 됩니다. 명예와 실리 사이에서 갈등하지만, 결과적으로 실리를 우선시하게 됩니다.',
          전략: '전략적으로, 머리를 써서 자신에게 맞는 스타일을 찾는 것이 중요합니다.'
        },
        advice: '좋은 기회를 놓치지 마세요. 책임감 있게 맡은 일을 하면 인정받습니다. 세상이 자신을 드러내게 하니, 두려워하지 말고 자신의 특기나 취향을 드러내세요. 다만 계약이나 금전 부분에서 느슨해지지 않도록 주의하세요.'
      },
      임: {
        name: '임수(壬水) 일간',
        emoji: '🌊',
        relation: '편재운(偏財運)',
        relationDesc: '임수 → 병화 = 편재 (수극화, 내가 극하는 것, 음양 동일)',
        symbol: '유동자금, 투자, 사업, 애인(남성)',
        summary: '욕망만큼 성과가 커지는 해, 돈에 냉정해져야 합니다.',
        nature: '임수는 어디든 흐르고 어떤 상황에도 길을 찾는 물입니다. 정면 대결보다 받아들이며 흘려보내는 지혜가 있고, 적응력과 포용력이 돋보입니다. 총명하고 지혜로우며 심사숙고하고 타인을 배려합니다. 기획력, 계획성, 치밀함이 있고, 식견과 배움 의욕이 큽니다. 도량이 넓고 통 크게 모두를 포용하며 교감력으로 관계를 잘 형성하지만, 넓은 만큼 깊은 관계는 꺼립니다. 다만 인내심이 약하고 변덕이 심해 마무리가 약해질 수 있습니다.',
        sipsungDesc: '편재는 개방적이고 역동적입니다. 다양한 사회적 접촉에서 유연하게 반응하고, 환경 적응력과 주변 사물 활용 능력이 뛰어납니다. "비정기 돈", "뭉칫돈", "대인관계 - 넓고 얕음"과 연결됩니다. 눈치가 빠르고 분위기를 잘 읽으며, 유머 감각이 있습니다. 융통성과 요령, 아이디어, 실천력이 있고, 과정보다는 결과물을 더 중시합니다.',
        combination: [
          '재물 기회 증가: 돈이 들어오지만 나가기도 쉽습니다. 임수의 넓은 포용력과 편재의 개방성이 결합하여, 다양한 경로로 돈이 들어오지만 그만큼 지출도 늘어납니다.',
          '투기성 손실 주의: 들어오는 만큼 나간다는 마인드가 필요합니다. 편재의 결과 중심적 성향이 임수의 기획력과 만나면 투자에 관심이 생기지만, 마무리가 약한 임수의 특성상 손실로 이어질 수 있습니다.',
          '활동적 재물운: 움직여야 돈이 따라옵니다. 임수의 흐르는 특성과 편재의 역동성이 결합하여, 가만히 있으면 기회가 오지 않고 적극적으로 움직여야 합니다.',
          '대인관계 확장: 편재의 넓은 인간관계와 임수의 매력 발산이 결합하여 많은 사람들과 교류하게 됩니다. 단, 임수 특유의 깊은 관계 기피 성향으로 피상적 관계에 머물 수 있습니다.'
        ],
        keywords: [
          { title: '욕망만큼 성과가 커지는 해', desc: '2026년은 임수에게 성과·실적·결과를 강하게 만들어내는 시기입니다. 기회가 큰 만큼 우선순위를 분명히 하고, 원하는 목표를 명확히 잡는 게 중요합니다. "내가 못 한다고 단정했던 영역"을 시도하고 실행하는 방향으로 마음이 바뀌기 쉽습니다. 업계에서 잘하는 사람의 방식과 구조를 관찰·분석하고, 내 스타일로 변환해 쌓아가세요. 시장이 반응하는 것을 먼저 시험해보고, 그 위에 내 언어를 얹는 방식이 유리합니다.' },
          { title: '돈에 대해 더 냉정해져야 한다', desc: '2026~2027년에 화 기운이 강해지며 임수에게 "돈" 테마가 선명해집니다. 2026년 하반기에 수익·현금흐름을 잡는 힘이 더 강해지지만, 2026년 하반기 말~2027년 상반기에는 합작·투자·지출에서 분위기에 휩쓸려 돈을 쉽게 내놓는 위험이 커집니다. 수익성/사업성을 기준으로 판단하세요. 상반기는 시장조사, 수익모델 설계, 포트폴리오 정비에 집중하고, 하반기는 효율·수익을 올리는 학습에 투자하세요.' },
          { title: '감정·체력 관리가 성패를 좌우', desc: '임수에게 병오의 기운은 사건이 갑자기 튀고(예고 없는 변수), 해결 방식은 정공법이 유리한 흐름으로 작동합니다. 표정·말·감정이 그대로 드러나기 쉬워 표정관리가 중요합니다. 체력 소진이 누적되면 운이 좋아도 성과를 못 챙깁니다. 특히 5~9월(양력) 전후로 건강 관리가 중요합니다(신장/방광 관련).' }
        ],
        advice: '무리한 투자를 자제하고, 안정적 수입원 확보가 우선입니다. 결단력, 자제력, 판단력을 기르세요. 협업 감각을 살려 목(木) 많은 사람과 도모하고, 금(金) 많은 사람과 학습하면 유리합니다. 돈 관련 결정은 냉정하게 하세요. 임자일주의 경우 자오충(子午冲)으로 가정사에 더 많은 관심이 필요합니다.'
      },
      계: {
        name: '계수(癸水) 일간',
        emoji: '💧',
        relation: '정재운(正財運)',
        relationDesc: '계수 → 병화 = 정재 (수극화, 내가 극하는 것, 음양 교차)',
        symbol: '안정적 수입, 저축, 아내(남성)',
        summary: '돈은 조직과 사람을 통해 커지는 해, 실속 있는 성과를 거둡니다.',
        nature: '계수는 형체 없이 스며드는 기운입니다. 가장 포착하기 어렵고 신비로운 일간으로, 눈에 보이지 않는 곳에서 연결하고 순환시킵니다. 온화하고 여린 감성이 있으며, 부탁을 거절하기 어렵고 인정을 중시합니다. 개척보다는 외부 상황에 순응하는 적응력과 유연함이 강합니다. 지혜와 통찰력, 상상력이 탁월하며, 형이상학과 영성 분야에 대한 관심이 깊습니다. 다만 의심과 우울에 빠지기 쉬우나 희망을 품고 삽니다.',
        sipsungDesc: '정재는 치밀성, 절제, 계획성, 근면성, 검소함을 뜻합니다. 신중하고 논리적이며 일관적이고, 내면의 규범과 통제를 우선시합니다. "정기적인 돈", "고정적 수입", "대인관계 - 깊고 좁음"과 연결됩니다. 성향은 안정적이고 객관적이며 현실적입니다. 검소하고 저축을 중시하며, 대인관계는 좁지만 깊습니다. 정재는 10개의 십신 중 가장 건실한 재물 형태입니다.',
        combination: [
          '안정적 수입 증가: 꾸준히 쌓이는 재물입니다. 계수의 순응적 적응력과 정재의 계획성이 결합하여, 무리하지 않으면서도 착실하게 재물이 모입니다.',
          '실속 있는 성과: 화려하진 않지만 알찬 결과입니다. 계수의 신비로운 특성이 정재의 검소함과 만나, 겉으로 드러나지 않지만 내실 있는 성취를 이룹니다.',
          '감정 통제력 상승: 정재의 절제와 감정 통제가 계수의 우울 경향을 다스려줍니다. 평소보다 감정적으로 안정되고, 현실적인 판단력이 좋아집니다.',
          '남성의 경우 배우자운 상승: 정재는 남성에게 아내를 의미하므로, 좋은 인연이 찾아올 수 있습니다. 계수의 포용력과 정재의 깊은 관계 성향이 결합하여, 진지한 만남이 가능합니다.'
        ],
        keywords: [
          { title: '돈은 조직·사람을 통해 커진다', desc: '계수는 "내가 단독으로 정면돌파"보다 조직 안에서 성과를 만들고 보상으로 연결하는 방식이 맞습니다. 승진, 인센티브, 프로젝트 성과, 포트폴리오를 통한 자리 이동이 유리합니다. "돈만 보고 달리기"보다 가치·성과·역할을 먼저 잡으면 돈이 결과로 따라오고, 그 흐름이 2027년 상반기에 더 선명해집니다. 투자 환경이 쉬워지는 만큼 FOMO와 과열 심리를 경계하고, 돈 욕망은 밖으로 과시하지 않는 편이 좋습니다.' },
          { title: '연락·인맥이 급격히 넓어진다', desc: '2026년에는 사람과 일정이 몰리기 쉽습니다(업무 연락, 약속, 관계 재접속). 중요한 건 선별입니다. 다만 장기적으로는 사람을 많이 확보해 두면 협업 기회가 생기기 쉽습니다. 외부 활동이 늘수록 내 시간이 줄어 심리적으로 고갈될 수 있으니, 의식적으로 회복 루틴이 필요합니다. 커리어 측면에서는 2026년을 출발점으로 4~5년 계획을 촘촘히 세우는 것이 유리합니다.' },
          { title: '실리와 건강을 챙겨서 가져가라', desc: '실리가 강하게 들어오는 해에는 욕망 조절이 중요합니다. 편법·불법·월권으로 돈을 잡으려 하면 크게 터질 수 있고, 명예 리스크가 커집니다. 상반기에는 번아웃 가능성이 있어 특히 컨디션 관리가 필요합니다. 대외적으로는 "이상한 단체/그룹에 엮이는 것"을 조심하세요. 돈 거래(빌려주기/받기), 공동자금 이슈는 꼼꼼히 확인해야 합니다.' }
        ],
        advice: '저축과 투자를 병행하고, 과시형 소비를 자제하세요. 성실함이 보상받는 해입니다. 계수의 신비로운 매력을 정재의 안정성으로 포장하면 좋은 결과를 얻습니다. 한곳에서 반복되는 일은 정신을 시들게 하므로 우울증을 조심하고, 무리하지 않고 꾸준히 모으면 재물이 쌓입니다.'
      }
    };

    // 사용자의 일간에 따른 2026년 해석
    const dayGanName = CHEONGAN[dayStemIdx];
    const ilgan2026 = ILGAN_2026_INTERPRETATION[dayGanName];

    if (ilgan2026) {
      html += `<div style="margin-top:16px;">`;

      // 헤더
      html += `<div style="margin-bottom:12px;">`;
      html += `<span style="font-weight:700;font-size:1.2rem;color:var(--text);">${ilgan2026.name}의 2026년</span>`;
      html += `<span style="display:block;font-size:0.85rem;color:#cc3333;font-weight:600;margin-top:4px;">${ilgan2026.relation}</span>`;
      html += `</div>`;

      // 관계 및 상징
      if (ilgan2026.relationDesc || ilgan2026.symbol) {
        html += `<div style="background:rgba(0,0,0,0.03);padding:10px 12px;border-radius:8px;margin-bottom:12px;">`;
        if (ilgan2026.relationDesc) html += `<p style="color:var(--text-secondary);font-size:0.85rem;margin:0 0 4px 0;"><strong>관계:</strong> ${ilgan2026.relationDesc}</p>`;
        if (ilgan2026.symbol) html += `<p style="color:var(--text-secondary);font-size:0.85rem;margin:0;"><strong>상징:</strong> ${ilgan2026.symbol}</p>`;
        html += `</div>`;
      }

      // 요약
      html += `<p style="font-weight:600;color:var(--text);font-size:1.05rem;margin:0 0 12px 0;">${ilgan2026.summary}</p>`;

      // 일간 본질
      if (ilgan2026.nature) {
        html += `<div style="margin-bottom:14px;">`;
        html += `<div style="font-weight:600;color:var(--text);font-size:0.95rem;margin-bottom:6px;">${ilgan2026.name.split('(')[0]}의 본질</div>`;
        html += `<p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.7;margin:0;">${ilgan2026.nature}</p>`;
        html += `</div>`;
      }

      // 십성의 해
      if (ilgan2026.sipsungDesc) {
        html += `<div style="margin-bottom:14px;">`;
        html += `<div style="font-weight:600;color:var(--text);font-size:0.95rem;margin-bottom:6px;">${ilgan2026.relation.replace('운', '')}의 해</div>`;
        html += `<p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.7;margin:0;">${ilgan2026.sipsungDesc}</p>`;
        html += `</div>`;
      }

      // 조합 설명
      if (ilgan2026.combination && ilgan2026.combination.length > 0) {
        html += `<div style="margin-bottom:14px;">`;
        html += `<div style="font-weight:600;color:var(--text);font-size:0.95rem;margin-bottom:8px;">${ilgan2026.name.split('(')[0]} + ${ilgan2026.relation.replace('운', '')} 조합</div>`;
        html += `<ul style="margin:0 0 0 18px;padding:0;color:var(--text-secondary);font-size:0.9rem;line-height:1.8;">`;
        for (const c of ilgan2026.combination) {
          html += `<li style="margin-bottom:6px;">${c}</li>`;
        }
        html += `</ul></div>`;
      }

      // 3가지 핵심 키워드
      if (ilgan2026.keywords && ilgan2026.keywords.length > 0) {
        html += `<div style="margin-bottom:14px;">`;
        html += `<div style="font-weight:600;color:var(--text);font-size:0.95rem;margin-bottom:10px;">2026년 3가지 핵심 키워드</div>`;
        for (let i = 0; i < ilgan2026.keywords.length; i++) {
          const kw = ilgan2026.keywords[i];
          html += `<div style="background:rgba(0,0,0,0.03);padding:12px;border-radius:8px;margin-bottom:8px;">`;
          html += `<div style="font-weight:600;color:#cc3333;font-size:0.9rem;margin-bottom:6px;">${i + 1}. ${kw.title}</div>`;
          html += `<p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.7;margin:0;">${kw.desc}</p>`;
          html += `</div>`;
        }
        html += `</div>`;
      }

      // 운세 흐름
      if (ilgan2026.flow) {
        html += `<div style="margin-bottom:14px;">`;
        html += `<div style="font-weight:600;color:var(--text);font-size:0.95rem;margin-bottom:8px;">운세 흐름</div>`;
        html += `<div style="display:grid;gap:8px;">`;
        for (const [key, val] of Object.entries(ilgan2026.flow)) {
          html += `<div style="background:rgba(74,144,226,0.08);padding:10px 12px;border-radius:8px;border-left:3px solid #4a90e2;">`;
          html += `<span style="font-weight:600;color:#4a90e2;font-size:0.85rem;">${key}</span>`;
          html += `<p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.6;margin:4px 0 0 0;">${val}</p>`;
          html += `</div>`;
        }
        html += `</div></div>`;
      }

      // 기존 구조 호환 (good, caution이 있는 경우)
      if (ilgan2026.good && ilgan2026.good.length > 0) {
        html += `<div style="margin-bottom:10px;"><span style="font-weight:600;color:#2d8a4e;font-size:0.9rem;">좋은 점</span>`;
        html += `<ul style="margin:6px 0 0 20px;color:var(--text-secondary);font-size:0.85rem;line-height:1.7;">`;
        for (const g of ilgan2026.good) {
          html += `<li>${g}</li>`;
        }
        html += `</ul></div>`;
      }

      if (ilgan2026.caution && ilgan2026.caution.length > 0) {
        html += `<div style="margin-bottom:10px;"><span style="font-weight:600;color:#c0392b;font-size:0.9rem;">주의할 점</span>`;
        html += `<ul style="margin:6px 0 0 20px;color:var(--text-secondary);font-size:0.85rem;line-height:1.7;">`;
        for (const c of ilgan2026.caution) {
          html += `<li>${c}</li>`;
        }
        html += `</ul></div>`;
      }

      // 조언
      if (ilgan2026.advice) {
        html += `<div style="margin-top:14px;">`;
        html += `<span style="font-weight:600;color:#27ae60;font-size:0.9rem;">2026년 핵심 조언</span>`;
        html += `<p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.7;margin:8px 0 0 0;">${ilgan2026.advice}</p>`;
        html += `</div>`;
      }

      html += `</div>`;
    }

    // 현재 대운 정보 (있는 경우)
    if (daeunData && daeunData.current) {
      const currDaeun = daeunData.current;
      const currDaeunName = currDaeun.ganji || '';
      const currDaeunAge = currDaeun.startAge || 0;
      const currDaeunEndAge = currDaeun.endAge || (currDaeunAge + 9);
      html += `<div class="bti-unique-box" style="margin-top:16px;">`;
      html += `<span class="bti-unique-label">🔮 현재 대운</span>`;
      html += `<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">`;
      html += `<span style="font-size:1.5rem;font-weight:700;color:var(--accent)">${currDaeunName}</span>`;
      html += `<span style="color:var(--text-dim);font-size:0.9rem;">(${currDaeunAge}세 ~ ${currDaeunEndAge}세)</span>`;
      html += `</div>`;
      html += `<p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.5;margin:8px 0 0 0;">대운은 10년 단위의 큰 운입니다. 세운(2026년)과 대운이 함께 작용하여 한 해의 운세가 결정됩니다.</p>`;
      html += `</div>`;
    }

    html += `</div>`;

    // AI에게 물어보기 섹션
    html += `<div class="bti-card bti-card-ai"><div class="bti-section-title">🤖 AI에게 물어보기</div>`;
    html += `<p class="bti-ai-desc">아래 사주 정보를 ChatGPT, Claude 등 AI에게 전달하면 더 심층적인 해석을 받을 수 있습니다.</p>`;
    html += `<div class="bti-ai-actions"><button class="bti-ai-copy" id="bti-copy-btn">📋 복사하기</button></div>`;
    html += `<div class="bti-ai-data">`;
    html += `<textarea id="chatgpt-prompt" readonly rows="16">로딩 중...</textarea>`;
    html += `</div></div>`;

    // 공유 섹션
    html += `<div class="bti-share-card">`;
    html += `<div class="bti-share-title">📤 결과 공유하기</div>`;
    html += `<div class="bti-share-buttons">`;
    html += `<button class="bti-share-btn bti-share-kakao" id="bti-share-kakao"><span class="bti-share-icon">💬</span><span>카카오톡</span></button>`;
    html += `<button class="bti-share-btn bti-share-twitter" id="bti-share-twitter"><span class="bti-share-icon">𝕏</span><span>트위터</span></button>`;
    html += `<button class="bti-share-btn bti-share-link" id="bti-share-link"><span class="bti-share-icon">🔗</span><span>링크복사</span></button>`;
    html += `</div></div>`;

    html += `</div>`; // close bti-wrap

    setInnerHTML(this.container, html);

    // ChatGPT 프롬프트 생성 및 이벤트 바인딩 (인라인 핸들러 제거)
    setTimeout(() => {
      const promptEl = document.getElementById('chatgpt-prompt');
      const copyBtn = document.getElementById('bti-copy-btn');

      if (promptEl) {
        const prompt = generateChatGPTText(result, hasTime, ohengData, yongsinData, this._gender, this._daeunData);
        promptEl.value = prompt;

        // 복사 버튼 이벤트 바인딩
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(prompt).then(() => {
              copyBtn.textContent = '✓ 복사됨';
              copyBtn.classList.add('copied');
              setTimeout(() => {
                copyBtn.textContent = '📋 프롬프트 복사';
                copyBtn.classList.remove('copied');
              }, 2000);
            }).catch(() => alert('복사 실패'));
          });
        }
      }

      // 공유 기능 이벤트 바인딩
      const shareTitle = '연세사주 - 나의 사주 결과';
      const shareDesc = ilgan ? `${ilgan.emoji} ${ilgan.name} - ${ilgan.title}` : '사주 분석 결과를 확인해보세요!';
      const shareUrl = window.location.href;

      // 카카오톡 공유 버튼
      const kakaoBtn = document.getElementById('bti-share-kakao');
      if (kakaoBtn) {
        kakaoBtn.addEventListener('click', () => {
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
              const kakaoUrl = `https://story.kakao.com/share?url=${encodeURIComponent(shareUrl)}`;
              window.open(kakaoUrl, '_blank', 'width=600,height=400');
            }
          } else {
            const kakaoUrl = `https://story.kakao.com/share?url=${encodeURIComponent(shareUrl)}`;
            window.open(kakaoUrl, '_blank', 'width=600,height=400');
          }
        });
      }

      // 트위터(X) 공유 버튼
      const twitterBtn = document.getElementById('bti-share-twitter');
      if (twitterBtn) {
        twitterBtn.addEventListener('click', () => {
          const text = `${shareTitle}\n${shareDesc}`;
          const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
          window.open(twitterUrl, '_blank', 'width=600,height=400');
        });
      }

      // 링크 복사 버튼
      const linkBtn = document.getElementById('bti-share-link');
      if (linkBtn) {
        linkBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(shareUrl).then(() => {
            const originalText = linkBtn.innerHTML;
            linkBtn.innerHTML = '✓ 복사됨!';
            linkBtn.style.background = '#2d8a4e';
            setTimeout(() => {
              linkBtn.innerHTML = originalText;
              linkBtn.style.background = '';
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
              const originalText = linkBtn.innerHTML;
              linkBtn.innerHTML = '✓ 복사됨!';
              linkBtn.style.background = '#2d8a4e';
              setTimeout(() => {
                linkBtn.innerHTML = originalText;
                linkBtn.style.background = '';
              }, 2000);
            } catch (e) {
              alert('링크 복사에 실패했습니다.');
            }
            document.body.removeChild(textArea);
          });
        });
      }
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
      todayEnergyContent: $id('sidebar-today-energy-content')
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
    const today = getTodayGanji();
    const dayStemIdx = result.idxs.day % 10;
    const todayStemIdx = today.stemIdx;

    // 오늘 천간과 일간의 십성 관계
    const tg = getTenGod(dayStemIdx, todayStemIdx);

    const fortuneInfo = {
      비견: { title: '동료운', desc: '협력과 경쟁이 공존하는 날', luck: 60 },
      겁재: { title: '경쟁운', desc: '자신감이 높아지지만 충동에 주의', luck: 50 },
      식신: { title: '행복운', desc: '여유롭고 창의력이 넘치는 날', luck: 80 },
      상관: { title: '표현운', desc: '감정 표현이 활발한 날', luck: 65 },
      편재: { title: '재물운', desc: '투자와 거래에 유리한 날', luck: 75 },
      정재: { title: '안정운', desc: '꾸준한 수입이 기대되는 날', luck: 70 },
      편관: { title: '변화운', desc: '급변하는 상황에 대처하는 날', luck: 55 },
      정관: { title: '성취운', desc: '목표 달성과 인정받는 날', luck: 85 },
      편인: { title: '학습운', desc: '새로운 것을 배우기 좋은 날', luck: 70 },
      정인: { title: '지원운', desc: '도움을 받거나 주는 날', luck: 75 }
    };

    const info = fortuneInfo[tg] || fortuneInfo['비견'];
    const luckColor = info.luck >= 70 ? '#2d8a4e' : info.luck >= 50 ? '#c9a55a' : '#c75a5a';

    // 랜딩 페이지 히어로 인라인 운세 업데이트
    const lfiResult = $id('lfi-result');
    const lfiPlaceholder = $id('lfi-placeholder');
    if (lfiResult) {
      lfiResult.innerHTML = `${tg} · ${info.title} — ${info.desc}<span class="lfi-score" style="color:${luckColor}">${info.luck}점</span>`;
      lfiResult.style.display = '';
      if (lfiPlaceholder) lfiPlaceholder.style.display = 'none';
    }
  }

  /**
   * 사이드바 숨기기
   */
  hide() {
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
