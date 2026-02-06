/**
 * 연세사주 - 인물 DB 탭 모듈
 * 인물 목록 표시, 검색, 선택 시 사주 계산
 * 고급 정렬/필터 기능 포함
 */

import { dbManager, appState } from '../core/state.js';
import { SajuCalculator, DaeunCalculator, OhengAnalyzer } from '../core/calculator.js';
import { CHEONGAN, JIJI, CHEONGAN_HANJA, JIJI_HANJA, CHEONGAN_OHENG, JIJI_OHENG, CHEONGAN_EUMYANG, JIJI_EUMYANG, YUKSHIP_GAPJA, UI } from '../core/constants.js';
import { $id, setInnerHTML, escapeHtml, sanitizeCSS, safeInt, smartInputLimit } from '../utils/dom.js';

// 오행/십성 이름
const OHENG_NAMES = ['목', '화', '토', '금', '수'];
const SIPSUNG_NAMES = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];

// 기여자 등급 시스템
const CONTRIBUTOR_RANKS = [
  { min: 100, name: '플래티넘', icon: '💎', color: '#00bcd4' },
  { min: 20, name: '골드', icon: '🥇', color: '#ffc107' },
  { min: 5, name: '실버', icon: '🥈', color: '#9e9e9e' },
  { min: 1, name: '브론즈', icon: '🥉', color: '#cd7f32' },
  { min: 0, name: '아이언', icon: '⚙️', color: '#607d8b' }
];

function getContributorRank(count) {
  for (const rank of CONTRIBUTOR_RANKS) {
    if (count >= rank.min) return rank;
  }
  return CONTRIBUTOR_RANKS[CONTRIBUTOR_RANKS.length - 1];
}

function countUserContributions(uid) {
  if (!uid) return 0;
  const personal = dbManager.getList('personal') || [];
  return personal.filter(p => p.contributor && (p.contributor.uid === uid || p.contributor.email === uid)).length;
}

// 정렬 옵션 정의 (기본)
const SORT_OPTIONS_BASIC = [
  { key: 'name', label: '이름' },
  { key: 'date', label: '날짜' },
  { key: 'gender', label: '성별' }
];

// 정렬 옵션 (간지)
const SORT_OPTIONS_GANJI = [
  { key: 'ds', label: '일간', type: 'stem' },
  { key: 'db', label: '일지', type: 'branch' },
  { key: 'ms', label: '월간', type: 'stem' },
  { key: 'mb', label: '월지', type: 'branch' },
  { key: 'ys', label: '년간', type: 'stem' },
  { key: 'yb', label: '년지', type: 'branch' }
];

// 기존 호환용
const SORT_OPTIONS = [...SORT_OPTIONS_BASIC, ...SORT_OPTIONS_GANJI];

// 정렬 옵션 (오행/십성 발달)
const SORT_OPTIONS_OHENG = [
  { key: 'oh_목', label: '목 발달', type: 'oheng', oheng: '목' },
  { key: 'oh_화', label: '화 발달', type: 'oheng', oheng: '화' },
  { key: 'oh_토', label: '토 발달', type: 'oheng', oheng: '토' },
  { key: 'oh_금', label: '금 발달', type: 'oheng', oheng: '금' },
  { key: 'oh_수', label: '수 발달', type: 'oheng', oheng: '수' }
];

const SORT_OPTIONS_SIPSUNG = [
  { key: 'ss_비견', label: '비견', type: 'sipsung', sipsung: '비견' },
  { key: 'ss_겁재', label: '겁재', type: 'sipsung', sipsung: '겁재' },
  { key: 'ss_식신', label: '식신', type: 'sipsung', sipsung: '식신' },
  { key: 'ss_상관', label: '상관', type: 'sipsung', sipsung: '상관' },
  { key: 'ss_편재', label: '편재', type: 'sipsung', sipsung: '편재' },
  { key: 'ss_정재', label: '정재', type: 'sipsung', sipsung: '정재' },
  { key: 'ss_편관', label: '편관', type: 'sipsung', sipsung: '편관' },
  { key: 'ss_정관', label: '정관', type: 'sipsung', sipsung: '정관' },
  { key: 'ss_편인', label: '편인', type: 'sipsung', sipsung: '편인' },
  { key: 'ss_정인', label: '정인', type: 'sipsung', sipsung: '정인' }
];

const ALL_SORT_OPTIONS = [...SORT_OPTIONS, ...SORT_OPTIONS_OHENG, ...SORT_OPTIONS_SIPSUNG];

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
    // SNS 로그인 상태 (google, kakao, naver) - 보안 검증 추가
    try {
      const storedUser = localStorage.getItem('sns_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        // SNS 사용자 데이터 검증
        if (parsed && typeof parsed === 'object' &&
            typeof parsed.name === 'string' && parsed.name.length <= 100 &&
            ['google', 'kakao', 'naver'].includes(parsed.provider)) {
          this.snsUser = parsed;
        } else {
          this.snsUser = null;
          localStorage.removeItem('sns_user');
        }
      } else {
        this.snsUser = null;
      }
    } catch {
      this.snsUser = null;
      localStorage.removeItem('sns_user');
    }
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
      let searchGuardTimer = null;
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.currentPage = 1; // 검색 시 첫 페이지로
        this._renderList();
        // FormHandler의 디바운스(300ms)가 덮어쓸 수 있으므로 재렌더링
        if (searchGuardTimer) clearTimeout(searchGuardTimer);
        searchGuardTimer = setTimeout(() => this._renderList(), 350);
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
    const key = `${person.year}-${person.month}-${person.day}-${person.hour || ''}-${person.gender || ''}`;
    if (this.sajuCache.has(key)) return this.sajuCache.get(key);

    try {
      const h = person.hour !== '' && person.hour !== undefined ? parseInt(person.hour) : 12;
      const hasTime = person.hour !== '' && person.hour !== undefined;
      const r = SajuCalculator.calculate(person.year, person.month, person.day, h, person.min || 0);

      // 오행/십성 분석
      let ohengPct = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
      let sipsungPct = {};
      try {
        const ohengData = OhengAnalyzer.calculateWeightedOheng(r, hasTime);
        if (ohengData && ohengData.percent) {
          ohengPct = ohengData.percent;
        }
        if (ohengData && ohengData.tenGodCount) {
          const total = Object.values(ohengData.tenGodCount).reduce((a, b) => a + b, 0) || 1;
          for (const name of SIPSUNG_NAMES) {
            sipsungPct[name] = Math.round((ohengData.tenGodCount[name] || 0) / total * 100);
          }
        }
      } catch (e) { /* 무시 */ }

      const cache = {
        ds: r.idxs.day % 10,
        db: r.idxs.day % 12,
        ms: r.idxs.month % 10,
        mb: r.idxs.month % 12,
        ys: r.idxs.year % 10,
        yb: r.idxs.year % 12,
        hs: hasTime ? r.idxs.hour % 10 : -1,
        hb: hasTime ? r.idxs.hour % 12 : -1,
        hasTime,
        oheng: ohengPct,
        sipsung: sipsungPct
      };
      this.sajuCache.set(key, cache);
      return cache;
    } catch (e) {
      return { ds: -1, db: -1, ms: -1, mb: -1, ys: -1, yb: -1, hs: -1, hb: -1, hasTime: false, oheng: {}, sipsung: {} };
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
      default:
        // 오행 발달 정렬
        if (key.startsWith('oh_')) {
          const oh = key.replace('oh_', '');
          return m * ((b._c.oheng?.[oh] || 0) - (a._c.oheng?.[oh] || 0)); // 높은 순
        }
        // 십성 발달 정렬
        if (key.startsWith('ss_')) {
          const ss = key.replace('ss_', '');
          return m * ((b._c.sipsung?.[ss] || 0) - (a._c.sipsung?.[ss] || 0)); // 높은 순
        }
        return 0;
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
    const authUser = window.__getCurrentUser ? window.__getCurrentUser() : null;
    if (this.currentDbType === 'personal' && !this.loggedInUser && !authUser) {
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
      try {
      const globalIdx = startIdx + idx;
      const genderText = person.gender === 'm' ? '남' : person.gender === 'f' ? '여' : '';
      const currentYear = new Date().getFullYear();
      const koreanAge = currentYear - person.year + 1;
      const dateStr = `${person.year}.${String(person.month).padStart(2, '0')}.${String(person.day).padStart(2, '0')}`;
      const c = person._c || {};

      let sajuHtml = '<div class="db-saju-empty">-</div>';
      let ohengBarHtml = '';
      let sipsungBarHtml = '';
      let daeunHtml = '';

      if (c && c.ds >= 0) {
        const pillars = [
          { si: c.hasTime ? c.hs : -1, bi: c.hasTime ? c.hb : -1, valid: c.hasTime, isDay: false },
          { si: c.ds, bi: c.db, valid: true, isDay: true },
          { si: c.ms, bi: c.mb, valid: true, isDay: false },
          { si: c.ys, bi: c.yb, valid: true, isDay: false }
        ];

        // 사주 명식 (한자만, 일주 강조 - 크게)
        sajuHtml = '<div class="db-saju-big">';
        sajuHtml += '<div class="db-saju-row-big">';
        for (const p of pillars) {
          if (!p.valid) {
            sajuHtml += `<span class="db-char-big db-char-empty">?</span>`;
          } else {
            const oh = CHEONGAN_OHENG[p.si];
            sajuHtml += `<span class="db-char-big ${p.isDay ? 'db-pillar-day-big' : ''}" style="color:${colors[oh]}">${CHEONGAN_HANJA[p.si]}</span>`;
          }
        }
        sajuHtml += '</div><div class="db-saju-row-big">';
        for (const p of pillars) {
          if (!p.valid) {
            sajuHtml += `<span class="db-char-big db-char-empty">?</span>`;
          } else {
            const oh = JIJI_OHENG[p.bi];
            sajuHtml += `<span class="db-char-big ${p.isDay ? 'db-pillar-day-big' : ''}" style="color:${colors[oh]}">${JIJI_HANJA[p.bi]}</span>`;
          }
        }
        sajuHtml += '</div></div>';

        // 오행/십성/대운 계산
        try {
          const h = person.hour !== '' && person.hour !== undefined ? parseInt(person.hour) : 12;
          const hasTime = person.hour !== '' && person.hour !== undefined;
          const result = SajuCalculator.calculate(person.year, person.month, person.day, h, person.min || 0);
          result.input = { year: person.year, month: person.month, day: person.day, hour: h, minute: person.min || 0 };
          const ohengData = OhengAnalyzer.calculateWeightedOheng(result, hasTime);

          // 오행 막대그래프 (퍼센트)
          if (ohengData && ohengData.percent) {
            const ohColors = { 목: '#2d8a4e', 화: '#c0392b', 토: '#b8860b', 금: '#7f8c8d', 수: '#2874a6' };
            ohengBarHtml = '<div class="db-bars">';
            for (const name of OHENG_NAMES) {
              const pct = ohengData.percent[name] || 0;
              ohengBarHtml += `<div class="db-bar-row"><span class="db-bar-lbl" style="color:${ohColors[name]}">${name}</span><div class="db-bar-track"><div class="db-bar-fill" style="width:${pct}%;background:${ohColors[name]}"></div></div><span class="db-bar-val">${pct}%</span></div>`;
            }
            ohengBarHtml += '</div>';

            // 십성 막대그래프 (10개 개별, 2개씩 한 줄)
            if (ohengData.tenGodCount) {
              const total = Object.values(ohengData.tenGodCount).reduce((a, b) => a + b, 0) || 1;
              const pairs = [
                ['비견', '겁재'],
                ['식신', '상관'],
                ['편재', '정재'],
                ['편관', '정관'],
                ['편인', '정인']
              ];
              sipsungBarHtml = '<div class="db-ss-grid">';
              for (const pair of pairs) {
                sipsungBarHtml += '<div class="db-ss-pair">';
                for (const name of pair) {
                  const pct = Math.round(((ohengData.tenGodCount[name] || 0) / total) * 100);
                  sipsungBarHtml += `<div class="db-ss-item"><span class="db-ss-name">${name}</span><div class="db-ss-bar"><div class="db-ss-fill" style="width:${pct}%"></div></div><span class="db-ss-pct">${pct}%</span></div>`;
                }
                sipsungBarHtml += '</div>';
              }
              sipsungBarHtml += '</div>';
            }
          }

          // 대운
          const daeunData = DaeunCalculator.calculate(result, person.gender === 'm');
          if (daeunData && daeunData.list && daeunData.list.length > 0) {
            const currentDaeun = daeunData.list.find(d => d.calYear <= currentYear && d.calYear + 10 > currentYear) || daeunData.list[0];
            if (currentDaeun) {
              const dIdx = currentDaeun.idx;
              const dSi = dIdx % 10, dBi = dIdx % 12;
              daeunHtml = `<div class="db-daeun"><span class="db-daeun-lbl">대운 ${currentDaeun.age}세~</span><span class="db-daeun-char" style="color:${colors[CHEONGAN_OHENG[dSi]]}">${CHEONGAN_HANJA[dSi]}</span><span class="db-daeun-char" style="color:${colors[JIJI_OHENG[dBi]]}">${JIJI_HANJA[dBi]}</span></div>`;
            }
          }
        } catch (e) { /* 무시 */ }
      }

      // 출처 표시 (XSS 방지)
      let sourceHtml = '';
      if (person.source) {
        const srcText = person.source.startsWith('http') ? '링크' : escapeHtml(person.source);
        sourceHtml = `<span class="db-src" title="${escapeHtml(person.source)}">${srcText}</span>`;
      }

      // 안전한 인덱스 값
      const safeGlobalIdx = safeInt(globalIdx, 0, 0, 100000);

      html += `<div class="db-person-card db-card-clickable" data-index="${safeGlobalIdx}">
        <div class="db-card-info">
          <div class="db-person-name">${escapeHtml(person.name || '')}</div>
          <div class="db-person-meta">${safeInt(koreanAge, 0)}세${genderText ? ' · ' + escapeHtml(genderText) : ''}</div>
          <div class="db-person-date">${escapeHtml(dateStr)}</div>
          ${person.note ? `<div class="db-person-note">${escapeHtml(person.note)}</div>` : ''}
        </div>
        <div class="db-card-saju">${sajuHtml}</div>
        <div class="db-card-daeun">${daeunHtml}</div>
        <div class="db-card-oheng">${ohengBarHtml}</div>
        <div class="db-card-sipsung">${sipsungBarHtml}</div>
        ${sourceHtml}
        ${this.currentDbType === 'personal' && this.loggedInUser ? `<button class="btn-db-delete-mini" data-index="${safeGlobalIdx}" title="삭제">×</button>` : ''}
      </div>`;
      } catch (e) {
        console.error('카드 렌더링 오류:', person?.name, e);
        const safeIdx = safeInt(startIdx + idx, 0, 0, 100000);
        html += `<div class="db-person-card db-card-clickable" data-index="${safeIdx}">
          <div class="db-card-info"><div class="db-person-name">${escapeHtml(person?.name || '이름 없음')}</div></div>
          <div class="db-card-saju">-</div>
          <div class="db-card-daeun">-</div>
          <div class="db-card-oheng">-</div>
          <div class="db-card-sipsung">-</div>
        </div>`;
      }
    });

    container.innerHTML = html;
    this._updateStats(totalItems);
    this._renderPagination(totalItems, totalPages);

    // 카드 전체 클릭으로 사주 보기 + 궁합 상대 설정
    container.querySelectorAll('.db-card-clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        // 버튼 클릭 시 제외
        if (e.target.classList.contains('btn-db-delete-mini')) return;
        const idx = parseInt(card.dataset.index);
        this._selectPerson(list[idx]);
      });
    });

    container.querySelectorAll('.btn-db-delete-mini').forEach(btn => {
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

    // 칩 생성 헬퍼
    const makeChips = (options) => {
      let html = '';
      for (const opt of options) {
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
      return html;
    };

    // 4행 레이아웃: 기본 → 간지 → 오행 → 십성
    let html = '<div class="db-sort-row">' + makeChips(SORT_OPTIONS_BASIC) + '</div>';
    html += '<div class="db-sort-row db-sort-row-sub"><span class="db-sort-row-label">간지:</span>' + makeChips(SORT_OPTIONS_GANJI) + '</div>';
    html += '<div class="db-sort-row db-sort-row-sub"><span class="db-sort-row-label">오행:</span>' + makeChips(SORT_OPTIONS_OHENG) + '</div>';
    html += '<div class="db-sort-row db-sort-row-sub"><span class="db-sort-row-label">십성:</span>' + makeChips(SORT_OPTIONS_SIPSUNG) + '</div>';
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
    let storedUsers = {};
    try {
      const parsed = JSON.parse(localStorage.getItem('db_users') || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        storedUsers = parsed;
      }
    } catch {
      storedUsers = {};
    }

    if (storedUsers[username] && typeof storedUsers[username] === 'string' && storedUsers[username] === password) {
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

    // 로그인 상태 확인 (새로운 인증 시스템 우선, 기존 snsUser 호환)
    const currentUser = window.__getCurrentUser ? window.__getCurrentUser() : null;
    const user = currentUser || this.snsUser;

    // 로그인 상태에 따른 UI 표시
    const providerName = user ? { google: 'Google', kakao: '카카오', naver: '네이버' }[user.provider] || 'SNS' : '';
    const providerIcon = user ? { google: '🔵', kakao: '💬', naver: '🟢' }[user.provider] || '👤' : '';

    // 로그인/로그아웃은 헤더에서만 처리 - 인물위키 내부에는 표시하지 않음
    if (loginNotice) loginNotice.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'none';
    if (addBtn) addBtn.style.display = 'inline-flex';
  }

  /**
   * 인물 추가 모달 표시 (나무위키 스타일 - 출처 필수)
   */
  _showAddModal() {
    // 로그인 체크 (새로운 인증 시스템 우선, 기존 snsUser 호환)
    const currentUser = window.__getCurrentUser ? window.__getCurrentUser() : null;
    const user = currentUser || this.snsUser;

    if (!user) {
      this._showSNSLoginModal();
      return;
    }

    // XSS 방지: 사용자 정보 이스케이프
    const contributorName = escapeHtml(user.displayName || user.name || '익명');
    const contributorProvider = escapeHtml(user.provider || 'unknown');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:520px">
        <div class="modal-header">
          <h3>인물 정보 기여하기</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="contrib-notice" style="background:#e3f2fd;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:0.85rem;line-height:1.6;color:#1565c0">
            <b>기여 안내</b><br>
            • 생년월일 정보는 <b>반드시 출처</b>를 함께 기재해주세요<br>
            • 출처: 공식 프로필, 인터뷰, 위키백과, 나무위키 등<br>
            • 허위 정보 등록 시 삭제될 수 있습니다
          </div>

          <div class="contrib-user" style="background:#f5f5f5;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.85rem;display:flex;align-items:center;gap:8px">
            <span style="color:#666">기여자:</span>
            <b>${contributorName}</b>
            <span style="color:#999;font-size:0.75rem">(${contributorProvider})</span>
          </div>

          <div class="form-group">
            <label>이름 *</label>
            <input type="text" id="add-name" placeholder="예: 홍길동" required>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>생년 *</label>
              <input type="number" id="add-year" min="1900" max="2100" placeholder="1990">
            </div>
            <div class="form-group">
              <label>월 *</label>
              <input type="number" id="add-month" min="1" max="12" placeholder="1">
            </div>
            <div class="form-group">
              <label>일 *</label>
              <input type="number" id="add-day" min="1" max="31" placeholder="15">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>시 (선택)</label>
              <input type="number" id="add-hour" min="0" max="23" placeholder="시간 미상시 비움">
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
            <label>직업/분야</label>
            <input type="text" id="add-note" placeholder="예: 배우, 가수, 정치인, 운동선수 등">
          </div>

          <div class="form-group" style="margin-top:16px;padding-top:16px;border-top:1px dashed #ddd">
            <label style="color:#d32f2f">출처 * <span style="font-weight:normal;color:#888">(생년월일 정보의 출처)</span></label>
            <input type="text" id="add-source" placeholder="예: 나무위키, 위키백과, 공식 SNS, 인터뷰 기사 등" required style="border-color:#ffcdd2">
            <small style="color:#888;font-size:0.75rem;margin-top:4px;display:block">URL을 직접 입력하거나, 출처명을 기재해주세요</small>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel">취소</button>
          <button class="btn-confirm">기여하기</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 스마트 입력 제한 (공유 유틸리티 사용)
    $id('add-year')?.addEventListener('input', function() { smartInputLimit(this, 0, 2100); });
    $id('add-month')?.addEventListener('input', function() { smartInputLimit(this, 0, 12); });
    $id('add-day')?.addEventListener('input', function() { smartInputLimit(this, 0, 31); });
    $id('add-hour')?.addEventListener('input', function() { smartInputLimit(this, 0, 23); });
    $id('add-min')?.addEventListener('input', function() { smartInputLimit(this, 0, 59); });

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
      const source = $id('add-source').value.trim();

      if (!name || !year || !month || !day) {
        alert('이름, 년, 월, 일은 필수입니다.');
        return;
      }

      if (!source) {
        alert('출처는 필수입니다. 생년월일 정보의 출처를 입력해주세요.');
        $id('add-source').focus();
        return;
      }

      // 기여자 정보와 함께 저장
      const result = dbManager.addPerson({
        name, year, month, day,
        hour: hour ? parseInt(hour) : '',
        min, gender, note,
        source,
        contributor: {
          name: contributorName,
          provider: contributorProvider,
          uid: user.uid || null,
          addedAt: new Date().toISOString()
        }
      }, 'personal');

      if (result.success) {
        modal.remove();
        this._renderList();
        this._showNotification(`${name} 님의 정보가 추가되었습니다. 기여해주셔서 감사합니다!`);
      } else {
        alert(result.message);
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * 로그인 모달 표시 (전역 로그인 모달 사용)
   */
  _showSNSLoginModal() {
    // 전역 로그인 모달 사용
    if (window.__showLoginModal) {
      window.__showLoginModal();
    } else {
      alert('로그인이 필요합니다.');
    }
  }

  /**
   * 로그아웃 처리
   */
  _handleLogout() {
    // 새로운 인증 시스템으로 로그아웃
    if (window.__logout) {
      window.__logout();
    }
    // 기존 snsUser도 초기화
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
   * 알림 표시 (XSS 방지)
   * @param {string} message - 알림 메시지
   * @param {string} type - 알림 타입 ('info', 'error', 'success')
   */
  _showNotification(message, type = 'info') {
    const container = $id('notification-container') || this._createNotificationContainer();

    const notification = document.createElement('div');
    // 안전한 클래스 타입 (허용 목록)
    const safeType = ['info', 'error', 'success', 'warning'].includes(type) ? type : 'info';
    notification.className = `notification notification-${safeType}`;

    // 안전한 DOM 생성 (innerHTML 대신 textContent 사용)
    const msgSpan = document.createElement('span');
    msgSpan.className = 'notification-message';
    msgSpan.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => notification.remove());

    notification.appendChild(msgSpan);
    notification.appendChild(closeBtn);

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
