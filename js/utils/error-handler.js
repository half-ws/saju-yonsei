/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 - 에러 처리 모듈
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 커스텀 에러 클래스
 */
export class SajuError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SajuError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * 에러 코드 정의
 */
export const ErrorCodes = {
  // 입력 관련
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TIME: 'INVALID_TIME',
  INVALID_GENDER: 'INVALID_GENDER',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // 계산 관련
  CALCULATION_FAILED: 'CALCULATION_FAILED',
  TERM_NOT_FOUND: 'TERM_NOT_FOUND',
  INDEX_OUT_OF_RANGE: 'INDEX_OUT_OF_RANGE',
  
  // 데이터 관련
  DATA_NOT_FOUND: 'DATA_NOT_FOUND',
  STORAGE_ERROR: 'STORAGE_ERROR',
  
  // DOM 관련
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  RENDER_FAILED: 'RENDER_FAILED'
};

/**
 * 에러 메시지 맵
 */
const ErrorMessages = {
  [ErrorCodes.INVALID_DATE]: '유효하지 않은 날짜입니다.',
  [ErrorCodes.INVALID_TIME]: '유효하지 않은 시간입니다.',
  [ErrorCodes.INVALID_GENDER]: '성별을 선택해주세요.',
  [ErrorCodes.INVALID_INPUT]: '입력값이 올바르지 않습니다.',
  [ErrorCodes.CALCULATION_FAILED]: '계산 중 오류가 발생했습니다.',
  [ErrorCodes.TERM_NOT_FOUND]: '절기 정보를 찾을 수 없습니다.',
  [ErrorCodes.INDEX_OUT_OF_RANGE]: '인덱스 범위를 벗어났습니다.',
  [ErrorCodes.DATA_NOT_FOUND]: '데이터를 찾을 수 없습니다.',
  [ErrorCodes.STORAGE_ERROR]: '저장소 접근 중 오류가 발생했습니다.',
  [ErrorCodes.ELEMENT_NOT_FOUND]: 'DOM 요소를 찾을 수 없습니다.',
  [ErrorCodes.RENDER_FAILED]: '화면 렌더링에 실패했습니다.'
};

/**
 * 에러 생성 헬퍼
 */
export function createError(code, details = {}) {
  const message = ErrorMessages[code] || '알 수 없는 오류가 발생했습니다.';
  return new SajuError(message, code, details);
}

/**
 * 안전한 함수 실행 래퍼
 * @param {Function} fn - 실행할 함수
 * @param {*} fallback - 에러 시 반환할 기본값
 * @param {Object} context - 에러 컨텍스트
 * @returns {*} 함수 실행 결과 또는 fallback
 */
export function safeExecute(fn, fallback = null, context = {}) {
  try {
    const result = fn();
    // Promise 처리
    if (result instanceof Promise) {
      return result.catch(error => {
        handleError(error, context);
        return fallback;
      });
    }
    return result;
  } catch (error) {
    handleError(error, context);
    return fallback;
  }
}

/**
 * 에러 핸들러
 */
export function handleError(error, context = {}) {
  const errorInfo = {
    message: error.message,
    code: error.code || 'UNKNOWN',
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  };

  // 개발 환경에서는 콘솔에 출력
  if (typeof process === 'undefined' || process?.env?.NODE_ENV !== 'production') {
    console.error('[연세사주 Error]', errorInfo);
  }

  // 에러 로깅 (향후 확장 가능)
  logError(errorInfo);

  return errorInfo;
}

/**
 * 에러 로깅
 */
function logError(errorInfo) {
  // 로컬 스토리지에 최근 에러 저장 (디버깅용)
  try {
    const errors = JSON.parse(localStorage.getItem('saju_errors') || '[]');
    errors.unshift(errorInfo);
    // 최근 10개만 유지
    localStorage.setItem('saju_errors', JSON.stringify(errors.slice(0, 10)));
  } catch {
    // 스토리지 에러는 무시
  }
}

/**
 * 입력 검증 유틸리티
 */
export const Validator = {
  /**
   * 날짜 유효성 검사
   */
  isValidDate(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return false;
    }
    if (year < 1800 || year > 2100) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    // 실제 날짜 유효성 검사
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year &&
           date.getMonth() === month - 1 &&
           date.getDate() === day;
  },

  /**
   * 시간 유효성 검사
   */
  isValidTime(hour, minute) {
    if (hour === '' || hour === null || hour === undefined) {
      return true; // 시간 미상 허용
    }
    const h = parseInt(hour, 10);
    const m = parseInt(minute || 0, 10);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  },

  /**
   * 성별 유효성 검사
   */
  isValidGender(gender) {
    return gender === 'm' || gender === 'f';
  },

  /**
   * 전체 입력 검증
   */
  validateInput(data) {
    const errors = [];

    if (!this.isValidDate(data.year, data.month, data.day)) {
      errors.push(createError(ErrorCodes.INVALID_DATE, { 
        year: data.year, 
        month: data.month, 
        day: data.day 
      }));
    }

    if (!this.isValidTime(data.hour, data.minute)) {
      errors.push(createError(ErrorCodes.INVALID_TIME, { 
        hour: data.hour, 
        minute: data.minute 
      }));
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

/**
 * Result 타입 (Rust의 Result 패턴)
 * 에러와 성공을 명시적으로 구분
 */
export class Result {
  constructor(value, error = null) {
    this._value = value;
    this._error = error;
  }

  static ok(value) {
    return new Result(value, null);
  }

  static err(error) {
    return new Result(null, error);
  }

  isOk() {
    return this._error === null;
  }

  isErr() {
    return this._error !== null;
  }

  unwrap() {
    if (this.isErr()) {
      throw this._error;
    }
    return this._value;
  }

  unwrapOr(defaultValue) {
    return this.isOk() ? this._value : defaultValue;
  }

  map(fn) {
    if (this.isErr()) return this;
    return Result.ok(fn(this._value));
  }

  mapErr(fn) {
    if (this.isOk()) return this;
    return Result.err(fn(this._error));
  }
}

export default {
  SajuError,
  ErrorCodes,
  createError,
  safeExecute,
  handleError,
  Validator,
  Result
};
