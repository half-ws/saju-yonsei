/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 - DOM 유틸리티 모듈
 * ═══════════════════════════════════════════════════════════════════════════
 * 효율적인 DOM 조작을 위한 유틸리티 함수들
 */

/**
 * 요소 선택 헬퍼
 */
export const $ = (selector, context = document) => context.querySelector(selector);
export const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
export const $id = (id) => document.getElementById(id);

/**
 * DocumentFragment를 사용한 효율적인 요소 생성
 */
export function createElement(tag, attributes = {}, children = []) {
  const el = document.createElement(tag);
  
  // 속성 설정
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className' || key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(el.dataset, value);
    } else if (key === 'textContent' || key === 'text') {
      el.textContent = value;
    } else if (key === 'innerHTML' || key === 'html') {
      el.innerHTML = value;
    } else {
      el.setAttribute(key, value);
    }
  });
  
  // 자식 요소 추가
  if (Array.isArray(children)) {
    children.forEach(child => {
      if (child instanceof Node) {
        el.appendChild(child);
      } else if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      }
    });
  } else if (children instanceof Node) {
    el.appendChild(children);
  } else if (typeof children === 'string') {
    el.textContent = children;
  }
  
  return el;
}

/**
 * 약어 헬퍼
 */
export const div = (attrs, children) => createElement('div', attrs, children);
export const span = (attrs, children) => createElement('span', attrs, children);
export const button = (attrs, children) => createElement('button', attrs, children);
export const input = (attrs) => createElement('input', attrs);

/**
 * 템플릿 리터럴 기반 HTML 파싱 (안전한 방식)
 */
export function html(strings, ...values) {
  const template = document.createElement('template');
  template.innerHTML = strings.reduce((acc, str, i) => {
    const value = values[i - 1];
    if (value instanceof Node) {
      return acc + '<!--PLACEHOLDER-->' + str;
    }
    return acc + escapeHtml(String(value ?? '')) + str;
  });
  
  // Node 값들을 placeholder에 삽입
  const fragment = template.content;
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_COMMENT);
  let nodeIndex = 0;
  let node;
  
  while ((node = walker.nextNode())) {
    if (node.textContent === 'PLACEHOLDER') {
      const value = values.filter(v => v instanceof Node)[nodeIndex++];
      if (value) {
        node.parentNode.replaceChild(value, node);
      }
    }
  }
  
  return fragment;
}

/**
 * HTML 이스케이프
 * @param {string} str - 이스케이프할 문자열
 * @returns {string} 이스케이프된 문자열
 */
export function escapeHtml(str) {
  if (str == null) return '';
  if (typeof str !== 'string') str = String(str);
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return str.replace(/[&<>"']/g, char => escapeMap[char]);
}

/**
 * CSS 값 새니타이징 (CSS 인젝션 방지)
 * @param {string} value - CSS 값
 * @returns {string} 안전한 CSS 값
 */
export function sanitizeCSS(value) {
  if (value == null) return '';
  if (typeof value !== 'string') value = String(value);
  // 위험한 CSS 패턴 제거: url(), expression(), javascript:, behavior, @import
  return value
    .replace(/url\s*\(/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/@import/gi, '')
    .replace(/[<>'"]/g, '');
}

/**
 * 안전한 숫자 값 반환
 * @param {any} value - 검사할 값
 * @param {number} defaultValue - 기본값
 * @param {number} min - 최소값
 * @param {number} max - 최대값
 * @returns {number} 안전한 숫자 값
 */
export function safeNumber(value, defaultValue = 0, min = -Infinity, max = Infinity) {
  const num = parseFloat(value);
  if (isNaN(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

/**
 * 안전한 정수 값 반환
 * @param {any} value - 검사할 값
 * @param {number} defaultValue - 기본값
 * @param {number} min - 최소값
 * @param {number} max - 최대값
 * @returns {number} 안전한 정수 값
 */
export function safeInt(value, defaultValue = 0, min = -Infinity, max = Infinity) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

/**
 * 배치 DOM 업데이트 (requestAnimationFrame 활용)
 */
class BatchUpdater {
  constructor() {
    this.pending = [];
    this.scheduled = false;
  }

  add(callback) {
    this.pending.push(callback);
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this.scheduled) return;
    this.scheduled = true;
    
    requestAnimationFrame(() => {
      const callbacks = this.pending;
      this.pending = [];
      this.scheduled = false;
      
      callbacks.forEach(cb => {
        try {
          cb();
        } catch (error) {
          console.error('[BatchUpdater] Error:', error);
        }
      });
    });
  }
}

export const batchUpdater = new BatchUpdater();

/**
 * Virtual DOM 방식의 효율적인 리스트 렌더링
 */
export function renderList(container, items, renderItem, keyFn = (item, i) => i) {
  const fragment = document.createDocumentFragment();
  const existingMap = new Map();
  
  // 기존 요소 맵핑
  Array.from(container.children).forEach((child, index) => {
    const key = child.dataset.key;
    if (key !== undefined) {
      existingMap.set(key, { element: child, index });
    }
  });
  
  const newKeys = new Set();
  
  items.forEach((item, index) => {
    const key = String(keyFn(item, index));
    newKeys.add(key);
    
    const existing = existingMap.get(key);
    
    if (existing) {
      // 기존 요소 재사용 (업데이트만)
      const updated = renderItem(item, index, existing.element);
      if (updated !== existing.element) {
        fragment.appendChild(updated);
      } else {
        fragment.appendChild(existing.element);
      }
    } else {
      // 새 요소 생성
      const el = renderItem(item, index);
      el.dataset.key = key;
      fragment.appendChild(el);
    }
  });
  
  // 컨테이너 업데이트
  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * 디바운스
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 쓰로틀
 */
export function throttle(fn, limit = 100) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 안전한 innerHTML 설정 (XSS 방지)
 */
export function setInnerHTML(element, html) {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  if (!element) {
    console.warn('[setInnerHTML] Element not found');
    return;
  }
  
  // DocumentFragment 사용
  const template = document.createElement('template');
  template.innerHTML = html;
  
  element.innerHTML = '';
  element.appendChild(template.content.cloneNode(true));
}

/**
 * 클래스 토글 헬퍼
 */
export const classHelper = {
  add: (el, ...classes) => el?.classList.add(...classes),
  remove: (el, ...classes) => el?.classList.remove(...classes),
  toggle: (el, className, force) => el?.classList.toggle(className, force),
  has: (el, className) => el?.classList.contains(className)
};

/**
 * 요소 표시/숨김
 */
export const visibility = {
  show: (el, display = 'block') => {
    if (el) el.style.display = display;
  },
  hide: (el) => {
    if (el) el.style.display = 'none';
  },
  toggle: (el, show, display = 'block') => {
    if (el) el.style.display = show ? display : 'none';
  }
};

/**
 * 이벤트 위임 헬퍼
 */
export function delegate(container, eventType, selector, handler) {
  if (!container) {
    console.warn('[delegate] Container not found for selector:', selector);
    return;
  }
  container.addEventListener(eventType, (e) => {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) {
      handler.call(target, e, target);
    }
  });
}

/**
 * 안전한 요소 접근
 */
export function safeElement(selector, callback, fallback = null) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (el) {
    return callback(el);
  }
  return fallback;
}

/**
 * 애니메이션 트랜지션 래퍼
 */
export function animateElement(element, keyframes, options = {}) {
  return new Promise((resolve) => {
    const defaultOptions = {
      duration: 300,
      easing: 'ease-out',
      fill: 'forwards'
    };
    
    const animation = element.animate(keyframes, { ...defaultOptions, ...options });
    animation.onfinish = () => resolve(element);
  });
}

/**
 * 페이드 인/아웃
 */
export const fade = {
  in: (el, duration = 300) => animateElement(el, [
    { opacity: 0 },
    { opacity: 1 }
  ], { duration }),
  
  out: (el, duration = 300) => animateElement(el, [
    { opacity: 1 },
    { opacity: 0 }
  ], { duration })
};

/**
 * 스크롤 관련
 */
export const scroll = {
  toElement: (el, options = {}) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start', ...options });
  },

  toTop: () => window.scrollTo({ top: 0, behavior: 'smooth' }),

  lock: () => document.body.style.overflow = 'hidden',

  unlock: () => document.body.style.overflow = ''
};

/**
 * 스마트 입력 제한 - 범위 초과 시 마지막 숫자 삭제
 * @param {HTMLInputElement} input - 입력 요소
 * @param {number} min - 최소값 (기본 0)
 * @param {number} max - 최대값
 */
export function smartInputLimit(input, min = 0, max) {
  if (!input) return;

  const value = input.value;
  if (value === '' || value === '-') return;

  const numValue = parseInt(value, 10);

  // 값이 최대값을 초과하면 마지막 숫자 삭제
  if (!isNaN(numValue) && numValue > max) {
    input.value = value.slice(0, -1);
  }

  // 음수 방지 (min이 0 이상인 경우)
  if (min >= 0 && numValue < 0) {
    input.value = '';
  }
}

export default {
  $, $$, $id,
  createElement, div, span, button, input,
  html, escapeHtml, sanitizeCSS, safeNumber, safeInt,
  batchUpdater, renderList,
  debounce, throttle,
  setInnerHTML, classHelper, visibility,
  delegate, safeElement,
  animateElement, fade, scroll,
  smartInputLimit
};
