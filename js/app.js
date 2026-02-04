/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 (Yonsei Saju) - 메인 애플리케이션
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 모듈화된 사주풀이 웹 애플리케이션의 진입점
 * ES6+ 모듈 시스템을 사용한 현대적인 아키텍처
 * 
 * @author 반우석
 * @version 2.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// 모듈 임포트
// ═══════════════════════════════════════════════════════════════════════════

// 코어 모듈
import { appState, dbManager } from './core/state.js';
import { SajuCalculator, OhengAnalyzer, YongsinAnalyzer, DaeunCalculator, SaeunCalculator, WolunCalculator, RelationDetector } from './core/calculator.js';
import { THRESHOLDS, UI, APP_INFO } from './core/constants.js';

// 유틸리티
import { $, $id, delegate, debounce, setInnerHTML, visibility, classHelper } from './utils/dom.js';
import { safeExecute, SajuError, ErrorCodes } from './utils/error-handler.js';

// 기능 모듈
import { FormHandler } from './modules/form-handler.js';
import { TabNavigation } from './modules/tab-navigation.js';
import { PillarRenderer, OhengRenderer, SipsungRenderer, HiddenStemsRenderer, RelationDiagramRenderer, FortuneCardRenderer, YongsinRenderer, TodayFortuneRenderer, BTIRenderer, FooterRenderer, SidebarRenderer } from './modules/renderers.js';
import GunghapAnalyzer, { GunghapRenderer } from './modules/gunghap.js';
import CelebPickerRenderer from './modules/celeb-picker.js';
import ShareCardRenderer from './modules/share-card.js';

// ═══════════════════════════════════════════════════════════════════════════
// 메인 애플리케이션 클래스
// ═══════════════════════════════════════════════════════════════════════════

class SajuApp {
  constructor() {
    // 싱글톤 보장
    if (SajuApp.instance) {
      return SajuApp.instance;
    }
    SajuApp.instance = this;

    // 모듈 인스턴스
    this.calculator = new SajuCalculator();
    this.formHandler = null;
    this.tabNavigation = null;
    this.gunghap = null;

    // 렌더러들
    this.renderers = {
      pillar: null,
      oheng: null,
      sipsung: null,
      hiddenStems: null,
      relationDiagram: null,
      fortune: null,
      yongsin: null,
      today: null,
      bti: null,
      sidebar: null
    };

    // 초기화 상태
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * 애플리케이션 초기화
   */
  async init() {
    if (this.initialized) {
      console.warn('[SajuApp] Already initialized');
      return this;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  async _doInit() {
    console.log('[SajuApp] Initializing...');
    const startTime = performance.now();

    try {
      // DOM이 준비될 때까지 대기
      await this._waitForDOM();

      // 모듈들 순차 초기화
      await this._initializeModules();

      // 이벤트 리스너 설정
      this._setupEventListeners();

      // 상태 복원 (이전 세션)
      this._restoreState();

      // URL 파라미터 처리 (공유 링크)
      this._handleUrlParams();

      // 궁합 공유 버튼 설정
      this._setupGunghapShare();

      // 초기화 완료
      this.initialized = true;
      const elapsed = (performance.now() - startTime).toFixed(2);
      console.log(`[SajuApp] Initialized in ${elapsed}ms`);

      // 초기화 완료 이벤트 발생
      appState.emit('app:initialized', { elapsed });

      return this;

    } catch (error) {
      console.error('[SajuApp] Initialization failed:', error);
      this._showInitError(error);
      throw error;
    }
  }

  /**
   * DOM 준비 대기
   */
  _waitForDOM() {
    return new Promise(resolve => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * 모듈 초기화
   */
  async _initializeModules() {
    // 1. 폼 핸들러
    this.formHandler = new FormHandler();
    await this.formHandler.init();

    // 2. 탭 네비게이션 (HTML에서 직접 처리)
    // this.tabNavigation = new TabNavigation();
    // this.tabNavigation.init();

    // 3. 렌더러들
    this.renderers.pillar = new PillarRenderer('saju-pillars');
    this.renderers.oheng = new OhengRenderer('oheng-analysis');
    this.renderers.sipsung = new SipsungRenderer('sipsung-analysis');
    this.renderers.hiddenStems = new HiddenStemsRenderer('hidden-stems-section');
    this.renderers.relationDiagram = new RelationDiagramRenderer('relations-section');
    this.renderers.fortune = new FortuneCardRenderer('fortune-section');
    this.renderers.yongsin = new YongsinRenderer('yongsin-section');
    this.renderers.today = new TodayFortuneRenderer('today-results');
    this.renderers.bti = new BTIRenderer('bti-results');
    this.renderers.sidebar = new SidebarRenderer();

    // 4. 궁합 모듈
    this.gunghap = new GunghapAnalyzer();
    await this.gunghap.init?.();

    // 5. 궁합 렌더러
    this.gunghapRenderer = new GunghapRenderer();
    this.gunghapRenderer.init();

    // Best Match 버튼 이벤트
    const bestMatchBtn = document.getElementById('btn-best-match');
    if (bestMatchBtn) {
      bestMatchBtn.addEventListener('click', () => {
        this.gunghapRenderer.findBestMatch();
      });
    }

    // 6. 데이터베이스 로드
    await dbManager.loadDefaults();

    // 7. 유명인 DB 렌더러
    this.celebPicker = new CelebPickerRenderer();
    this.celebPicker.init();

    // 8. 공유 카드 렌더러
    this.shareCard = new ShareCardRenderer();
    const shareCardBtn = document.getElementById('btn-share-card');
    if (shareCardBtn) {
      shareCardBtn.addEventListener('click', () => {
        const { result, hasTime } = appState.getSnapshot();
        if (result) {
          this.shareCard.open(result, hasTime);
        }
      });
    }

    // 9. 푸터 렌더링
    FooterRenderer.render();
  }

  /**
   * 이벤트 리스너 설정
   */
  _setupEventListeners() {
    // 상태 변경 구독
    appState.on('resultCalculated', ({ result, hasTime }) => {
      appState.set('hasTime', hasTime, true); // silent
      this._handleResultChange(result);
    });
    appState.on('tabChanged', ({ to }) => this._handleTabChange(to));
    appState.on('error', (error) => this._handleError(error));
    
    // 계산 요청 이벤트 (FormHandler에서 발행)
    appState.on('calculate', (data) => this._handleCalculate(data));

    // 키보드 단축키
    document.addEventListener('keydown', (e) => this._handleKeyboard(e));

    // 윈도우 리사이즈
    window.addEventListener('resize', debounce(() => this._handleResize(), 200));

    // 페이지 언로드 시 상태 저장
    window.addEventListener('beforeunload', () => this._saveState());
  }

  /**
   * 계산 요청 핸들러
   */
  _handleCalculate(data) {
    try {
      // SajuCalculator.calculate는 static 메서드이고 개별 파라미터를 받음
      const result = SajuCalculator.calculate(
        data.year,
        data.month,
        data.day,
        data.hour ?? 12,  // 시간 미상이면 기본값 12
        data.minute || 0
      );

      // 결과를 상태에 저장 (이것이 result:changed 이벤트 발생)
      appState.setResult(result, data.hasTime);
      appState.setGender(data.gender);

    } catch (error) {
      console.error('[SajuApp] Calculation failed:', error);
      appState.emit('error', error);
    }
  }

  /**
   * 결과 변경 핸들러
   */
  _handleResultChange(result) {
    if (!result) {
      this._clearResults();
      return;
    }

    const { hasTime, gender } = appState.getSnapshot();

    let ohengData = null;
    let yongsinData = null;

    // 오행/용신 분석 데이터 계산
    try {
      ohengData = OhengAnalyzer.calculateWeightedOheng(result, hasTime);
      yongsinData = YongsinAnalyzer.calculate(result, hasTime);
    } catch (e) {
      console.warn('[SajuApp] Analysis calculation skipped:', e.message);
    }

    // 전문 만세력 탭 렌더링
    this.renderers.pillar?.render?.(result, hasTime);

    // 합충형파해 관계도 렌더링 (사주명식 바로 아래)
    const relations = RelationDetector.detect(result, hasTime);
    this.renderers.relationDiagram?.render?.(result, relations, hasTime);

    // 오행 및 십성 표 렌더링
    if (ohengData) {
      this.renderers.oheng?.render?.(ohengData.percent);
      this.renderers.sipsung?.render?.(result, hasTime, ohengData.percent, ohengData.tenGodCount);
    } else {
      this.renderers.sipsung?.render?.(result, hasTime, null, null);
    }

    // 지장간 렌더링
    this.renderers.hiddenStems?.render?.(result, hasTime);

    // 용신 렌더링
    if (yongsinData) {
      this.renderers.yongsin?.render?.(yongsinData);
    }

    // 사이드바 렌더링
    this.renderers.sidebar?.render?.(result, hasTime, ohengData, yongsinData);

    // 대운 데이터 미리 계산 (BTI AI 프롬프트용)
    let daeunData = null;
    if (gender) {
      try {
        daeunData = DaeunCalculator.calculate(result, gender);
      } catch (e) {
        console.warn('[SajuApp] Daeun pre-calc skipped:', e.message);
      }
    }

    // 대운/세운/월운 렌더링
    this._renderFortune(result, gender);

    // 궁합 탭 본인 정보 업데이트
    this.gunghapRenderer?.updatePerson1(result, hasTime, gender);

    // Best Match 버튼 활성화
    const bestMatchBtn = document.getElementById('btn-best-match');
    if (bestMatchBtn) bestMatchBtn.disabled = false;

    // BTI 탭 렌더링
    try {
      this.renderers.bti?.render?.(result, hasTime, ohengData?.percent, yongsinData, daeunData, gender);
      // BTI empty 숨기고 results 표시
      visibility.hide($id('bti-empty'));
      visibility.show($id('bti-results'));

      // 공유 카드 버튼 활성화 및 섹션 표시
      const shareCardBtn = $id('btn-share-card');
      const shareSection = $id('bti-share-section');
      if (shareCardBtn) shareCardBtn.disabled = false;
      if (shareSection) shareSection.style.display = '';

    } catch (e) {
      console.warn('[SajuApp] BTI render skipped:', e.message);
    }

    // 오늘의 운세 탭 렌더링
    try {
      this.renderers.today?.render?.(result, hasTime);
      visibility.hide($id('today-empty'));
      visibility.show($id('today-results'));
    } catch (e) {
      console.warn('[SajuApp] Today render skipped:', e.message);
    }

    // 전문 만세력 empty 상태 숨기고 결과 섹션 표시
    visibility.hide($id('myeongshik-empty'));
    const resultsEl = $id('results');
    if (resultsEl) {
      resultsEl.style.display = 'block';
      classHelper.add(resultsEl, 'show');
    }
  }

  /**
   * 대운/세운/월운 렌더링
   */
  _renderFortune(result, gender) {
    const daeunContainer = $id('daeun-section');
    const seunContainer = $id('seun-section');
    const wolunContainer = $id('wolun-section');
    const interactionContainer = $id('fortune-interaction');
    const { hasTime } = appState.getSnapshot();

    if (!daeunContainer && !seunContainer) return;

    // 절기 정보 문자열
    const fmtDate = (d) => `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const termStr = `${result.curTerm} (${fmtDate(result.curTermDt)}) → ${result.nextTerm} (${fmtDate(result.nextTermDt)})`;

    // 상태 저장 변수
    let lastDaeun = null;
    let selectedDaeunIdx = -1;
    let selectedSeunYear = new Date().getFullYear();

    // Fortune Interaction 렌더링 함수
    const renderInteraction = () => {
      if (!interactionContainer) return;
      const daeunInfo = lastDaeun && selectedDaeunIdx >= 0 ? lastDaeun.list[selectedDaeunIdx] : null;
      this.renderers.fortune.renderInteraction(
        interactionContainer, result, hasTime, daeunInfo, selectedSeunYear
      );
    };

    // 세운 렌더링 함수
    const renderSeun = (startY, endY) => {
      if (!seunContainer) return;
      const saeunList = SaeunCalculator.calculate(result, startY, endY);
      const d = lastDaeun && selectedDaeunIdx >= 0 ? lastDaeun.list[selectedDaeunIdx] : null;
      const title = d ? `세운 · ${d.age}세 대운 (${startY}~${endY})` : '세운';
      this.renderers.fortune.renderSeunSection(seunContainer, saeunList, title, selectedSeunYear, (year) => {
        selectedSeunYear = year;
        renderWolun();
        renderInteraction();
      });
    };

    // 월운 렌더링 함수
    const renderWolun = () => {
      if (!wolunContainer) return;
      const y = selectedSeunYear || new Date().getFullYear();
      try {
        const wolunList = WolunCalculator.calculate(result, y);
        const koreanAge = y - result.input.year + 1;
        this.renderers.fortune.renderWolunSection(wolunContainer, wolunList, y, koreanAge);
      } catch (e) {
        console.warn('[SajuApp] Wolun render skipped:', e.message);
        wolunContainer.innerHTML = '';
      }
    };

    // 대운 선택 핸들러
    const onDaeunSelect = (idx, daeunData) => {
      selectedDaeunIdx = idx;
      lastDaeun = daeunData;
      const d = daeunData.list[idx];
      const startY = d.calYear;
      const endY = idx < daeunData.list.length - 1 ? daeunData.list[idx + 1].calYear - 1 : d.calYear + 9;
      const curY = new Date().getFullYear();
      selectedSeunYear = (curY >= startY && curY <= endY) ? curY : startY;
      renderSeun(startY, endY);
      renderWolun();
      renderInteraction();
    };

    // 대운 렌더링
    if (gender) {
      try {
        const daeunData = DaeunCalculator.calculate(result, gender);
        lastDaeun = daeunData;
        selectedDaeunIdx = this.renderers.fortune.renderDaeunSection(daeunContainer, daeunData, termStr, onDaeunSelect);

        // 초기 세운/월운 렌더
        if (selectedDaeunIdx >= 0 && daeunData.list.length > 0) {
          onDaeunSelect(selectedDaeunIdx, daeunData);
        } else {
          const curY = new Date().getFullYear();
          const birthY = result.input.year;
          selectedSeunYear = curY;
          renderSeun(Math.max(curY - 3, birthY), curY + 8);
          renderWolun();
        }
      } catch (e) {
        console.warn('[SajuApp] Daeun render skipped:', e.message);
        if (daeunContainer) {
          daeunContainer.innerHTML = `<div class="fortune-section"><div class="section-title">대운 <span class="fortune-direction">${termStr}</span></div><div class="no-gender-msg">대운 계산 중 오류 발생</div></div>`;
        }
      }
    } else {
      // 성별 없음
      if (daeunContainer) {
        daeunContainer.innerHTML = `<div class="fortune-section"><div class="section-title">대운 <span class="fortune-direction">${termStr}</span></div><div class="no-gender-msg">성별을 선택하면 대운이 표시됩니다</div></div>`;
      }
      // 세운/월운은 성별 없이도 표시
      const curY = new Date().getFullYear();
      const birthY = result.input.year;
      selectedSeunYear = curY;
      renderSeun(Math.max(curY - 3, birthY), curY + 8);
      renderWolun();
      renderInteraction(); // 운세 ↔ 원국 합충 표시
    }
  }

  /**
   * 탭 변경 핸들러
   */
  _handleTabChange(tab) {
    console.log(`[SajuApp] Tab changed to: ${tab}`);
  }

  /**
   * 에러 핸들러
   */
  _handleError(error) {
    console.error('[SajuApp] Error:', error);

    // 사용자에게 알림
    const message = error instanceof SajuError
      ? error.message
      : (error?.message || '오류가 발생했습니다. 다시 시도해 주세요.');

    this._showNotification(message, 'error');
  }

  /**
   * 키보드 핸들러
   */
  _handleKeyboard(e) {
    // Ctrl/Cmd + Enter: 계산 실행
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.formHandler?.calculate();
    }

    // Escape: 모달 닫기 등
    if (e.key === 'Escape') {
      this._closeModals();
    }
  }

  /**
   * 리사이즈 핸들러
   */
  _handleResize() {
    // 모바일 뷰포트 조정
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  /**
   * 상태 저장
   */
  _saveState() {
    try {
      const snapshot = appState.getSnapshot();
      localStorage.setItem('saju_app_state', JSON.stringify({
        activeTab: snapshot.activeTab,
        isCalculatorCollapsed: snapshot.isCalculatorCollapsed,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('[SajuApp] Failed to save state:', e);
    }
  }

  /**
   * 상태 복원
   */
  _restoreState() {
    try {
      const saved = localStorage.getItem('saju_app_state');
      if (saved) {
        const state = JSON.parse(saved);
        // 24시간 이내의 상태만 복원
        if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
          if (state.activeTab) {
            appState.setActiveTab(state.activeTab);
          }
        }
      }
    } catch (e) {
      console.warn('[SajuApp] Failed to restore state:', e);
    }
  }

  /**
   * 결과 초기화
   */
  _clearResults() {
    // 결과 영역 숨기고 empty 상태 표시
    const resultsEl = $id('results');
    if (resultsEl) {
      visibility.hide(resultsEl);
      classHelper.remove(resultsEl, 'show');
    }
    visibility.show($id('myeongshik-empty'));
    visibility.hide($id('today-results'));
    visibility.show($id('today-empty'));
    visibility.hide($id('bti-results'));
    visibility.show($id('bti-empty'));

    Object.values(this.renderers).forEach(r => r?.clear?.());
  }

  /**
   * 모달 닫기
   */
  _closeModals() {
    // 열린 모달들 닫기
    document.querySelectorAll('.modal.active').forEach(modal => {
      classHelper.remove(modal, 'active');
    });
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
    
    // 자동 제거
    setTimeout(() => notification.remove(), 5000);
  }

  _createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
  }

  /**
   * 초기화 에러 표시
   */
  _showInitError(error) {
    const errorHtml = `
      <div class="init-error">
        <h2>⚠️ 앱 초기화 실패</h2>
        <p>죄송합니다. 앱을 시작하는 중 오류가 발생했습니다.</p>
        <p class="error-detail">${error.message}</p>
        <button onclick="location.reload()">다시 시도</button>
      </div>
    `;
    document.body.innerHTML = errorHtml;
  }

  /**
   * URL 파라미터 처리 (공유 링크)
   */
  _handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');

    if (mode === 'gunghap') {
      // 궁합 모드: 두 사람 정보 로드
      const ay = params.get('ay'), am = params.get('am'), ad = params.get('ad');
      const ah = params.get('ah'), ami = params.get('ami'), ag = params.get('ag');
      const by = params.get('by'), bm = params.get('bm'), bd = params.get('bd');
      const bh = params.get('bh'), bmi = params.get('bmi'), bg = params.get('bg');

      if (ay && am && ad && by && bm && bd) {
        // 본인 정보 설정
        $id('in-year').value = ay;
        $id('in-month').value = am;
        $id('in-day').value = ad;
        if (ah) $id('in-hour').value = ah;
        if (ami) $id('in-min').value = ami;
        if (ag) {
          $id('gender-m')?.classList.toggle('active', ag === 'm');
          $id('gender-f')?.classList.toggle('active', ag === 'f');
        }

        // 계산 및 궁합 탭 전환
        setTimeout(() => {
          // 본인 계산
          appState.emit('calculate', {
            year: parseInt(ay), month: parseInt(am), day: parseInt(ad),
            hour: ah ? parseInt(ah) : null, minute: parseInt(ami) || 0,
            gender: ag || 'm', hasTime: !!ah
          });

          // 상대방 정보 설정 (궁합 렌더러가 초기화된 후)
          setTimeout(() => {
            $id('gh-year')?.setAttribute('value', by);
            $id('gh-month')?.setAttribute('value', bm);
            $id('gh-day')?.setAttribute('value', bd);
            const ghYear = $id('gh-year');
            const ghMonth = $id('gh-month');
            const ghDay = $id('gh-day');
            if (ghYear) ghYear.value = by;
            if (ghMonth) ghMonth.value = bm;
            if (ghDay) ghDay.value = bd;
            if (bh) { const el = $id('gh-hour'); if (el) el.value = bh; }
            if (bmi) { const el = $id('gh-min'); if (el) el.value = bmi; }
            if (bg) {
              $id('gh-gender-m')?.classList.toggle('active', bg === 'm');
              $id('gh-gender-f')?.classList.toggle('active', bg === 'f');
            }

            // 궁합 탭으로 전환
            if (typeof window.switchTab === 'function') {
              window.switchTab('gunghap');
            }
          }, 500);
        }, 100);
      }
    }

    // URL 파라미터 제거 (히스토리 클린)
    if (params.toString()) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  /**
   * 궁합 공유 버튼 설정
   */
  _setupGunghapShare() {
    const linkBtn = $id('btn-share-gunghap-link');
    const kakaoBtn = $id('btn-share-gunghap-kakao');

    if (linkBtn) {
      linkBtn.addEventListener('click', () => this._shareGunghapLink());
    }
    if (kakaoBtn) {
      kakaoBtn.addEventListener('click', () => this._shareGunghapKakao());
    }
  }

  /**
   * 궁합 공유 URL 생성
   */
  _getGunghapShareUrl() {
    const { result } = appState.getSnapshot();
    if (!result) return null;

    const input = result.input;
    const by = $id('gh-year')?.value;
    const bm = $id('gh-month')?.value;
    const bd = $id('gh-day')?.value;

    if (!input.year || !by || !bm || !bd) return null;

    let url = `${location.origin}${location.pathname}?mode=gunghap`;
    url += `&ay=${input.year}&am=${input.month}&ad=${input.day}`;
    if (input.hour !== undefined && input.hour !== null) url += `&ah=${input.hour}`;
    if (input.minute) url += `&ami=${input.minute}`;

    const { gender } = appState.getSnapshot();
    if (gender) url += `&ag=${gender}`;

    url += `&by=${by}&bm=${bm}&bd=${bd}`;
    const bh = $id('gh-hour')?.value;
    const bmi = $id('gh-min')?.value;
    if (bh) url += `&bh=${bh}`;
    if (bmi) url += `&bmi=${bmi}`;

    const ghGenderM = $id('gh-gender-m')?.classList.contains('active');
    const ghGenderF = $id('gh-gender-f')?.classList.contains('active');
    if (ghGenderM) url += `&bg=m`;
    else if (ghGenderF) url += `&bg=f`;

    return url;
  }

  /**
   * 궁합 링크 복사
   */
  _shareGunghapLink() {
    const url = this._getGunghapShareUrl();
    if (!url) {
      alert('먼저 궁합을 계산해주세요.');
      return;
    }

    navigator.clipboard.writeText(url).then(() => {
      const btn = $id('btn-share-gunghap-link');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ 복사됨!';
        setTimeout(() => btn.textContent = orig, 2000);
      }
    }).catch(() => {
      // 폴백
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  /**
   * 궁합 공유 (Web Share API / 카카오)
   */
  _shareGunghapKakao() {
    const url = this._getGunghapShareUrl();
    if (!url) {
      alert('먼저 궁합을 계산해주세요.');
      return;
    }

    const scoreEl = document.querySelector('.gh-score-num');
    const score = scoreEl ? scoreEl.textContent.replace(/\/100/, '').trim() : '?';
    const title = `궁합 ${score}점 — 연세사주`;
    const desc = '두 사람의 궁합을 사주명리학으로 분석했습니다.';

    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.share) {
      navigator.share({ title, text: desc, url }).catch(() => {});
    } else {
      window.open(`https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title + '\n' + desc)}`, '_blank');
    }
  }

  /**
   * 공개 API: 사주 계산
   */
  calculate(input) {
    return safeExecute(() => {
      const result = this.calculator.calculate(input);
      appState.setResult(result);
      return result;
    }, '사주 계산');
  }

  /**
   * 공개 API: 결과 초기화
   */
  reset() {
    appState.reset();
    this.formHandler?.reset();
    this._clearResults();
  }

  /**
   * 디버그 정보
   */
  debug() {
    return {
      initialized: this.initialized,
      state: appState.getSnapshot(),
      modules: {
        formHandler: !!this.formHandler,
        tabNavigation: !!this.tabNavigation,
        gunghap: !!this.gunghap,
        renderers: Object.keys(this.renderers).filter(k => !!this.renderers[k])
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 앱 인스턴스 생성 및 초기화
// ═══════════════════════════════════════════════════════════════════════════

const app = new SajuApp();

// 자동 초기화
app.init().catch(console.error);

// 전역 접근 (디버그용)
if (typeof window !== 'undefined') {
  window.__sajuApp = app;
  window.__sajuState = appState;
  window.__sajuDbManager = dbManager;

  // ═══ 빠른 도구 가이드 모달 ═══
  const createGuideModal = (title, content) => {
    const existing = document.querySelector('.guide-modal-overlay');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'guide-modal-overlay';
    modal.innerHTML = `
      <div class="guide-modal">
        <div class="guide-modal-header">
          <h2>${title}</h2>
          <button class="guide-modal-close">&times;</button>
        </div>
        <div class="guide-modal-body">${content}</div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.guide-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });
  };

  // 절기 달력
  window.__showJeolgiCalendar = () => {
    const terms = [
      { name: '입춘', date: '2/4~5', desc: '봄의 시작' },
      { name: '우수', date: '2/19~20', desc: '눈이 녹아 비가 됨' },
      { name: '경칩', date: '3/5~6', desc: '개구리가 깨어남' },
      { name: '춘분', date: '3/20~21', desc: '밤낮 길이 같음' },
      { name: '청명', date: '4/4~5', desc: '하늘이 맑아짐' },
      { name: '곡우', date: '4/20~21', desc: '농사비가 내림' },
      { name: '입하', date: '5/5~6', desc: '여름의 시작' },
      { name: '소만', date: '5/21~22', desc: '본격 성장기' },
      { name: '망종', date: '6/5~6', desc: '씨뿌리기 철' },
      { name: '하지', date: '6/21~22', desc: '낮이 가장 긺' },
      { name: '소서', date: '7/7~8', desc: '작은 더위' },
      { name: '대서', date: '7/22~23', desc: '큰 더위' },
      { name: '입추', date: '8/7~8', desc: '가을의 시작' },
      { name: '처서', date: '8/23~24', desc: '더위가 물러감' },
      { name: '백로', date: '9/7~8', desc: '이슬이 맺힘' },
      { name: '추분', date: '9/22~23', desc: '밤낮 길이 같음' },
      { name: '한로', date: '10/8~9', desc: '찬 이슬이 내림' },
      { name: '상강', date: '10/23~24', desc: '서리가 내림' },
      { name: '입동', date: '11/7~8', desc: '겨울의 시작' },
      { name: '소설', date: '11/22~23', desc: '작은 눈' },
      { name: '대설', date: '12/7~8', desc: '큰 눈' },
      { name: '동지', date: '12/21~22', desc: '밤이 가장 긺' },
      { name: '소한', date: '1/5~6', desc: '작은 추위' },
      { name: '대한', date: '1/20~21', desc: '큰 추위' }
    ];
    const months = ['인월(1월)', '묘월(2월)', '진월(3월)', '사월(4월)', '오월(5월)', '미월(6월)', '신월(7월)', '유월(8월)', '술월(9월)', '해월(10월)', '자월(11월)', '축월(12월)'];
    let html = '<div class="jeolgi-intro"><p>절기는 태양의 위치에 따라 1년을 24등분한 것으로, 사주에서 <b>월주(月柱)</b>를 정하는 기준이 됩니다.</p></div>';
    html += '<div class="jeolgi-grid">';
    for (let i = 0; i < 12; i++) {
      const t1 = terms[i * 2], t2 = terms[i * 2 + 1];
      html += `<div class="jeolgi-month">
        <div class="jeolgi-month-title">${months[i]}</div>
        <div class="jeolgi-item"><span class="jeolgi-name">${t1.name}</span><span class="jeolgi-date">${t1.date}</span><span class="jeolgi-desc">${t1.desc}</span></div>
        <div class="jeolgi-item"><span class="jeolgi-name">${t2.name}</span><span class="jeolgi-date">${t2.date}</span><span class="jeolgi-desc">${t2.desc}</span></div>
      </div>`;
    }
    html += '</div>';
    createGuideModal('🌸 절기 달력', html);
  };

  // 사주 개념 가이드
  window.__showSajuGuide = () => {
    let html = `
    <div class="guide-intro">
      <p>사주(四柱)는 태어난 년, 월, 일, 시를 네 개의 기둥으로 표현한 것으로, 동양 철학의 핵심 개념인 음양오행을 바탕으로 인생을 해석합니다.</p>
    </div>

    <div class="saju-section">
      <h3>사주(四柱)란?</h3>
      <p>사주는 말 그대로 <b>네 개의 기둥</b>을 의미합니다:</p>
      <div class="saju-pillars">
        <div class="saju-pillar"><b>년주(年柱)</b><br>태어난 해<br><small>조상, 유년기</small></div>
        <div class="saju-pillar"><b>월주(月柱)</b><br>태어난 달<br><small>부모, 청년기</small></div>
        <div class="saju-pillar"><b>일주(日柱)</b><br>태어난 날<br><small>본인, 중년기</small></div>
        <div class="saju-pillar"><b>시주(時柱)</b><br>태어난 시간<br><small>자녀, 노년기</small></div>
      </div>
    </div>

    <div class="saju-section">
      <h3>천간(天干)과 지지(地支)</h3>
      <p>각 기둥은 <b>천간</b>(위)과 <b>지지</b>(아래)로 구성됩니다.</p>
      <div class="saju-ganzi">
        <div class="saju-gan">
          <b>천간(10개)</b><br>
          갑 을 병 정 무 기 경 신 임 계<br>
          <small>하늘의 기운, 정신적 영역</small>
        </div>
        <div class="saju-ji">
          <b>지지(12개)</b><br>
          자 축 인 묘 진 사 오 미 신 유 술 해<br>
          <small>땅의 기운, 물질적 영역 (12띠)</small>
        </div>
      </div>
    </div>

    <div class="saju-section">
      <h3>오행(五行)</h3>
      <p>우주 만물을 다섯 가지 기운으로 분류합니다:</p>
      <div class="saju-oheng">
        <span class="oh-mok">목(木) 나무</span>
        <span class="oh-hwa">화(火) 불</span>
        <span class="oh-to">토(土) 흙</span>
        <span class="oh-geum">금(金) 쇠</span>
        <span class="oh-su">수(水) 물</span>
      </div>
      <p><b>상생</b>: 목→화→토→금→수→목 (서로 도움)</p>
      <p><b>상극</b>: 목→토→수→화→금→목 (서로 억제)</p>
    </div>

    <div class="saju-section">
      <h3>일간(日干) - 나를 나타내는 글자</h3>
      <p><b>일주의 천간</b>이 바로 "나"를 나타냅니다. 사주 해석의 중심이 되며, 다른 글자들과의 관계를 통해 성격, 적성, 운세를 파악합니다.</p>
    </div>

    <div class="saju-section">
      <h3>십성(十星)</h3>
      <p>일간을 기준으로 다른 글자와의 관계를 10가지로 분류합니다:</p>
      <div class="saju-sipsung">
        <div><b>비겁</b>: 비견/겁재 - 동료, 경쟁</div>
        <div><b>식상</b>: 식신/상관 - 표현, 창작</div>
        <div><b>재성</b>: 편재/정재 - 재물, 현실</div>
        <div><b>관성</b>: 편관/정관 - 직업, 명예</div>
        <div><b>인성</b>: 편인/정인 - 학문, 지혜</div>
      </div>
    </div>

    <div class="saju-section">
      <h3>대운(大運)과 세운(歲運)</h3>
      <p><b>대운</b>: 10년 단위로 바뀌는 큰 흐름의 운</p>
      <p><b>세운</b>: 매년 바뀌는 해의 운</p>
      <p><b>월운</b>: 매월 바뀌는 달의 운</p>
      <p>원국(타고난 사주)과 운의 상호작용으로 길흉을 판단합니다.</p>
    </div>
    `;
    createGuideModal('사주 개념 가이드', html);
  };
}

// 모듈 export
export { SajuApp, app };
export default app;
