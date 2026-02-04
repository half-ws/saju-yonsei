/**
 * 연세사주 - 탭 네비게이션 모듈
 * 
 * 탭 전환 및 콘텐츠 표시를 관리하는 모듈
 * - 메인 결과 탭 (원국, 대운, 세운, 오늘의 운, 궁합)
 * - 탭 상태 관리
 * - URL 해시 연동
 * - 키보드 네비게이션
 */

import { appState } from '../core/state.js';
import { $, $$, $id, delegate } from '../utils/dom.js';

/**
 * 탭 정의
 */
export const TABS = {
  WONKUK: 'wonkuk',       // 원국
  DAEUN: 'daeun',         // 대운
  SAEUN: 'saeun',         // 세운
  TODAY: 'today',         // 오늘의 운
  GUNGHAP: 'gunghap'      // 궁합
};

/**
 * 탭 라벨
 */
export const TAB_LABELS = {
  [TABS.WONKUK]: '원국',
  [TABS.DAEUN]: '대운',
  [TABS.SAEUN]: '세운',
  [TABS.TODAY]: '오늘의 운',
  [TABS.GUNGHAP]: '궁합'
};

/**
 * 탭 아이콘 (이모지)
 */
export const TAB_ICONS = {
  [TABS.WONKUK]: '🔮',
  [TABS.DAEUN]: '🌊',
  [TABS.SAEUN]: '📅',
  [TABS.TODAY]: '☀️',
  [TABS.GUNGHAP]: '💕'
};

/**
 * 탭 네비게이션 컨트롤러
 */
export class TabNavigation {
  constructor(options = {}) {
    this.state = appState;
    
    // 옵션
    this.options = {
      containerSelector: '#tab-container',
      navSelector: '#tab-nav',
      contentSelector: '#tab-content',
      useHash: true,
      animateTransition: true,
      ...options
    };
    
    // 요소 참조
    this.container = null;
    this.nav = null;
    this.content = null;
    this.tabs = [];
    this.panels = [];
    
    // 현재 탭
    this.currentTab = TABS.WONKUK;
    
    // 탭별 렌더러 (외부에서 등록)
    this.renderers = {};
  }
  
  /**
   * 초기화
   */
  init() {
    // 요소 찾기
    this.container = $(this.options.containerSelector);
    this.nav = $(this.options.navSelector);
    this.content = $(this.options.contentSelector);
    
    if (!this.container && !this.nav) {
      console.warn('Tab container or nav not found');
      return;
    }
    
    // 탭 구조 생성 (없으면)
    if (this.nav && !this.nav.querySelector('[role="tab"]')) {
      this.renderTabNav();
    }
    
    // 탭/패널 요소 수집
    this.tabs = Array.from(this.nav?.querySelectorAll('[role="tab"]') || []);
    this.panels = Array.from(this.content?.querySelectorAll('[role="tabpanel"]') || []);
    
    // 이벤트 바인딩
    this.setupEventListeners();
    
    // 초기 탭 설정
    this.initializeFromHash();
    
    // 상태 구독
    this.state.on('resultChange', () => this.onResultChange());
    this.state.on('activeTabChange', (tab) => this.switchTab(tab, false));
  }
  
  /**
   * 탭 네비게이션 렌더링
   */
  renderTabNav() {
    if (!this.nav) return;
    
    const tabsHtml = Object.entries(TABS).map(([key, id]) => `
      <button 
        role="tab" 
        id="tab-${id}" 
        aria-controls="panel-${id}" 
        aria-selected="${id === TABS.WONKUK ? 'true' : 'false'}"
        tabindex="${id === TABS.WONKUK ? '0' : '-1'}"
        data-tab="${id}"
        class="tab-btn${id === TABS.WONKUK ? ' active' : ''}"
      >
        <span class="tab-icon">${TAB_ICONS[id]}</span>
        <span class="tab-label">${TAB_LABELS[id]}</span>
      </button>
    `).join('');
    
    this.nav.innerHTML = tabsHtml;
    this.nav.setAttribute('role', 'tablist');
    this.nav.setAttribute('aria-label', '사주 분석 탭');
  }
  
  /**
   * 탭 패널 구조 생성
   */
  renderTabPanels() {
    if (!this.content) return;
    
    const panelsHtml = Object.entries(TABS).map(([key, id]) => `
      <div 
        role="tabpanel" 
        id="panel-${id}" 
        aria-labelledby="tab-${id}"
        class="tab-panel${id === TABS.WONKUK ? ' active' : ''}"
        ${id !== TABS.WONKUK ? 'hidden' : ''}
      >
        <div class="tab-panel-content" id="panel-content-${id}">
          <!-- 탭별 콘텐츠가 여기에 렌더링됨 -->
        </div>
      </div>
    `).join('');
    
    this.content.innerHTML = panelsHtml;
  }
  
  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    // 탭 클릭 (이벤트 위임)
    delegate(this.nav, 'click', '[role="tab"]', (e, tab) => {
      e.preventDefault();
      const tabId = tab.dataset.tab;
      this.switchTab(tabId);
    });
    
    // 키보드 네비게이션
    this.nav?.addEventListener('keydown', (e) => this.handleKeydown(e));
    
    // URL 해시 변경
    if (this.options.useHash) {
      window.addEventListener('hashchange', () => this.handleHashChange());
    }
  }
  
  /**
   * 키보드 네비게이션 처리
   */
  handleKeydown(e) {
    const tabIds = Object.values(TABS);
    const currentIndex = tabIds.indexOf(this.currentTab);
    let newIndex = currentIndex;
    
    switch (e.key) {
      case 'ArrowLeft':
        newIndex = currentIndex > 0 ? currentIndex - 1 : tabIds.length - 1;
        e.preventDefault();
        break;
      case 'ArrowRight':
        newIndex = currentIndex < tabIds.length - 1 ? currentIndex + 1 : 0;
        e.preventDefault();
        break;
      case 'Home':
        newIndex = 0;
        e.preventDefault();
        break;
      case 'End':
        newIndex = tabIds.length - 1;
        e.preventDefault();
        break;
      default:
        return;
    }
    
    if (newIndex !== currentIndex) {
      this.switchTab(tabIds[newIndex]);
      this.tabs[newIndex]?.focus();
    }
  }
  
  /**
   * URL 해시에서 초기 탭 설정
   */
  initializeFromHash() {
    if (!this.options.useHash) {
      this.switchTab(TABS.WONKUK, false);
      return;
    }
    
    const hash = window.location.hash.slice(1);
    const tabId = Object.values(TABS).find(id => id === hash);
    
    this.switchTab(tabId || TABS.WONKUK, false);
  }
  
  /**
   * URL 해시 변경 처리
   */
  handleHashChange() {
    const hash = window.location.hash.slice(1);
    const tabId = Object.values(TABS).find(id => id === hash);
    
    if (tabId && tabId !== this.currentTab) {
      this.switchTab(tabId, false);
    }
  }
  
  /**
   * 탭 전환
   * @param {string} tabId - 탭 ID
   * @param {boolean} updateHash - URL 해시 업데이트 여부
   */
  switchTab(tabId, updateHash = true) {
    if (!tabId || !Object.values(TABS).includes(tabId)) {
      console.warn('Invalid tab ID:', tabId);
      return;
    }
    
    if (tabId === this.currentTab) {
      return;
    }
    
    const previousTab = this.currentTab;
    this.currentTab = tabId;
    
    // 탭 버튼 상태 업데이트
    this.updateTabButtons(tabId);
    
    // 패널 상태 업데이트
    this.updatePanels(tabId, previousTab);
    
    // URL 해시 업데이트
    if (updateHash && this.options.useHash) {
      history.replaceState(null, '', `#${tabId}`);
    }
    
    // 상태 업데이트 (무한 루프 방지)
    if (this.state.get('activeTab') !== tabId) {
      this.state.setActiveTab(tabId);
    }
    
    // 탭 변경 이벤트 발행
    this.state.emit('tabChanged', { 
      current: tabId, 
      previous: previousTab 
    });
    
    // 탭 콘텐츠 렌더링
    this.renderTabContent(tabId);
  }
  
  /**
   * 탭 버튼 상태 업데이트
   */
  updateTabButtons(activeTabId) {
    this.tabs.forEach(tab => {
      const isActive = tab.dataset.tab === activeTabId;
      
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }
  
  /**
   * 패널 상태 업데이트
   */
  updatePanels(activeTabId, previousTabId) {
    this.panels.forEach(panel => {
      const panelId = panel.id.replace('panel-', '');
      const isActive = panelId === activeTabId;
      const wasPrevious = panelId === previousTabId;
      
      if (this.options.animateTransition) {
        // 애니메이션 전환
        if (wasPrevious) {
          panel.classList.add('fade-out');
          setTimeout(() => {
            panel.classList.remove('active', 'fade-out');
            panel.hidden = true;
          }, 150);
        }
        
        if (isActive) {
          setTimeout(() => {
            panel.hidden = false;
            panel.classList.add('active', 'fade-in');
            setTimeout(() => {
              panel.classList.remove('fade-in');
            }, 150);
          }, previousTabId ? 150 : 0);
        }
      } else {
        // 즉시 전환
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
      }
    });
  }
  
  /**
   * 탭 콘텐츠 렌더링
   */
  renderTabContent(tabId) {
    const renderer = this.renderers[tabId];
    const contentContainer = $id(`panel-content-${tabId}`);
    
    if (!renderer || !contentContainer) {
      return;
    }
    
    const result = this.state.get('currentResult');
    
    if (!result) {
      contentContainer.innerHTML = this.getEmptyStateHtml(tabId);
      return;
    }
    
    // 렌더러 실행
    try {
      renderer(contentContainer, result);
    } catch (error) {
      console.error(`Error rendering tab ${tabId}:`, error);
      contentContainer.innerHTML = this.getErrorStateHtml(tabId, error);
    }
  }
  
  /**
   * 결과 변경 시 현재 탭 다시 렌더링
   */
  onResultChange() {
    this.renderTabContent(this.currentTab);
  }
  
  /**
   * 탭 렌더러 등록
   * @param {string} tabId - 탭 ID
   * @param {Function} renderer - 렌더링 함수 (container, result) => void
   */
  registerRenderer(tabId, renderer) {
    if (typeof renderer !== 'function') {
      console.warn('Renderer must be a function');
      return;
    }
    
    this.renderers[tabId] = renderer;
  }
  
  /**
   * 여러 렌더러 한번에 등록
   */
  registerRenderers(renderers) {
    Object.entries(renderers).forEach(([tabId, renderer]) => {
      this.registerRenderer(tabId, renderer);
    });
  }
  
  /**
   * 빈 상태 HTML
   */
  getEmptyStateHtml(tabId) {
    const messages = {
      [TABS.WONKUK]: '생년월일시를 입력하고 계산 버튼을 눌러주세요.',
      [TABS.DAEUN]: '먼저 원국을 계산해주세요.',
      [TABS.SAEUN]: '먼저 원국을 계산해주세요.',
      [TABS.TODAY]: '먼저 원국을 계산해주세요.',
      [TABS.GUNGHAP]: '궁합을 보려면 두 사람의 정보를 입력해주세요.'
    };
    
    return `
      <div class="empty-state">
        <div class="empty-icon">${TAB_ICONS[tabId]}</div>
        <p class="empty-message">${messages[tabId] || '데이터가 없습니다.'}</p>
      </div>
    `;
  }
  
  /**
   * 에러 상태 HTML
   */
  getErrorStateHtml(tabId, error) {
    return `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <p class="error-message">렌더링 중 오류가 발생했습니다.</p>
        <p class="error-detail">${error.message || ''}</p>
      </div>
    `;
  }
  
  /**
   * 특정 탭 활성화/비활성화
   */
  setTabEnabled(tabId, enabled) {
    const tab = this.tabs.find(t => t.dataset.tab === tabId);
    
    if (tab) {
      tab.disabled = !enabled;
      tab.classList.toggle('disabled', !enabled);
      
      if (!enabled && this.currentTab === tabId) {
        // 비활성화된 탭이 현재 탭이면 첫 번째 활성 탭으로 이동
        const firstEnabled = this.tabs.find(t => !t.disabled);
        if (firstEnabled) {
          this.switchTab(firstEnabled.dataset.tab);
        }
      }
    }
  }
  
  /**
   * 궁합 탭 표시/숨김
   */
  toggleGunghapTab(show) {
    this.setTabEnabled(TABS.GUNGHAP, show);
    
    const tab = this.tabs.find(t => t.dataset.tab === TABS.GUNGHAP);
    if (tab) {
      tab.style.display = show ? '' : 'none';
    }
  }
  
  /**
   * 현재 탭 가져오기
   */
  getCurrentTab() {
    return this.currentTab;
  }
  
  /**
   * 정리
   */
  destroy() {
    // 이벤트 리스너 정리
    window.removeEventListener('hashchange', this.handleHashChange);
    
    this.tabs = [];
    this.panels = [];
    this.renderers = {};
    this.container = null;
    this.nav = null;
    this.content = null;
  }
}

/**
 * 하위 탭 네비게이션 (원국 내 상세 탭 등)
 */
export class SubTabNavigation extends TabNavigation {
  constructor(options = {}) {
    super({
      useHash: false,
      animateTransition: false,
      ...options
    });
  }
}

export default TabNavigation;
