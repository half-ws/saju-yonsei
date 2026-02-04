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

  // 60갑자 가이드
  window.__showGapjaGuide = () => {
    const cheongan = ['갑(甲)', '을(乙)', '병(丙)', '정(丁)', '무(戊)', '기(己)', '경(庚)', '신(辛)', '임(壬)', '계(癸)'];
    const jiji = ['자(子)', '축(丑)', '인(寅)', '묘(卯)', '진(辰)', '사(巳)', '오(午)', '미(未)', '신(申)', '유(酉)', '술(戌)', '해(亥)'];
    const gapja = [];
    for (let i = 0; i < 60; i++) {
      gapja.push(cheongan[i % 10].charAt(0) + jiji[i % 12].charAt(0));
    }
    let html = '<div class="gapja-intro"><p>60갑자는 10천간과 12지지의 조합으로 60가지 경우의 수를 만든 것입니다. 년주, 월주, 일주, 시주 모두 60갑자 중 하나가 됩니다.</p></div>';
    html += '<div class="gapja-table"><table>';
    for (let row = 0; row < 6; row++) {
      html += '<tr>';
      for (let col = 0; col < 10; col++) {
        const idx = row * 10 + col;
        html += `<td class="gapja-cell">${idx + 1}. ${gapja[idx]}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></div>';
    createGuideModal('📊 60갑자 가이드', html);
  };

  // 십성 가이드
  window.__showSipsungGuide = () => {
    const sipsung = [
      { name: '비견', hanja: '比肩', emoji: '🤝', group: '비겁', desc: '나와 같은 오행, 같은 음양. 동료, 경쟁자, 형제자매를 의미' },
      { name: '겁재', hanja: '劫財', emoji: '⚔️', group: '비겁', desc: '나와 같은 오행, 다른 음양. 강한 경쟁심, 추진력을 의미' },
      { name: '식신', hanja: '食神', emoji: '🍽️', group: '식상', desc: '내가 생하는 오행, 같은 음양. 여유, 표현력, 재능을 의미' },
      { name: '상관', hanja: '傷官', emoji: '💫', group: '식상', desc: '내가 생하는 오행, 다른 음양. 창의성, 예술성, 반항심을 의미' },
      { name: '편재', hanja: '偏財', emoji: '💰', group: '재성', desc: '내가 극하는 오행, 다른 음양. 투자, 유동재산, 아버지를 의미' },
      { name: '정재', hanja: '正財', emoji: '🏦', group: '재성', desc: '내가 극하는 오행, 같은 음양. 저축, 고정재산, 안정을 의미' },
      { name: '편관', hanja: '偏官', emoji: '👮', group: '관성', desc: '나를 극하는 오행, 다른 음양. 권위, 통제, 압박감을 의미' },
      { name: '정관', hanja: '正官', emoji: '🎖️', group: '관성', desc: '나를 극하는 오행, 같은 음양. 명예, 책임감, 사회적 지위를 의미' },
      { name: '편인', hanja: '偏印', emoji: '📚', group: '인성', desc: '나를 생하는 오행, 다른 음양. 창의적 학습, 직관력을 의미' },
      { name: '정인', hanja: '正印', emoji: '📖', group: '인성', desc: '나를 생하는 오행, 같은 음양. 학문, 지혜, 어머니를 의미' }
    ];
    let html = '<div class="sipsung-intro"><p>십성은 일간(나)을 기준으로 다른 천간/지지와의 관계를 나타냅니다.</p></div>';
    html += '<div class="sipsung-grid">';
    for (const s of sipsung) {
      html += `<div class="sipsung-card">
        <div class="sipsung-header">${s.emoji} <b>${s.name}</b> <span class="sipsung-hanja">${s.hanja}</span></div>
        <div class="sipsung-group">${s.group}</div>
        <div class="sipsung-desc">${s.desc}</div>
      </div>`;
    }
    html += '</div>';
    createGuideModal('📖 십성 가이드', html);
  };

  // 천간 가이드
  window.__showCheonganGuide = () => {
    const cheongan = [
      { name: '갑', hanja: '甲', oheng: '목', yy: '양', emoji: '🌲', desc: '큰 나무, 시작과 진취, 리더십' },
      { name: '을', hanja: '乙', oheng: '목', yy: '음', emoji: '🌿', desc: '풀과 덩굴, 유연함, 적응력' },
      { name: '병', hanja: '丙', oheng: '화', yy: '양', emoji: '☀️', desc: '태양, 밝음과 열정, 화려함' },
      { name: '정', hanja: '丁', oheng: '화', yy: '음', emoji: '🕯️', desc: '촛불, 따뜻함, 섬세함' },
      { name: '무', hanja: '戊', oheng: '토', yy: '양', emoji: '🏔️', desc: '산과 언덕, 믿음직함, 중후함' },
      { name: '기', hanja: '己', oheng: '토', yy: '음', emoji: '🌾', desc: '평지와 논밭, 포용력, 인내심' },
      { name: '경', hanja: '庚', oheng: '금', yy: '양', emoji: '⚔️', desc: '강철과 도끼, 결단력, 정의감' },
      { name: '신', hanja: '辛', oheng: '금', yy: '음', emoji: '💎', desc: '보석과 바늘, 예민함, 완벽주의' },
      { name: '임', hanja: '壬', oheng: '수', yy: '양', emoji: '🌊', desc: '바다와 큰물, 지혜, 유연함' },
      { name: '계', hanja: '癸', oheng: '수', yy: '음', emoji: '💧', desc: '비와 이슬, 감수성, 직관력' }
    ];
    let html = '<div class="guide-intro"><p>천간(天干)은 하늘의 기운을 나타내며 10가지가 있습니다.</p></div>';
    html += '<div class="cheongan-grid">';
    for (const c of cheongan) {
      html += `<div class="cheongan-card cheongan-${c.oheng}">
        <div class="cheongan-main">${c.emoji} <b>${c.name}</b> <span class="cheongan-hanja">${c.hanja}</span></div>
        <div class="cheongan-info">${c.oheng} ${c.yy}</div>
        <div class="cheongan-desc">${c.desc}</div>
      </div>`;
    }
    html += '</div>';
    createGuideModal('☀️ 천간 가이드', html);
  };

  // 지지 가이드
  window.__showJijiGuide = () => {
    const jiji = [
      { name: '자', hanja: '子', oheng: '수', yy: '양', animal: '🐭 쥐', time: '23~01시', month: '11월' },
      { name: '축', hanja: '丑', oheng: '토', yy: '음', animal: '🐂 소', time: '01~03시', month: '12월' },
      { name: '인', hanja: '寅', oheng: '목', yy: '양', animal: '🐯 호랑이', time: '03~05시', month: '1월' },
      { name: '묘', hanja: '卯', oheng: '목', yy: '음', animal: '🐰 토끼', time: '05~07시', month: '2월' },
      { name: '진', hanja: '辰', oheng: '토', yy: '양', animal: '🐲 용', time: '07~09시', month: '3월' },
      { name: '사', hanja: '巳', oheng: '화', yy: '음', animal: '🐍 뱀', time: '09~11시', month: '4월' },
      { name: '오', hanja: '午', oheng: '화', yy: '양', animal: '🐴 말', time: '11~13시', month: '5월' },
      { name: '미', hanja: '未', oheng: '토', yy: '음', animal: '🐑 양', time: '13~15시', month: '6월' },
      { name: '신', hanja: '申', oheng: '금', yy: '양', animal: '🐵 원숭이', time: '15~17시', month: '7월' },
      { name: '유', hanja: '酉', oheng: '금', yy: '음', animal: '🐔 닭', time: '17~19시', month: '8월' },
      { name: '술', hanja: '戌', oheng: '토', yy: '양', animal: '🐶 개', time: '19~21시', month: '9월' },
      { name: '해', hanja: '亥', oheng: '수', yy: '음', animal: '🐷 돼지', time: '21~23시', month: '10월' }
    ];
    let html = '<div class="guide-intro"><p>지지(地支)는 땅의 기운을 나타내며 12가지가 있습니다. 12띠와 대응됩니다.</p></div>';
    html += '<div class="jiji-grid">';
    for (const j of jiji) {
      html += `<div class="jiji-card jiji-${j.oheng}">
        <div class="jiji-main"><b>${j.name}</b> <span class="jiji-hanja">${j.hanja}</span></div>
        <div class="jiji-animal">${j.animal}</div>
        <div class="jiji-info">${j.oheng} ${j.yy}</div>
        <div class="jiji-time">${j.time} · ${j.month}</div>
      </div>`;
    }
    html += '</div>';
    createGuideModal('🌙 지지 가이드', html);
  };

  // 음양오행 가이드
  window.__showOhengGuide = () => {
    let html = `<div class="guide-intro"><p>음양오행은 동양 철학의 핵심으로, 우주 만물을 설명하는 원리입니다.</p></div>
    <div class="oheng-section">
      <h3>☯️ 음양(陰陽)</h3>
      <div class="yy-grid">
        <div class="yy-card yy-yang"><b>양(陽)</b> - 밝음, 따뜻함, 활동적, 외향적, 확장</div>
        <div class="yy-card yy-eum"><b>음(陰)</b> - 어둠, 차가움, 정적, 내향적, 수축</div>
      </div>
    </div>
    <div class="oheng-section">
      <h3>🔄 오행(五行)</h3>
      <div class="oheng-grid">
        <div class="oheng-card oheng-mok"><span class="oheng-icon">🌲</span><b>목(木)</b><p>봄, 동쪽, 푸름<br>성장, 인자함</p></div>
        <div class="oheng-card oheng-hwa"><span class="oheng-icon">🔥</span><b>화(火)</b><p>여름, 남쪽, 빨강<br>열정, 예의</p></div>
        <div class="oheng-card oheng-to"><span class="oheng-icon">🏔️</span><b>토(土)</b><p>중앙, 노랑<br>안정, 믿음</p></div>
        <div class="oheng-card oheng-geum"><span class="oheng-icon">⚔️</span><b>금(金)</b><p>가을, 서쪽, 흰색<br>결단, 의리</p></div>
        <div class="oheng-card oheng-su"><span class="oheng-icon">💧</span><b>수(水)</b><p>겨울, 북쪽, 검정<br>지혜, 적응</p></div>
      </div>
    </div>
    <div class="oheng-section">
      <h3>상생(相生) · 상극(相剋)</h3>
      <div class="relation-grid">
        <div class="relation-card relation-good"><b>상생</b> - 서로 도움<br>목→화→토→금→수→목</div>
        <div class="relation-card relation-bad"><b>상극</b> - 서로 억제<br>목→토→수→화→금→목</div>
      </div>
    </div>`;
    createGuideModal('🔄 음양오행 가이드', html);
  };

  // 합충형파 가이드
  window.__showHapchungGuide = () => {
    let html = `<div class="guide-intro"><p>합충형파해는 지지(地支) 사이의 특별한 관계를 나타냅니다.</p></div>
    <div class="hapchung-section">
      <h3>💕 육합(六合) - 서로 끌리는 관계</h3>
      <div class="hapchung-list">자축합토 · 인해합목 · 묘술합화 · 진유합금 · 사신합수 · 오미합화</div>
    </div>
    <div class="hapchung-section">
      <h3>🤝 삼합(三合) - 세 지지가 모여 힘을 이룸</h3>
      <div class="hapchung-list">인오술(화국) · 사유축(금국) · 신자진(수국) · 해묘미(목국)</div>
    </div>
    <div class="hapchung-section">
      <h3>⚡ 충(冲) - 정면충돌, 갈등</h3>
      <div class="hapchung-list">자오충 · 축미충 · 인신충 · 묘유충 · 진술충 · 사해충</div>
    </div>
    <div class="hapchung-section">
      <h3>😤 형(刑) - 형벌, 갈등과 시련</h3>
      <div class="hapchung-list">인사신(무은지형) · 축술미(은혜지형) · 자묘(무례지형) · 진진/오오/유유/해해(자형)</div>
    </div>
    <div class="hapchung-section">
      <h3>💔 파(破) · 해(害)</h3>
      <div class="hapchung-list">파: 자유파 · 축진파 · 인해파 · 묘오파 · 사신파 · 미술파<br>해: 자미해 · 축오해 · 인사해 · 묘진해 · 신해해 · 유술해</div>
    </div>`;
    createGuideModal('⚡ 합충형파 가이드', html);
  };

  // 십이운성 가이드
  window.__showTwelveStageGuide = () => {
    const stages = [
      { name: '절', hanja: '絶', emoji: '🌑', desc: '완전한 소멸, 새로운 시작 직전' },
      { name: '태', hanja: '胎', emoji: '🌱', desc: '잉태, 새 생명의 시작' },
      { name: '양', hanja: '養', emoji: '🤱', desc: '양육, 성장을 위한 준비' },
      { name: '장생', hanja: '長生', emoji: '👶', desc: '탄생, 힘차게 시작함' },
      { name: '목욕', hanja: '沐浴', emoji: '🛁', desc: '불안정, 시행착오기' },
      { name: '관대', hanja: '冠帶', emoji: '👔', desc: '성장, 사회 진출' },
      { name: '건록', hanja: '建祿', emoji: '💼', desc: '전성기, 활동력 최고조' },
      { name: '제왕', hanja: '帝旺', emoji: '👑', desc: '정점, 최고의 힘과 권위' },
      { name: '쇠', hanja: '衰', emoji: '📉', desc: '쇠퇴, 서서히 약해짐' },
      { name: '병', hanja: '病', emoji: '🤒', desc: '병약, 활력 저하' },
      { name: '사', hanja: '死', emoji: '⚰️', desc: '사망, 활동 정지' },
      { name: '묘', hanja: '墓', emoji: '🪦', desc: '입묘, 저장과 보관' }
    ];
    let html = '<div class="guide-intro"><p>십이운성은 일간이 지지를 만났을 때의 기운 상태를 나타냅니다. 인생의 12단계에 비유됩니다.</p></div>';
    html += '<div class="twelve-grid">';
    for (const s of stages) {
      html += `<div class="twelve-card">
        <div class="twelve-emoji">${s.emoji}</div>
        <div class="twelve-name"><b>${s.name}</b> <span class="twelve-hanja">${s.hanja}</span></div>
        <div class="twelve-desc">${s.desc}</div>
      </div>`;
    }
    html += '</div>';
    createGuideModal('🔄 십이운성 가이드', html);
  };
}

// 모듈 export
export { SajuApp, app };
export default app;
