/**
 * 연세사주 - 인물 DB 탭 모듈
 * 인물 목록 표시, 검색, 선택 시 사주 계산
 * 고급 정렬/필터 기능 포함
 */

import { dbManager, appState } from '../core/state.js';
import { SajuCalculator, DaeunCalculator } from '../core/calculator.js';
import { CHEONGAN, JIJI, CHEONGAN_HANJA, JIJI_HANJA, CHEONGAN_OHENG, JIJI_OHENG, CHEONGAN_EUMYANG, JIJI_EUMYANG, YUKSHIP_GAPJA, UI } from '../core/constants.js';
import { $id, setInnerHTML } from '../utils/dom.js';

// 정렬 옵션 정의
const SORT_OPTIONS = [
  { key: 'name', label: '이름' },
  { key: 'date', label: '날짜' },
  { key: 'gender', label: '성별' },
  { key: 'ds', label: '일간', type: 'stem' },
  { key: 'db', label: '일지', type: 'branch' },
  { key: 'ms', label: '월간', type: 'stem' },
  { key: 'mb', label: '월지', type: 'branch' },
  { key: 'ys', label: '년간', type: 'stem' },
  { key: 'yb', label: '년지', type: 'branch' }
];

// 천간/지지 리스트 (필터용)
const STEM_LIST = CHEONGAN.map((h, i) => ({ idx: i, hangul: h, hanja: CHEONGAN_HANJA[i] }));
const BRANCH_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1]; // 인묘진사오미신유술해자축
const BRANCH_LIST = BRANCH_ORDER.map(i => ({ idx: i, hangul: JIJI[i], hanja: JIJI_HANJA[i] }));

// 지지 정렬 순서 함수
function branchSortIdx(bi) {
  return bi < 0 ? -1 : (bi - 2 + 12) % 12;
}

export class CelebPickerRenderer {
  constructor() {
    this.currentDbType = 'celebrity';
    this.searchQuery = '';
    this.selectedIndex = -1;
    // 정렬/필터 상태
    this.sortStack = [];
    this.filters = {}; // { key: Set of indices }
    this.sajuCache = new Map();
    // 페이지네이션 상태
    this.currentPage = 1;
    this.itemsPerPage = 20;
    // 로그인 상태
    this.loggedInUser = localStorage.getItem('db_logged_user') || null;
    // SNS 로그인 상태 (google, kakao, naver)
    this.snsUser = JSON.parse(localStorage.getItem('sns_user') || 'null');
  }

  /**
   * 초기화
   */
  init() {
    this._setupEventListeners();
    this._renderSortChips();
    this._renderList();
    this._updateStats();
    this._updateLoginUI();
  }

  /**
   * 이벤트 리스너 설정
   */
  _setupEventListeners() {
    // 검색 입력
    const searchInput = $id('db-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.currentPage = 1; // 검색 시 첫 페이지로
        this._renderList();
      });
    }

    // DB 타입 토글
    const toggleBtns = document.querySelectorAll('#db-type-toggle .db-type-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toggleBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        this.currentDbType = btn.dataset.type;
        this.currentPage = 1; // DB 변경 시 첫 페이지로
        this._updateLoginUI();
        this._renderList();
        this._updateStats();
      });
    });

    // 로그인 버튼 (헤더)
    const loginBtn = $id('btn-db-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const notice = $id('db-login-notice');
        if (notice) {
          notice.style.display = notice.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    // 로그인 제출 버튼
    const loginSubmitBtn = $id('btn-db-login-submit');
    if (loginSubmitBtn) {
      loginSubmitBtn.addEventListener('click', () => this._handleLogin());
    }

    // 엔터키 로그인
    const pwdInput = $id('db-password');
    if (pwdInput) {
      pwdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this._handleLogin();
      });
    }

    // 인물 추가 버튼
    const addBtn = $id('btn-add-person');
    if (addBtn) {
      addBtn.addEventListener('click', () => this._showAddModal());
    }

    // 내보내기 버튼
    const exportBtn = $id('btn-export-db');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => dbManager.exportPersonalDb());
    }

    // 가져오기 버튼
    const importBtn = $id('btn-import-db');
    if (importBtn) {
      importBtn.addEventListener('click', () => this._showImportDialog());
    }
  }

  /**
   * 사주 캐시 계산
   */
  _getSajuCache(person) {
    const key = `${person.year}-${person.month}-${person.day}-${person.hour || ''}`;
    if (this.sajuCache.has(key)) return this.sajuCache.get(key);

    try {
      const h = person.hour !== '' && person.hour !== undefined ? parseInt(person.hour) : 12;
      const hasTime = person.hour !== '' && person.hour !== undefined;
      const r = SajuCalculator.calculate(person.year, person.month, person.day, h, person.min || 0);
      const cache = {
        ds: r.idxs.day % 10,
        db: r.idxs.day % 12,
        ms: r.idxs.month % 10,
        mb: r.idxs.month % 12,
        ys: r.idxs.year % 10,
        yb: r.idxs.year % 12,
        hs: hasTime ? r.idxs.hour % 10 : -1,
        hb: hasTime ? r.idxs.hour % 12 : -1,
        hasTime
      };
      this.sajuCache.set(key, cache);
      return cache;
    } catch (e) {
      return { ds: -1, db: -1, ms: -1, mb: -1, ys: -1, yb: -1, hs: -1, hb: -1, hasTime: false };
    }
  }

  /**
   * 정렬 비교 함수
   */
  _compareVal(a, b, key, dir) {
    const m = dir === 'asc' ? 1 : -1;
    switch (key) {
      case 'name': return m * (a.name || '').localeCompare(b.name || '', 'ko');
      case 'date': return m * ((a.year * 10000 + a.month * 100 + a.day) - (b.year * 10000 + b.month * 100 + b.day));
      case 'gender': {
        const gO = { m: 0, f: 1, '': 2 };
        return m * ((gO[a.gender] || 2) - (gO[b.gender] || 2));
      }
      case 'ds': return m * (a._c.ds - b._c.ds);
      case 'db': return m * (branchSortIdx(a._c.db) - branchSortIdx(b._c.db));
      case 'ms': return m * (a._c.ms - b._c.ms);
      case 'mb': return m * (branchSortIdx(a._c.mb) - branchSortIdx(b._c.mb));
      case 'ys': return m * (a._c.ys - b._c.ys);
      case 'yb': return m * (branchSortIdx(a._c.yb) - branchSortIdx(b._c.yb));
      default: return 0;
    }
  }

  /**
   * 필터 통과 여부 확인
   */
  _passesFilters(c) {
    for (const key of Object.keys(this.filters)) {
      const set = this.filters[key];
      if (!set || set.size === 0) continue;
      const val = c._c[key];
      if (val < 0) return false;
      if (!set.has(val)) return false;
    }
    return true;
  }

  /**
   * 목록 렌더링
   */
  _renderList() {
    const container = $id('db-list');
    if (!container) return;

    // 개인 DB이고 로그인 안된 경우
    if (this.currentDbType === 'personal' && !this.loggedInUser) {
      container.innerHTML = `<div class="db-empty">
        🔐 개인 DB를 조회하려면 먼저 로그인해주세요.
      </div>`;
      this._updateStats(0);
      this._renderPagination(0, 0);
      return;
    }

    // 기본 검색 및 사주 캐시
    let list = dbManager.search(this.searchQuery, this.currentDbType)
      .map((c, i) => ({ ...c, _i: i, _c: this._getSajuCache(c) }));

    // 필터 적용
    const hasFilters = Object.keys(this.filters).some(k => this.filters[k] && this.filters[k].size > 0);
    if (hasFilters) {
      list = list.filter(c => this._passesFilters(c));
    }

    // 다중 정렬 적용
    list.sort((a, b) => {
      for (const s of this.sortStack) {
        const v = this._compareVal(a, b, s.key, s.dir);
        if (v !== 0) return v;
      }
      return 0;
    });

    // 전체 목록 저장 (페이지네이션용)
    this._fullList = list;
    const totalItems = list.length;
    const totalPages = Math.ceil(totalItems / this.itemsPerPage);

    // 현재 페이지가 범위를 벗어나면 조정
    if (this.currentPage > totalPages) this.currentPage = Math.max(1, totalPages);

    if (list.length === 0) {
      container.innerHTML = `<div class="db-empty">
        ${this.searchQuery || hasFilters ? '검색/필터 결과가 없습니다.' : '등록된 인물이 없습니다.'}
      </div>`;
      this._updateStats(0);
      this._renderPagination(0, 0);
      return;
    }

    // 페이지네이션 적용
    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = Math.min(startIdx + this.itemsPerPage, totalItems);
    const pageList = list.slice(startIdx, endIdx);

    let html = '';
    const colors = UI.COLORS.OHENG;

    pageList.forEach((person, idx) => {
      const globalIdx = startIdx + idx;
      const genderIcon = person.gender === 'm' ? '♂' : person.gender === 'f' ? '♀' : '';
      const genderText = person.gender === 'm' ? '남' : person.gender === 'f' ? '여' : '';
      const dateStr = `${person.year}.${String(person.month).padStart(2, '0')}.${String(person.day).padStart(2, '0')}`;
      const c = person._c;

      // 사주 명식 + 대운 표시
      let sajuHtml = '';
      let daeunHtml = '';

      if (c.ds >= 0) {
        // 십성 계산을 위한 일간 정보
        const dsi = c.ds;

        // 사주 명식 (시 일 월 년 순서)
        const pillars = [
          { label: '시', si: c.hasTime ? c.hs : -1, bi: c.hasTime ? c.hb : -1, valid: c.hasTime },
          { label: '일', si: c.ds, bi: c.db, valid: true, isDay: true },
          { label: '월', si: c.ms, bi: c.mb, valid: true },
          { label: '년', si: c.ys, bi: c.yb, valid: true }
        ];

        sajuHtml = '<div class="db-saju-grid">';
        // 라벨 행
        sajuHtml += '<div class="db-saju-labels">';
        for (const p of pillars) sajuHtml += `<span>${p.label}</span>`;
        sajuHtml += '</div>';
        // 천간 행
        sajuHtml += '<div class="db-saju-stems">';
        for (const p of pillars) {
          if (!p.valid) {
            sajuHtml += `<span class="db-stem-cell">?</span>`;
          } else {
            const oh = CHEONGAN_OHENG[p.si];
            const color = colors[oh];
            const tg = p.isDay ? '일간' : SajuCalculator.getTenGod(dsi, p.si);
            sajuHtml += `<span class="db-stem-cell" style="color:${color}">
              <span class="db-hanja">${CHEONGAN_HANJA[p.si]}</span>
              <span class="db-hangul">${CHEONGAN[p.si]}</span>
              <span class="db-sipsung">${tg}</span>
            </span>`;
          }
        }
        sajuHtml += '</div>';
        // 지지 행
        sajuHtml += '<div class="db-saju-branches">';
        for (const p of pillars) {
          if (!p.valid) {
            sajuHtml += `<span class="db-branch-cell">?</span>`;
          } else {
            const oh = JIJI_OHENG[p.bi];
            const color = colors[oh];
            const yy = JIJI_EUMYANG[p.bi];
            sajuHtml += `<span class="db-branch-cell" style="color:${color}">
              <span class="db-hanja">${JIJI_HANJA[p.bi]}</span>
              <span class="db-hangul">${JIJI[p.bi]}</span>
              <span class="db-yy">${yy}</span>
            </span>`;
          }
        }
        sajuHtml += '</div>';
        sajuHtml += '</div>';

        // 대운 계산
        try {
          const h = person.hour !== '' && person.hour !== undefined ? parseInt(person.hour) : 12;
          const result = SajuCalculator.calculate(person.year, person.month, person.day, h, person.min || 0);
          result.input = { year: person.year, month: person.month, day: person.day, hour: h, minute: person.min || 0 };
          const daeunData = DaeunCalculator.calculate(result, person.gender === 'm');
          if (daeunData && daeunData.list && daeunData.list.length > 0) {
            const currentYear = new Date().getFullYear();
            const currentDaeun = daeunData.list.find(d => d.calYear <= currentYear && d.calYear + 10 > currentYear) || daeunData.list[0];
            if (currentDaeun) {
              const dIdx = currentDaeun.idx;
              const dSi = dIdx % 10;
              const dBi = dIdx % 12;
              const dOhS = CHEONGAN_OHENG[dSi];
              const dOhB = JIJI_OHENG[dBi];
              daeunHtml = `<div class="db-daeun-box">
                <div class="db-daeun-label">대운 ${currentDaeun.age}세~</div>
                <span class="db-daeun-stem" style="color:${colors[dOhS]}">${CHEONGAN_HANJA[dSi]}</span>
                <span class="db-daeun-branch" style="color:${colors[dOhB]}">${JIJI_HANJA[dBi]}</span>
              </div>`;
            }
          }
        } catch (e) { /* 무시 */ }
      }

      html += `<div class="db-person-card db-card-clickable" data-index="${globalIdx}">
        <div class="db-card-info">
          <div class="db-person-header">
            <span class="db-person-name">${person.name}</span>
            <span class="db-person-gender">${genderIcon} ${genderText}</span>
          </div>
          <div class="db-person-date">${dateStr}</div>
          ${person.note ? `<div class="db-person-note">${person.note}</div>` : ''}
          ${this.currentDbType === 'personal' && this.loggedInUser ? `<div class="db-card-actions"><button class="btn-db-delete" data-index="${globalIdx}">삭제</button></div>` : ''}
        </div>
        <div class="db-card-saju">${sajuHtml}</div>
        <div class="db-card-daeun">${daeunHtml}</div>
      </div>`;
    });

    container.innerHTML = html;
    this._updateStats(totalItems);
    this._renderPagination(totalItems, totalPages);

    // 카드 전체 클릭으로 사주 보기 + 궁합 상대 설정
    container.querySelectorAll('.db-card-clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        // 버튼 클릭 시 제외
        if (e.target.classList.contains('btn-db-delete')) return;
        const idx = parseInt(card.dataset.index);
        this._selectPerson(list[idx]);
      });
    });

    container.querySelectorAll('.btn-db-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        if (confirm(`'${list[idx].name}'을(를) 삭제하시겠습니까?`)) {
          dbManager.removePerson(list[idx]._i, 'personal');
          this._renderList();
        }
      });
    });
  }

  /**
   * 페이지네이션 렌더링
   */
  _renderPagination(totalItems, totalPages) {
    const container = $id('db-pagination');
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '<div class="db-pagination-inner">';

    // 이전 버튼
    html += `<button class="db-page-btn${this.currentPage === 1 ? ' disabled' : ''}" data-page="prev" ${this.currentPage === 1 ? 'disabled' : ''}>‹</button>`;

    // 페이지 번호들
    const maxVisible = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      html += `<button class="db-page-btn" data-page="1">1</button>`;
      if (startPage > 2) html += `<span class="db-page-ellipsis">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="db-page-btn${i === this.currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="db-page-ellipsis">...</span>`;
      html += `<button class="db-page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    // 다음 버튼
    html += `<button class="db-page-btn${this.currentPage === totalPages ? ' disabled' : ''}" data-page="next" ${this.currentPage === totalPages ? 'disabled' : ''}>›</button>`;

    html += '</div>';
    container.innerHTML = html;

    // 페이지 버튼 이벤트
    container.querySelectorAll('.db-page-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'prev') {
          this.currentPage = Math.max(1, this.currentPage - 1);
        } else if (page === 'next') {
          this.currentPage = Math.min(totalPages, this.currentPage + 1);
        } else {
          this.currentPage = parseInt(page);
        }
        this._renderList();
      });
    });
  }

  /**
   * 통계 업데이트
   */
  _updateStats(filteredCount = null) {
    const totalEl = $id('db-total-count');
    const filteredEl = $id('db-filtered-info');

    const allList = dbManager.getAll(this.currentDbType);

    if (totalEl) {
      totalEl.textContent = allList.length;
    }

    if (filteredEl) {
      if (filteredCount !== null && filteredCount !== allList.length) {
        filteredEl.textContent = `(${filteredCount}명 표시)`;
      } else {
        filteredEl.textContent = '';
      }
    }
  }

  /**
   * 정렬 토글
   */
  _sortToggle(key) {
    const idx = this.sortStack.findIndex(s => s.key === key);
    if (idx === -1) {
      this.sortStack.push({ key, dir: 'asc' });
    } else if (this.sortStack[idx].dir === 'asc') {
      this.sortStack[idx].dir = 'desc';
    } else {
      this.sortStack.splice(idx, 1);
      delete this.filters[key];
    }
    this._renderSortChips();
    this._renderList();
  }

  /**
   * 필터 토글
   */
  _filterToggle(key, valIdx) {
    if (!this.filters[key]) this.filters[key] = new Set();
    if (this.filters[key].has(valIdx)) this.filters[key].delete(valIdx);
    else this.filters[key].add(valIdx);
    if (this.filters[key].size === 0) delete this.filters[key];
    this.currentPage = 1; // 필터 변경 시 첫 페이지로
    this._renderSortChips();
    this._renderList();
  }

  /**
   * 정렬 칩 렌더링
   */
  _renderSortChips() {
    const wrap = $id('db-sort-wrap');
    const filterEl = $id('db-filter-rows');
    const activeEl = $id('db-sort-active');
    if (!wrap) return;

    // 정렬 칩
    let html = '';
    for (const opt of SORT_OPTIONS) {
      const si = this.sortStack.findIndex(s => s.key === opt.key);
      const active = si >= 0;
      const dir = active ? this.sortStack[si].dir : '';
      const arrow = dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '';
      const pri = active ? (si + 1) : '';
      const fCount = this.filters[opt.key] ? this.filters[opt.key].size : 0;
      html += `<span class="db-sort-chip${active ? ' active' : ''}" data-key="${opt.key}">`;
      if (active) html += `<span class="pri">${pri}</span>`;
      html += opt.label;
      if (active) html += `<span class="dir">${arrow}</span>`;
      if (fCount) html += `<span style="margin-left:2px;font-size:0.6rem;opacity:0.8">(${fCount})</span>`;
      html += `</span>`;
    }
    wrap.innerHTML = html;

    // 칩 클릭 이벤트
    wrap.querySelectorAll('.db-sort-chip').forEach(chip => {
      chip.addEventListener('click', () => this._sortToggle(chip.dataset.key));
    });

    // 필터 행 (기둥 정렬이 활성화된 경우만)
    if (filterEl) {
      let fhtml = '';
      for (const s of this.sortStack) {
        const opt = SORT_OPTIONS.find(o => o.key === s.key);
        if (!opt || !opt.type) continue;
        const items = opt.type === 'stem' ? STEM_LIST : BRANCH_LIST;
        const activeSet = this.filters[s.key] || new Set();
        fhtml += `<div class="db-filter-row"><span class="db-filter-row-label">${opt.label}</span>`;
        for (const item of items) {
          const on = activeSet.has(item.idx);
          fhtml += `<span class="db-fchip${on ? ' on' : ''}" data-key="${s.key}" data-val="${item.idx}">${item.hangul}<span class="fhj">${item.hanja}</span></span>`;
        }
        fhtml += `</div>`;
      }
      filterEl.innerHTML = fhtml;

      // 필터 칩 클릭 이벤트
      filterEl.querySelectorAll('.db-fchip').forEach(chip => {
        chip.addEventListener('click', () => {
          this._filterToggle(chip.dataset.key, parseInt(chip.dataset.val));
        });
      });
    }

    // 활성 표시
    if (activeEl) {
      if (this.sortStack.length === 0 && Object.keys(this.filters).length === 0) {
        activeEl.innerHTML = '<span class="db-sort-active-label">정렬 없음</span>';
      } else {
        let ah = '';
        if (this.sortStack.length) {
          ah += '<span class="db-sort-active-label">정렬:</span>';
          this.sortStack.forEach((s, i) => {
            const lbl = SORT_OPTIONS.find(o => o.key === s.key)?.label || s.key;
            const arrow = s.dir === 'asc' ? '↑' : '↓';
            ah += `<span class="db-sort-active-chip">${i + 1}. ${lbl} ${arrow}</span>`;
          });
        }
        const fKeys = Object.keys(this.filters).filter(k => this.filters[k] && this.filters[k].size > 0);
        if (fKeys.length) {
          ah += '<span class="db-sort-active-label" style="margin-left:6px">필터:</span>';
          for (const k of fKeys) {
            const opt = SORT_OPTIONS.find(o => o.key === k);
            const isStem = opt && opt.type === 'stem';
            const vals = [...this.filters[k]].map(i => isStem ? CHEONGAN[i] + CHEONGAN_HANJA[i] : JIJI[i] + JIJI_HANJA[i]).join(' ');
            ah += `<span class="db-sort-active-chip" style="background:#d4e8d0;color:#3a6634">${opt ? opt.label : k}: ${vals}</span>`;
          }
        }
        activeEl.innerHTML = ah;
      }
    }
  }

  /**
   * 인물 선택 시 사주 계산 + 궁합 상대 설정
   */
  _selectPerson(person) {
    try {
      const hour = person.hour !== '' && person.hour !== undefined ? parseInt(person.hour) : 12;
      const minute = person.min || 0;
      const hasTime = person.hour !== '' && person.hour !== undefined;

      const result = SajuCalculator.calculate(
        person.year,
        person.month,
        person.day,
        hour,
        minute
      );

      result.input = {
        year: person.year,
        month: person.month,
        day: person.day,
        hour,
        minute
      };

      const returnTab = window.__celebReturnTab || 'myeongshik';
      const isFromGunghap = returnTab === 'gunghap';

      if (isFromGunghap) {
        // 궁합 탭에서 왔으면: 상대방(person2)만 설정하고 자동 분석 실행
        if (window.__sajuApp && window.__sajuApp.gunghapRenderer) {
          window.__sajuApp.gunghapRenderer.setPartnerFromDb(person);
          // 자동으로 궁합 분석 실행
          setTimeout(() => {
            window.__sajuApp.gunghapRenderer.runAnalysis();
          }, 100);
        }
      } else {
        // 다른 탭에서 왔으면: 본인(person1)만 설정
        appState.setResult(result, hasTime);
        appState.setGender(person.gender);
      }

      // 탭 전환
      if (typeof window.switchTab === 'function') {
        window.switchTab(returnTab);
        window.__celebReturnTab = null; // 플래그 초기화

        // 스크롤 위치 조정
        setTimeout(() => {
          if (isFromGunghap) {
            // 궁합 탭: 본인 사주 계산기 위치로 스크롤
            const globalCalc = document.getElementById('global-calc');
            if (globalCalc) {
              globalCalc.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
          } else {
            // 다른 탭: 상단으로 스크롤
            window.scrollTo(0, 0);
          }
        }, 50);
      }

      // 알림
      const msg = isFromGunghap
        ? `${person.name}과(와)의 궁합을 분석합니다.`
        : `${person.name}의 사주를 불러왔습니다.`;
      this._showNotification(msg);

    } catch (error) {
      console.error('사주 계산 오류:', error);
      this._showNotification('사주 계산 중 오류가 발생했습니다.', 'error');
    }
  }

  /**
   * 로그인 처리
   */
  _handleLogin() {
    const username = $id('db-username')?.value?.trim();
    const password = $id('db-password')?.value;

    if (!username || !password) {
      this._showNotification('아이디와 비밀번호를 입력해주세요.', 'error');
      return;
    }

    // 간단한 로그인 검증 (실제로는 서버 인증 필요)
    // 여기서는 로컬스토리지에 저장된 사용자 데이터를 확인
    const storedUsers = JSON.parse(localStorage.getItem('db_users') || '{}');

    if (storedUsers[username] && storedUsers[username] === password) {
      this.loggedInUser = username;
      localStorage.setItem('db_logged_user', username);
      this._updateLoginUI();
      this._renderList();
      this._showNotification(`${username}님, 환영합니다!`);
    } else if (!storedUsers[username]) {
      // 새 사용자 등록
      storedUsers[username] = password;
      localStorage.setItem('db_users', JSON.stringify(storedUsers));
      this.loggedInUser = username;
      localStorage.setItem('db_logged_user', username);
      this._updateLoginUI();
      this._renderList();
      this._showNotification(`${username}님, 계정이 생성되었습니다!`);
    } else {
      this._showNotification('비밀번호가 일치하지 않습니다.', 'error');
    }
  }

  /**
   * 로그아웃 처리
   */
  _handleLogout() {
    this.loggedInUser = null;
    localStorage.removeItem('db_logged_user');
    this._updateLoginUI();
    this._renderList();
    this._showNotification('로그아웃되었습니다.');
  }

  /**
   * 로그인 UI 업데이트
   */
  _updateLoginUI() {
    const loginNotice = $id('db-login-notice');
    const addBtn = $id('btn-add-person');
    const loginBtn = $id('btn-db-login');

    // SNS 로그인 상태에 따른 UI 표시
    const providerName = this.snsUser ? { google: 'Google', kakao: '카카오', naver: '네이버' }[this.snsUser.provider] || 'SNS' : '';
    const providerIcon = this.snsUser ? { google: '🔵', kakao: '💬', naver: '🟢' }[this.snsUser.provider] || '👤' : '';

    if (this.currentDbType === 'personal') {
      // 개인 DB인 경우 - SNS 로그인 필요
      if (this.snsUser) {
        // 로그인된 상태
        if (loginNotice) {
          loginNotice.style.display = 'block';
          loginNotice.innerHTML = `
            <div class="db-login-box" style="background:#e8f5e9">
              <div class="db-logged-user">
                <span class="db-logged-user-icon">${providerIcon}</span>
                <span class="db-logged-user-name">${this.snsUser.name} (${providerName})</span>
                <button class="btn-db-logout" id="btn-db-logout">로그아웃</button>
              </div>
              <div class="db-login-info">
                <small>✅ 개인 DB를 자유롭게 관리할 수 있습니다</small>
              </div>
            </div>
          `;
          const logoutBtn = $id('btn-db-logout');
          if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this._handleSNSLogout());
          }
        }
        if (addBtn) addBtn.style.display = 'inline-flex';
        if (loginBtn) loginBtn.style.display = 'none';
      } else {
        // 로그인 안된 상태
        if (loginNotice) {
          loginNotice.style.display = 'block';
          loginNotice.innerHTML = `
            <div class="db-login-box">
              <div class="db-login-title">🔐 SNS 계정으로 로그인</div>
              <p>개인 DB는 로그인한 사용자만 조회/추가/삭제할 수 있습니다.</p>
              <div class="sns-login-buttons" style="display:flex;gap:12px;justify-content:center;margin:16px 0">
                <button class="btn-sns-login" data-provider="google" title="Google 로그인" style="width:56px;height:56px;border-radius:12px;border:1px solid #ddd;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
                  <svg width="28" height="28" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                </button>
                <button class="btn-sns-login" data-provider="kakao" title="카카오 로그인" style="width:56px;height:56px;border-radius:12px;border:none;background:#FEE500;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
                  <svg width="28" height="28" viewBox="0 0 24 24"><path fill="#3C1E1E" d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.88 5.32 4.7 6.73-.15.54-.97 3.48-1.01 3.73 0 0-.02.16.08.22.1.06.22.01.22.01.29-.04 3.4-2.23 3.94-2.62.68.1 1.38.15 2.07.15 5.52 0 10-3.58 10-8 0-4.42-4.48-8-10-8z"/></svg>
                </button>
                <button class="btn-sns-login" data-provider="naver" title="네이버 로그인" style="width:56px;height:56px;border-radius:12px;border:none;background:#03C75A;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
                  <svg width="28" height="28" viewBox="0 0 24 24"><path fill="#fff" d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z"/></svg>
                </button>
              </div>
              <div class="db-login-info">
                <small>* 인물 DB는 누구나 열람 가능합니다</small>
              </div>
            </div>
          `;
          loginNotice.querySelectorAll('.btn-sns-login').forEach(btn => {
            btn.addEventListener('click', () => this._handleSNSLogin(btn.dataset.provider));
          });
        }
        if (addBtn) addBtn.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'none';
      }
    } else {
      // 인물 DB인 경우
      if (this.snsUser) {
        // 로그인된 상태 - 인물 추가 가능
        if (loginNotice) {
          loginNotice.style.display = 'block';
          loginNotice.innerHTML = `
            <div class="db-login-box" style="background:#e8f5e9">
              <div class="db-logged-user">
                <span class="db-logged-user-icon">${providerIcon}</span>
                <span class="db-logged-user-name">${this.snsUser.name} (${providerName})</span>
                <button class="btn-db-logout" id="btn-sns-logout">로그아웃</button>
              </div>
              <div class="db-login-info">
                <small>✅ 로그인 완료 - 인물 추가 가능</small>
              </div>
            </div>
          `;
          const logoutBtn = $id('btn-sns-logout');
          if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this._handleSNSLogout());
          }
        }
        if (addBtn) addBtn.style.display = 'inline-flex';
      } else {
        // 로그인 안됨
        if (loginNotice) loginNotice.style.display = 'none';
        if (addBtn) addBtn.style.display = 'none';
      }
      if (loginBtn) loginBtn.style.display = 'none';
    }
  }

  /**
   * 인물 추가 모달 표시
   */
  _showAddModal() {
    // SNS 로그인 체크
    if (!this.snsUser) {
      this._showSNSLoginModal();
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>인물 추가</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>이름 *</label>
            <input type="text" id="add-name" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>생년 *</label>
              <input type="number" id="add-year" min="1900" max="2100">
            </div>
            <div class="form-group">
              <label>월 *</label>
              <input type="number" id="add-month" min="1" max="12">
            </div>
            <div class="form-group">
              <label>일 *</label>
              <input type="number" id="add-day" min="1" max="31">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>시 (선택)</label>
              <input type="number" id="add-hour" min="0" max="23">
            </div>
            <div class="form-group">
              <label>분</label>
              <input type="number" id="add-min" min="0" max="59" value="0">
            </div>
            <div class="form-group">
              <label>성별</label>
              <select id="add-gender">
                <option value="">미지정</option>
                <option value="m">남</option>
                <option value="f">여</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>메모</label>
            <input type="text" id="add-note" placeholder="직업, 특이사항 등">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel">취소</button>
          <button class="btn-confirm">추가</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 스마트 입력 제한
    const smartLimit = (input, max) => {
      if (!input) return;
      const value = input.value;
      if (value === '') return;
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue > max) {
        input.value = value.slice(0, -1);
      }
    };
    $id('add-year')?.addEventListener('input', function() { smartLimit(this, 2100); });
    $id('add-month')?.addEventListener('input', function() { smartLimit(this, 12); });
    $id('add-day')?.addEventListener('input', function() { smartLimit(this, 31); });
    $id('add-hour')?.addEventListener('input', function() { smartLimit(this, 23); });
    $id('add-min')?.addEventListener('input', function() { smartLimit(this, 59); });

    // 이벤트
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-confirm').addEventListener('click', () => {
      const name = $id('add-name').value.trim();
      const year = parseInt($id('add-year').value);
      const month = parseInt($id('add-month').value);
      const day = parseInt($id('add-day').value);
      const hour = $id('add-hour').value;
      const min = parseInt($id('add-min').value) || 0;
      const gender = $id('add-gender').value;
      const note = $id('add-note').value.trim();

      if (!name || !year || !month || !day) {
        alert('이름, 년, 월, 일은 필수입니다.');
        return;
      }

      const result = dbManager.addPerson({
        name, year, month, day,
        hour: hour ? parseInt(hour) : '',
        min, gender, note
      }, 'personal');

      if (result.success) {
        modal.remove();
        this._renderList();
        this._showNotification('인물이 추가되었습니다.');
      } else {
        alert(result.message);
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * SNS 로그인 모달 표시
   */
  _showSNSLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:420px">
        <div class="modal-header">
          <h3>🔐 SNS 계정으로 로그인</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="text-align:center;padding:30px">
          <p style="margin-bottom:24px;color:var(--text-secondary)">
            인물 추가 기능을 사용하려면<br>SNS 계정으로 로그인해주세요.
          </p>
          <div class="sns-login-buttons" style="display:flex;gap:16px;justify-content:center;margin-bottom:20px">
            <button class="btn-sns-login-modal" data-provider="google" title="Google 로그인" style="width:72px;height:72px;border-radius:16px;border:1px solid #ddd;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
              <svg width="32" height="32" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <span style="font-size:0.7rem;color:#666">Google</span>
            </button>
            <button class="btn-sns-login-modal" data-provider="kakao" title="카카오 로그인" style="width:72px;height:72px;border-radius:16px;border:none;background:#FEE500;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
              <svg width="32" height="32" viewBox="0 0 24 24"><path fill="#3C1E1E" d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.88 5.32 4.7 6.73-.15.54-.97 3.48-1.01 3.73 0 0-.02.16.08.22.1.06.22.01.22.01.29-.04 3.4-2.23 3.94-2.62.68.1 1.38.15 2.07.15 5.52 0 10-3.58 10-8 0-4.42-4.48-8-10-8z"/></svg>
              <span style="font-size:0.7rem;color:#3C1E1E">카카오</span>
            </button>
            <button class="btn-sns-login-modal" data-provider="naver" title="네이버 로그인" style="width:72px;height:72px;border-radius:16px;border:none;background:#03C75A;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
              <svg width="32" height="32" viewBox="0 0 24 24"><path fill="#fff" d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z"/></svg>
              <span style="font-size:0.7rem;color:#fff">네이버</span>
            </button>
          </div>
          <p style="font-size:0.8rem;color:#999">
            로그인 정보는 브라우저에만 저장됩니다.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.querySelectorAll('.btn-sns-login-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        this._handleSNSLogin(btn.dataset.provider, modal);
      });
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * SNS 로그인 처리
   */
  _handleSNSLogin(provider, modal = null) {
    const providerNames = { google: 'Google', kakao: '카카오', naver: '네이버' };
    const promptText = {
      google: '구글 이메일을 입력하세요:',
      kakao: '카카오 닉네임을 입력하세요:',
      naver: '네이버 아이디를 입력하세요:'
    };

    const input = prompt(promptText[provider] || '이름을 입력하세요:');
    if (input && input.trim()) {
      const name = input.trim().split('@')[0]; // 이메일인 경우 @ 앞부분만
      this.snsUser = {
        provider,
        name,
        email: provider === 'google' ? input : `${name}@${provider}.com`,
        loginAt: Date.now()
      };
      localStorage.setItem('sns_user', JSON.stringify(this.snsUser));
      if (modal) modal.remove();
      this._showNotification(`${name}님, ${providerNames[provider]}로 로그인되었습니다.`);
      this._updateLoginUI();
      // 인물 추가 모달 다시 표시
      setTimeout(() => this._showAddModal(), 100);
    }
  }

  /**
   * SNS 로그아웃
   */
  _handleSNSLogout() {
    this.snsUser = null;
    localStorage.removeItem('sns_user');
    this._updateLoginUI();
    this._showNotification('로그아웃되었습니다.');
  }

  /**
   * 가져오기 다이얼로그
   */
  _showImportDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = dbManager.importPersonalDb(ev.target.result);
        if (result.success) {
          this._renderList();
          this._showNotification(`${result.count}명의 데이터를 가져왔습니다.`);
        } else {
          alert('가져오기 실패: ' + result.message);
        }
      };
      reader.readAsText(file);
    });

    input.click();
  }

  /**
   * 알림 표시
   */
  _showNotification(message, type = 'info') {
    const container = $id('notification-container') || this._createNotificationContainer();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  _createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
  }
}

export default CelebPickerRenderer;
