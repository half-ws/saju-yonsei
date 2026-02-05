/**
 * 연세사주 - 입력 폼 핸들러 모듈
 * 
 * 사용자 입력을 처리하고 유효성을 검사하는 모듈
 * - 생년월일시 입력 처리
 * - 성별 선택 처리
 * - 시간 미상 처리
 * - 입력 유효성 검사
 * - 셀러브리티/개인 DB 선택
 */

import { appState, dbManager } from '../core/state.js';
import { Validator, safeExecute, SajuError, ErrorCodes } from '../utils/error-handler.js';
import { $, $id, delegate, debounce, safeInt } from '../utils/dom.js';
import { LUNAR_MONTHS, TIME_DISPLAY } from '../core/constants.js';

/**
 * 입력 폼 핸들러
 */
export class FormHandler {
  constructor() {
    this.state = appState;
    this.db = dbManager;
    
    // 폼 요소 참조 (lazy initialization)
    this._elements = null;
    
    // 디바운스된 검색 함수
    this.debouncedSearch = debounce(this.handleDbSearch.bind(this), 300);
  }
  
  /**
   * 폼 요소들을 lazy하게 가져옴
   */
  get elements() {
    if (!this._elements) {
      this._elements = {
        // 입력 필드 (HTML의 in-* 형식)
        yearInput: $id('in-year'),
        monthInput: $id('in-month'),
        dayInput: $id('in-day'),
        hourSelect: $id('in-hour'),
        minuteInput: $id('in-min'),
        // 성별 (HTML의 gender-m, gender-f)
        genderMale: $id('gender-m'),
        genderFemale: $id('gender-f'),
        // 기타 컨트롤
        unknownTimeCheck: $id('unknown-time'),
        calendarTypeSelect: $id('calendar-type'),
        leapMonthCheck: $id('leap-month'),
        // 버튼 (HTML의 btn-* 형식)
        calcButton: $id('btn-calculate'),
        resetButton: $id('btn-reset'),
        // DB 관련
        dbTypeSelect: $id('db-type-toggle'),
        dbSearchInput: $id('db-search'),
        dbResultsList: $id('db-list')
      };
    }
    return this._elements;
  }
  
  /**
   * 폼 초기화 및 이벤트 바인딩
   */
  init() {
    this.setupEventListeners();
    this.populateTimeOptions();
    this.populateCalendarOptions();
    this.restoreLastInput();
    
    // 상태 변경 구독
    this.state.on('dbTypeChange', (type) => this.handleDbTypeChange(type));
  }
  
  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    const {
      yearInput, monthInput, dayInput, hourSelect, minuteInput,
      genderMale, genderFemale, unknownTimeCheck, calendarTypeSelect,
      leapMonthCheck, calcButton, resetButton, dbSearchInput, dbTypeSelect
    } = this.elements;

    // 입력 필드 변경 감지 - 스마트 입력 제한
    yearInput?.addEventListener('input', () => this.smartInputLimit(yearInput, 1900, 2100));
    monthInput?.addEventListener('input', () => this.smartInputLimit(monthInput, 1, 12));
    dayInput?.addEventListener('input', () => this.smartInputLimit(dayInput, 1, 31));
    hourSelect?.addEventListener('input', () => this.smartInputLimit(hourSelect, 0, 23));
    minuteInput?.addEventListener('input', () => this.smartInputLimit(minuteInput, 0, 59));

    // 성별 선택 (버튼 클릭)
    genderMale?.addEventListener('click', () => this.handleGenderChange('m'));
    genderFemale?.addEventListener('click', () => this.handleGenderChange('f'));

    // 시간 미상 체크박스 (HTML에 없으면 무시)
    unknownTimeCheck?.addEventListener('change', (e) => this.handleUnknownTimeChange(e.target.checked));

    // 음력/양력 선택 시 윤달 옵션 표시 (HTML에 없으면 무시)
    calendarTypeSelect?.addEventListener('change', (e) => this.handleCalendarTypeChange(e.target.value));

    // 계산 버튼
    calcButton?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleCalculate();
    });

    // 초기화 버튼
    resetButton?.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleReset();
    });

    // DB 타입 선택
    dbTypeSelect?.addEventListener('change', (e) => this.handleDbTypeSelect(e.target.value));

    // DB 검색
    dbSearchInput?.addEventListener('input', (e) => this.debouncedSearch(e.target.value));

    // Enter 키로 계산 (global-calc-body 영역에서)
    const calcBody = $id('global-calc-body');
    calcBody?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this.handleCalculate();
      }
    });

    // DB 결과 목록 클릭 (이벤트 위임)
    delegate(this.elements.dbResultsList, 'click', '[data-person-id]', (e, target) => {
      const personId = target.dataset.personId;
      this.selectPersonFromDb(personId);
    });

    // Stepper 버튼 이벤트 (년/월/일/시/분)
    this.setupStepperButtons();
  }

  /**
   * Stepper 버튼 이벤트 설정
   */
  setupStepperButtons() {
    const stepBtns = document.querySelectorAll('.step-btn');

    stepBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const field = btn.dataset.field;
        const delta = parseInt(btn.dataset.delta) || 0;

        let input;
        switch (field) {
          case 'year': input = this.elements.yearInput; break;
          case 'month': input = this.elements.monthInput; break;
          case 'day': input = this.elements.dayInput; break;
          case 'hour': input = this.elements.hourSelect; break;
          case 'min': input = this.elements.minuteInput; break;
        }

        if (input) {
          const current = parseInt(input.value) || 0;
          let newVal = current + delta;

          // 범위 제한
          const min = parseInt(input.min) || 0;
          const max = parseInt(input.max) || 9999;
          newVal = Math.max(min, Math.min(max, newVal));

          input.value = newVal;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
  }
  
  /**
   * 시간 옵션 채우기
   */
  populateTimeOptions() {
    const { hourSelect } = this.elements;
    if (!hourSelect) return;

    // input type="number"인 경우 건너뜀
    if (hourSelect.tagName === 'INPUT') {
      return;
    }

    // select인 경우에만 옵션 채우기
    hourSelect.innerHTML = '';

    // 미상 옵션
    const unknownOption = document.createElement('option');
    unknownOption.value = '';
    unknownOption.textContent = '시간 선택';
    hourSelect.appendChild(unknownOption);

    // 12시진 옵션 (자시~해시)
    TIME_DISPLAY.forEach((display, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = display;
      hourSelect.appendChild(option);
    });
  }
  
  /**
   * 양력/음력 옵션
   */
  populateCalendarOptions() {
    const { calendarTypeSelect } = this.elements;
    if (!calendarTypeSelect) return;
    
    calendarTypeSelect.innerHTML = `
      <option value="solar">양력</option>
      <option value="lunar">음력</option>
    `;
  }
  
  /**
   * 마지막 입력값 복원
   */
  restoreLastInput() {
    try {
      const saved = localStorage.getItem('lastSajuInput');
      if (saved) {
        const data = JSON.parse(saved);
        // localStorage 데이터 검증
        const validated = {
          year: safeInt(data.year, 0, 1900, 2100),
          month: safeInt(data.month, 0, 1, 12),
          day: safeInt(data.day, 0, 1, 31),
          hour: data.hour !== null && data.hour !== undefined ? safeInt(data.hour, null, 0, 23) : undefined,
          minute: safeInt(data.minute, 0, 0, 59),
          gender: data.gender === 'm' || data.gender === 'f' ? data.gender : 'm',
          unknownTime: !!data.unknownTime,
          calendarType: data.calendarType === 'solar' || data.calendarType === 'lunar' ? data.calendarType : 'solar',
          leapMonth: !!data.leapMonth
        };
        // 최소 필수값 검증
        if (validated.year >= 1900 && validated.month >= 1 && validated.day >= 1) {
          this.setFormValues(validated);
        }
      }
    } catch (e) {
      // 무시 (잘못된 JSON 등)
    }
  }
  
  /**
   * 입력값 저장
   */
  saveInput(data) {
    try {
      localStorage.setItem('lastSajuInput', JSON.stringify(data));
    } catch (e) {
      // 무시
    }
  }
  
  /**
   * 폼에 값 설정
   */
  setFormValues(data) {
    const { 
      yearInput, monthInput, dayInput, hourSelect, minuteInput,
      genderMale, genderFemale, unknownTimeCheck, calendarTypeSelect, leapMonthCheck
    } = this.elements;
    
    if (data.year) yearInput.value = data.year;
    if (data.month) monthInput.value = data.month;
    if (data.day) dayInput.value = data.day;
    if (data.hour !== undefined) hourSelect.value = data.hour;
    if (data.minute !== undefined) minuteInput.value = data.minute;
    
    if (data.gender === 'male') {
      genderMale.checked = true;
    } else if (data.gender === 'female') {
      genderFemale.checked = true;
    }
    
    if (data.unknownTime !== undefined) {
      unknownTimeCheck.checked = data.unknownTime;
      this.handleUnknownTimeChange(data.unknownTime);
    }
    
    if (data.calendarType) {
      calendarTypeSelect.value = data.calendarType;
      this.handleCalendarTypeChange(data.calendarType);
    }
    
    if (data.leapMonth !== undefined) {
      leapMonthCheck.checked = data.leapMonth;
    }
  }
  
  /**
   * 폼에서 값 가져오기
   */
  getFormValues() {
    const {
      yearInput, monthInput, dayInput, hourSelect, minuteInput,
      genderMale, unknownTimeCheck, calendarTypeSelect, leapMonthCheck
    } = this.elements;

    // 성별: 버튼의 active 클래스로 확인
    const isMale = genderMale?.classList.contains('active') ?? true;

    // 시간: input이면 value가 빈 문자열이거나 숫자
    const hourVal = hourSelect?.value;
    const hour = (hourVal !== '' && hourVal !== undefined && hourVal !== null)
      ? parseInt(hourVal)
      : null;

    return {
      year: parseInt(yearInput?.value) || 0,
      month: parseInt(monthInput?.value) || 0,
      day: parseInt(dayInput?.value) || 0,
      hour: isNaN(hour) ? null : hour,
      minute: parseInt(minuteInput?.value) || 0,
      gender: isMale ? 'm' : 'f',
      unknownTime: unknownTimeCheck?.checked || (hour === null),
      calendarType: calendarTypeSelect?.value || 'solar',
      leapMonth: leapMonthCheck?.checked || false
    };
  }

  /**
   * 스마트 입력 제한 - 범위 초과 시 마지막 숫자 삭제
   */
  smartInputLimit(input, min, max) {
    if (!input) return;

    const value = input.value;
    if (value === '' || value === '-') return;

    const numValue = parseInt(value);

    // 값이 최대값을 초과하면 마지막 숫자 삭제
    if (!isNaN(numValue) && numValue > max) {
      input.value = value.slice(0, -1);
    }

    // 음수 방지 (min이 0 이상인 경우)
    if (min >= 0 && numValue < 0) {
      input.value = '';
    }

    this.clearFieldError(input);
  }

  /**
   * 연도 유효성 검사
   */
  validateYear() {
    const { yearInput } = this.elements;
    const value = parseInt(yearInput?.value);

    if (isNaN(value) || value < 1900 || value > 2100) {
      return false;
    }

    return true;
  }

  /**
   * 월 유효성 검사
   */
  validateMonth() {
    const { monthInput } = this.elements;
    const value = parseInt(monthInput?.value);

    if (isNaN(value) || value < 1 || value > 12) {
      return false;
    }

    return true;
  }

  /**
   * 일 유효성 검사
   */
  validateDay() {
    const { dayInput, yearInput, monthInput } = this.elements;
    const day = parseInt(dayInput?.value);
    const year = parseInt(yearInput?.value);
    const month = parseInt(monthInput?.value);

    if (isNaN(day) || day < 1 || day > 31) {
      return false;
    }

    // 월별 최대 일수 체크
    if (year && month) {
      const maxDay = new Date(year, month, 0).getDate();
      if (day > maxDay) {
        return false;
      }
    }

    return true;
  }

  /**
   * 분 유효성 검사
   */
  validateMinute() {
    const { minuteInput, unknownTimeCheck } = this.elements;

    if (unknownTimeCheck?.checked) return true;

    const value = parseInt(minuteInput?.value);

    if (isNaN(value) || value < 0 || value > 59) {
      return false;
    }

    return true;
  }
  
  /**
   * 전체 폼 유효성 검사
   */
  validateForm() {
    const values = this.getFormValues();

    const validations = [
      this.validateYear(),
      this.validateMonth(),
      this.validateDay()
    ];

    // 시간이 입력된 경우에만 분 유효성 검사
    if (values.hour !== null && !isNaN(values.hour)) {
      validations.push(this.validateMinute());
    }

    return validations.every(v => v === true);
  }
  
  /**
   * 필드 에러 표시
   */
  showFieldError(field, message) {
    if (!field) return;
    
    field.classList.add('error');
    
    // 기존 에러 메시지 제거
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) existingError.remove();
    
    // 새 에러 메시지 추가
    const errorEl = document.createElement('span');
    errorEl.className = 'field-error';
    errorEl.textContent = message;
    field.parentNode.appendChild(errorEl);
  }
  
  /**
   * 필드 에러 제거
   */
  clearFieldError(field) {
    if (!field) return;
    
    field.classList.remove('error');
    const errorEl = field.parentNode.querySelector('.field-error');
    if (errorEl) errorEl.remove();
  }
  
  /**
   * 모든 에러 제거
   */
  clearAllErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  }
  
  /**
   * 성별 변경 처리
   */
  handleGenderChange(gender) {
    const { genderMale, genderFemale } = this.elements;
    
    // 버튼 active 상태 토글
    if (gender === 'm') {
      genderMale?.classList.add('active');
      genderFemale?.classList.remove('active');
      genderMale?.setAttribute('aria-checked', 'true');
      genderFemale?.setAttribute('aria-checked', 'false');
    } else {
      genderMale?.classList.remove('active');
      genderFemale?.classList.add('active');
      genderMale?.setAttribute('aria-checked', 'false');
      genderFemale?.setAttribute('aria-checked', 'true');
    }
    
    this.state.setGender(gender);
  }
  
  /**
   * 시간 미상 변경 처리
   */
  handleUnknownTimeChange(checked) {
    const { hourSelect, minuteInput } = this.elements;
    
    if (checked) {
      if (hourSelect) {
        hourSelect.disabled = true;
        hourSelect.value = '';
        this.clearFieldError(hourSelect);
      }
      if (minuteInput) {
        minuteInput.disabled = true;
        minuteInput.value = '';
        this.clearFieldError(minuteInput);
      }
    } else {
      if (hourSelect) hourSelect.disabled = false;
      if (minuteInput) minuteInput.disabled = false;
    }
    
    this.state.set('hasTime', !checked);
  }
  
  /**
   * 달력 타입 변경 처리
   */
  handleCalendarTypeChange(type) {
    const leapMonthContainer = $id('leap-month-container');
    
    if (type === 'lunar') {
      leapMonthContainer?.classList.remove('hidden');
    } else {
      leapMonthContainer?.classList.add('hidden');
    }
  }
  
  /**
   * 계산 버튼 처리
   */
  async handleCalculate() {
    // 유효성 검사
    if (!this.validateForm()) {
      return;
    }
    
    const values = this.getFormValues();
    
    // 입력값 저장
    this.saveInput(values);
    
    // 로딩 상태 설정
    this.state.setLoading(true);
    this.elements.calcButton?.classList.add('loading');
    
    try {
      // 음력→양력 변환이 필요한 경우
      let solarDate = { year: values.year, month: values.month, day: values.day };
      
      if (values.calendarType === 'lunar') {
        solarDate = await this.convertLunarToSolar(
          values.year, values.month, values.day, values.leapMonth
        );
      }
      
      // 계산 이벤트 발행 (App에서 처리)
      this.state.emit('calculate', {
        ...solarDate,
        hour: values.unknownTime ? null : values.hour,
        minute: values.unknownTime ? 0 : values.minute,
        gender: values.gender,
        hasTime: !values.unknownTime,
        originalInput: values
      });
      
    } catch (error) {
      console.error('계산 오류:', error);
      this.showCalculationError(error);
    } finally {
      this.state.setLoading(false);
      this.elements.calcButton?.classList.remove('loading');
    }
  }
  
  /**
   * 음력→양력 변환
   */
  async convertLunarToSolar(year, month, day, isLeapMonth) {
    // 음력 변환 로직 (외부 라이브러리 또는 테이블 사용)
    // 여기서는 기본 구현만 제공
    // 실제 구현은 korean-lunar-calendar 등 사용
    
    // TODO: 음력 변환 라이브러리 통합
    // 임시로 그대로 반환
    console.warn('음력 변환 기능은 추후 구현 예정입니다. 양력으로 처리합니다.');
    return { year, month, day };
  }
  
  /**
   * 초기화 버튼 처리
   */
  handleReset() {
    this.clearAllErrors();
    
    const { 
      yearInput, monthInput, dayInput, hourSelect, minuteInput,
      unknownTimeCheck, calendarTypeSelect, leapMonthCheck
    } = this.elements;
    
    // 오늘 날짜로 설정
    const today = new Date();
    if (yearInput) yearInput.value = today.getFullYear();
    if (monthInput) monthInput.value = today.getMonth() + 1;
    if (dayInput) dayInput.value = today.getDate();
    if (hourSelect) hourSelect.value = '';
    if (minuteInput) minuteInput.value = '';
    if (unknownTimeCheck) unknownTimeCheck.checked = false;
    if (calendarTypeSelect) calendarTypeSelect.value = 'solar';
    if (leapMonthCheck) leapMonthCheck.checked = false;
    
    this.handleUnknownTimeChange(false);
    this.handleCalendarTypeChange('solar');
    this.handleGenderChange('m');
    
    // 결과 초기화
    this.state.reset();
  }
  
  /**
   * DB 타입 선택 처리
   */
  handleDbTypeSelect(type) {
    this.state.set('dbType', type);
  }
  
  /**
   * DB 타입 변경 처리 (상태 구독)
   */
  handleDbTypeChange(type) {
    const { dbSearchInput, dbResultsList } = this.elements;
    
    // 검색 입력 및 결과 초기화
    if (dbSearchInput) dbSearchInput.value = '';
    if (dbResultsList) dbResultsList.innerHTML = '';
    
    // 타입별 placeholder 설정
    if (dbSearchInput) {
      dbSearchInput.placeholder = type === 'celebrity' 
        ? '연예인/유명인 검색...' 
        : '저장된 사주 검색...';
    }
  }
  
  /**
   * DB 검색 처리
   */
  handleDbSearch(query) {
    const { dbResultsList } = this.elements;
    const dbType = this.state.get('dbType');
    
    if (!query || query.length < 2) {
      dbResultsList.innerHTML = '';
      return;
    }
    
    const results = this.db.search(query, dbType);
    this.renderDbResults(results);
  }
  
  /**
   * DB 검색 결과 렌더링
   */
  renderDbResults(results) {
    const { dbResultsList } = this.elements;
    
    if (!results || results.length === 0) {
      dbResultsList.innerHTML = '<li class="no-results">검색 결과가 없습니다</li>';
      return;
    }
    
    const html = results.slice(0, 20).map(person => `
      <li data-person-id="${person.id}" class="db-result-item">
        <span class="name">${this.escapeHtml(person.name)}</span>
        ${person.birthYear ? `<span class="birth">${person.birthYear}년생</span>` : ''}
        ${person.job ? `<span class="job">${this.escapeHtml(person.job)}</span>` : ''}
      </li>
    `).join('');
    
    dbResultsList.innerHTML = html;
  }
  
  /**
   * DB에서 사람 선택
   */
  selectPersonFromDb(personId) {
    const dbType = this.state.get('dbType');
    const person = this.db.getById(personId, dbType);
    
    if (!person) {
      console.warn('Person not found:', personId);
      return;
    }
    
    // 폼에 값 설정
    this.setFormValues({
      year: person.year,
      month: person.month,
      day: person.day,
      hour: person.hour,
      minute: person.minute || 0,
      gender: person.gender,
      unknownTime: person.hour === null || person.hour === undefined,
      calendarType: person.calendarType || 'solar',
      leapMonth: person.leapMonth || false
    });
    
    // 검색 결과 닫기
    this.elements.dbResultsList.innerHTML = '';
    this.elements.dbSearchInput.value = person.name;
    
    // 이벤트 발행
    this.state.emit('personSelected', person);
  }
  
  /**
   * 계산 에러 표시
   */
  showCalculationError(error) {
    const message = error instanceof SajuError 
      ? error.userMessage 
      : '계산 중 오류가 발생했습니다. 입력을 확인해주세요.';
    
    // 토스트 또는 알림 표시
    this.showToast(message, 'error');
  }
  
  /**
   * 토스트 메시지 표시
   */
  showToast(message, type = 'info') {
    // 기존 토스트 제거
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 애니메이션
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    // 자동 제거
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  /**
   * HTML 이스케이프
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  /**
   * 정리
   */
  destroy() {
    // 이벤트 리스너 정리는 필요시 구현
    this._elements = null;
  }
}

/**
 * 개인 DB 관리 폼 핸들러
 */
export class PersonalDbFormHandler {
  constructor() {
    this.db = dbManager;
    this.formHandler = null; // 메인 폼 핸들러 참조
  }
  
  /**
   * 메인 폼 핸들러 연결
   */
  setFormHandler(handler) {
    this.formHandler = handler;
  }
  
  /**
   * 현재 입력값을 개인 DB에 저장
   */
  saveCurrentToDb(name) {
    if (!this.formHandler) {
      console.error('FormHandler not connected');
      return null;
    }
    
    const values = this.formHandler.getFormValues();
    
    if (!name || name.trim() === '') {
      throw new Error('이름을 입력해주세요');
    }
    
    const person = {
      id: `personal_${Date.now()}`,
      name: name.trim(),
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.unknownTime ? null : values.hour,
      minute: values.minute,
      gender: values.gender,
      calendarType: values.calendarType,
      leapMonth: values.leapMonth,
      createdAt: new Date().toISOString()
    };
    
    this.db.addPerson(person, 'personal');
    return person;
  }
  
  /**
   * 개인 DB에서 삭제
   */
  removeFromDb(personId) {
    return this.db.removePerson(personId, 'personal');
  }
  
  /**
   * DB 내보내기
   */
  exportDb() {
    return this.db.exportPersonalDb();
  }
  
  /**
   * DB 가져오기
   */
  importDb(jsonData) {
    return this.db.importPersonalDb(jsonData);
  }
}

export default FormHandler;
