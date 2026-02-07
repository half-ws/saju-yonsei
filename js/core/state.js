/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 - 상태 관리 모듈 (State Manager)
 * ═══════════════════════════════════════════════════════════════════════════
 * 모든 전역 상태를 중앙에서 관리하는 싱글톤 패턴
 */

/**
 * 이벤트 버스 - 상태 변경 알림용
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    // unsubscribe 함수 반환
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[EventBus] Error in listener for "${event}":`, error);
      }
    });
  }
}

/**
 * 앱 상태 클래스
 */
class AppState {
  constructor() {
    // 싱글톤 체크
    if (AppState.instance) {
      return AppState.instance;
    }
    AppState.instance = this;

    this.eventBus = new EventBus();
    
    // 상태 초기화
    this._state = {
      // 현재 계산 결과
      currentResult: null,
      hasTime: false,
      gender: null,
      
      // UI 상태
      activeTab: 'main',
      isCalculatorCollapsed: false,
      selectedDaeun: null,
      selectedSaeun: null,
      
      // 궁합 상태
      gunghap: {
        personA: null,
        personB: null,
        result: null
      },
      
      // DB 상태
      currentDbType: 'celebrity', // 'celebrity' | 'personal'
      searchQuery: '',
      filterOptions: {},
      
      // 로딩 상태
      isLoading: false,
      loadingMessage: ''
    };

    // 상태 변경 이력 (디버깅용)
    this._history = [];
    this._maxHistory = 50;
  }

  /**
   * 상태 조회
   */
  get(key) {
    if (key) {
      return this._getNestedValue(this._state, key);
    }
    return { ...this._state };
  }

  /**
   * 중첩 키 값 조회 ('a.b.c' 형식 지원)
   */
  _getNestedValue(obj, path) {
    if (typeof path !== 'string') return undefined;
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 중첩 키 값 설정
   */
  _setNestedValue(obj, path, value) {
    if (typeof path !== 'string') return;
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (current[key] === undefined) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * 상태 설정
   */
  set(key, value, silent = false) {
    const oldValue = this.get(key);
    
    // 이력 저장
    this._history.push({
      timestamp: Date.now(),
      key,
      oldValue,
      newValue: value
    });
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    // 값 설정
    if (typeof key === 'object') {
      // 객체로 여러 값 동시 설정
      Object.entries(key).forEach(([k, v]) => {
        this._setNestedValue(this._state, k, v);
      });
    } else {
      this._setNestedValue(this._state, key, value);
    }

    // 이벤트 발생
    if (!silent) {
      this.eventBus.emit('stateChange', { key, oldValue, newValue: value });
      this.eventBus.emit(`stateChange:${key}`, { oldValue, newValue: value });
    }

    return this;
  }

  /**
   * 사주 계산 결과 설정
   */
  setResult(result, hasTime = false) {
    this.set({
      currentResult: result,
      hasTime
    });
    this.eventBus.emit('resultCalculated', { result, hasTime });
    return this;
  }

  /**
   * 성별 설정
   */
  setGender(gender) {
    this.set('gender', gender);
    this.eventBus.emit('genderChanged', gender);
    return this;
  }

  /**
   * 탭 변경
   */
  setActiveTab(tabId) {
    const oldTab = this._state.activeTab;
    this.set('activeTab', tabId);
    this.eventBus.emit('tabChanged', { from: oldTab, to: tabId });
    return this;
  }

  /**
   * 대운 선택
   */
  selectDaeun(daeunData) {
    this.set('selectedDaeun', daeunData);
    this.eventBus.emit('daeunSelected', daeunData);
    return this;
  }

  /**
   * 세운 선택
   */
  selectSaeun(saeunData) {
    this.set('selectedSaeun', saeunData);
    this.eventBus.emit('saeunSelected', saeunData);
    return this;
  }

  /**
   * 궁합 데이터 설정
   */
  setGunghap(personKey, data) {
    this.set(`gunghap.${personKey}`, data);
    this.eventBus.emit('gunghapUpdated', { personKey, data });
    return this;
  }

  /**
   * 로딩 상태 설정
   */
  setLoading(isLoading, message = '') {
    this.set({
      isLoading,
      loadingMessage: message
    });
    this.eventBus.emit('loadingChanged', { isLoading, message });
    return this;
  }

  /**
   * 상태 리셋
   */
  reset(keys = null) {
    if (keys === null) {
      // 전체 리셋
      this._state = {
        currentResult: null,
        hasTime: false,
        gender: null,
        activeTab: 'main',
        isCalculatorCollapsed: false,
        selectedDaeun: null,
        selectedSaeun: null,
        gunghap: { personA: null, personB: null, result: null },
        currentDbType: 'celebrity',
        searchQuery: '',
        filterOptions: {},
        isLoading: false,
        loadingMessage: ''
      };
    } else {
      // 특정 키만 리셋
      const defaultValues = {
        currentResult: null,
        hasTime: false,
        gender: null,
        activeTab: 'main',
        selectedDaeun: null,
        selectedSaeun: null
      };
      
      (Array.isArray(keys) ? keys : [keys]).forEach(key => {
        if (defaultValues.hasOwnProperty(key)) {
          this.set(key, defaultValues[key], true);
        }
      });
    }
    
    this.eventBus.emit('stateReset', keys);
    return this;
  }

  /**
   * 이벤트 구독
   */
  subscribe(event, callback) {
    return this.eventBus.on(event, callback);
  }

  /**
   * 이벤트 구독 (별칭)
   */
  on(event, callback) {
    return this.eventBus.on(event, callback);
  }

  /**
   * 이벤트 발생
   */
  emit(event, data) {
    this.eventBus.emit(event, data);
  }

  /**
   * 상태 스냅샷 반환
   */
  getSnapshot() {
    return { ...this._state };
  }

  /**
   * 디버그용 상태 출력
   */
  debug() {
    console.group('[AppState Debug]');
    console.log('Current State:', this._state);
    console.log('Recent History:', this._history.slice(-10));
    console.groupEnd();
    return this._state;
  }
}

/**
 * DB 매니저 - 인물 데이터베이스 관리
 */
class DatabaseManager {
  constructor() {
    if (DatabaseManager.instance) {
      return DatabaseManager.instance;
    }
    DatabaseManager.instance = this;

    this.celebrityDb = [];
    this.personalDb = [];
    this.initialized = false;
  }

  /**
   * 데이터베이스 초기화
   */
  init(celebrityData = [], personalData = []) {
    this.celebrityDb = celebrityData;

    // 사용자가 추가한 유명인 데이터 로드 및 병합
    try {
      const customCeleb = localStorage.getItem('celebrity_db_custom');
      if (customCeleb) {
        const parsed = JSON.parse(customCeleb);
        if (Array.isArray(parsed)) {
          parsed.filter(p => this._validatePerson(p)).forEach(p => {
            const exists = this.celebrityDb.some(c =>
              c.name === p.name && c.year === p.year && c.month === p.month && c.day === p.day
            );
            if (!exists) this.celebrityDb.push(p);
          });
        }
      }
    } catch { /* 무시 */ }

    // 개인 DB는 로컬 스토리지에서 로드 시도
    try {
      const stored = localStorage.getItem('personal_db');
      if (stored) {
        const parsed = JSON.parse(stored);
        // localStorage 데이터 검증
        this.personalDb = Array.isArray(parsed) ? parsed.filter(p => this._validatePerson(p)) : personalData;
      } else {
        this.personalDb = personalData;
      }
    } catch {
      this.personalDb = personalData;
    }

    this.initialized = true;
    return this;
  }

  /**
   * Firestore DB 인스턴스 가져오기
   */
  _getFirestoreDb() {
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        return firebase.firestore();
      }
    } catch (e) {
      console.warn('[DatabaseManager] Firestore not available:', e);
    }
    return null;
  }

  /**
   * 유명인을 Firestore에 저장
   */
  async _saveCelebrityToFirestore(person) {
    const db = this._getFirestoreDb();
    if (!db || !person.contributor) return;
    try {
      await db.collection('celebrity_custom').add({
        name: person.name,
        year: person.year,
        month: person.month,
        day: person.day,
        hour: person.hour ?? '',
        min: person.min || 0,
        gender: person.gender || '',
        note: person.note || '',
        source: person.source || '',
        contributor: person.contributor
      });
      console.log(`[DatabaseManager] Firestore에 ${person.name} 저장 완료`);
    } catch (e) {
      console.error('[DatabaseManager] Firestore 저장 실패:', e);
    }
  }

  /**
   * Firestore에서 커스텀 유명인 로드
   */
  async _loadCelebritiesFromFirestore() {
    const db = this._getFirestoreDb();
    if (!db) return;
    try {
      const snapshot = await db.collection('celebrity_custom').get();
      let addedCount = 0;
      snapshot.docs.forEach(doc => {
        const p = doc.data();
        if (!this._validatePerson(p)) return;
        const exists = this.celebrityDb.some(c =>
          c.name === p.name && c.year === p.year && c.month === p.month && c.day === p.day
        );
        if (!exists) {
          if (p.contributor && p.contributor.addedAt && typeof p.contributor.addedAt.toDate === 'function') {
            p.contributor.addedAt = p.contributor.addedAt.toDate().toISOString();
          }
          this.celebrityDb.push(p);
          addedCount++;
        }
      });
      if (addedCount > 0) {
        console.log(`[DatabaseManager] Firestore에서 ${addedCount}명 추가 로드`);
        this._saveCelebrityCustom();
      } else {
        console.log(`[DatabaseManager] Firestore: 새로운 커스텀 유명인 없음 (총 ${snapshot.size}개)`);
      }
    } catch (e) {
      console.error('[DatabaseManager] Firestore 커스텀 유명인 로드 실패:', e);
    }
  }

  /**
   * Firestore에서 유명인 삭제
   */
  async _deleteCelebrityFromFirestore(person) {
    const db = this._getFirestoreDb();
    if (!db) return;
    try {
      const snapshot = await db.collection('celebrity_custom')
        .where('name', '==', person.name)
        .where('year', '==', person.year)
        .where('month', '==', person.month)
        .where('day', '==', person.day)
        .get();
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
      if (snapshot.size > 0) {
        console.log(`[DatabaseManager] Firestore에서 ${person.name} 삭제 완료`);
      }
    } catch (e) {
      console.error('[DatabaseManager] Firestore 삭제 실패:', e);
    }
  }

  /**
   * 유명인 DB 사용자 추가분 저장
   */
  _saveCelebrityCustom() {
    try {
      const custom = this.celebrityDb.filter(p => p.contributor);
      const json = JSON.stringify(custom);
      localStorage.setItem('celebrity_db_custom', json);
      // 저장 검증
      const verify = localStorage.getItem('celebrity_db_custom');
      if (verify === json) {
        console.log(`[DatabaseManager] ✅ Saved ${custom.length} custom celebrities (${json.length} bytes)`);
      } else {
        console.error('[DatabaseManager] ❌ localStorage save verification FAILED');
      }
    } catch (e) {
      console.error('[DatabaseManager] Failed to save celebrity custom DB:', e);
    }
  }

  /**
   * 인물 데이터 유효성 검증
   * @param {Object} person - 검증할 인물 객체
   * @param {string} person.name - 이름 (1-100자)
   * @param {number|string} person.year - 출생년도 (1900-2100)
   * @param {number|string} person.month - 출생월 (1-12)
   * @param {number|string} person.day - 출생일 (1-31)
   * @returns {boolean} 유효하면 true, 아니면 false
   * @private
   */
  _validatePerson(person) {
    if (!person || typeof person !== 'object') return false;
    const year = parseInt(person.year, 10);
    const month = parseInt(person.month, 10);
    const day = parseInt(person.day, 10);
    // 필수 필드 검증
    if (isNaN(year) || year < 1900 || year > 2100) return false;
    if (isNaN(month) || month < 1 || month > 12) return false;
    if (isNaN(day) || day < 1 || day > 31) return false;
    // 이름 검증 (문자열이어야 함)
    if (typeof person.name !== 'string' || person.name.length === 0 || person.name.length > 100) return false;
    return true;
  }

  /**
   * 인물 추가
   */
  addPerson(person, dbType = 'personal') {
    // 입력 데이터 검증
    if (!this._validatePerson(person)) {
      return { success: false, message: '유효하지 않은 인물 데이터입니다.' };
    }

    const db = dbType === 'celebrity' ? this.celebrityDb : this.personalDb;

    // 중복 체크
    const exists = db.some(p =>
      p.name === person.name &&
      p.year === person.year &&
      p.month === person.month &&
      p.day === person.day
    );

    if (exists) {
      return { success: false, message: '이미 존재하는 인물입니다.' };
    }

    db.push(person);

    if (dbType === 'personal') {
      this._savePersonalDb();
    } else if (dbType === 'celebrity') {
      this._saveCelebrityCustom();
      this._saveCelebrityToFirestore(person);
    }

    return { success: true, message: '추가되었습니다.' };
  }

  /**
   * 인물 삭제
   */
  removePerson(index, dbType = 'personal') {
    const db = dbType === 'celebrity' ? this.celebrityDb : this.personalDb;

    if (index < 0 || index >= db.length) {
      return { success: false, message: '유효하지 않은 인덱스입니다.' };
    }

    const removed = db[index];
    db.splice(index, 1);

    if (dbType === 'personal') {
      this._savePersonalDb();
    } else if (dbType === 'celebrity') {
      this._saveCelebrityCustom();
      if (removed && removed.contributor) {
        this._deleteCelebrityFromFirestore(removed);
      }
    }

    return { success: true, message: '삭제되었습니다.' };
  }

  /**
   * 인물 검색
   */
  search(query, dbType = 'celebrity') {
    const db = dbType === 'celebrity' ? this.celebrityDb : this.personalDb;
    const q = query.toLowerCase().trim();

    if (!q) return db;

    return db.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.note && p.note.toLowerCase().includes(q)) return true;
      // 생년월일 검색 (예: "1990", "1990.3", "1990년", "3월 15일")
      const dateStr = `${p.year}${p.month}${p.day} ${p.year}.${p.month}.${p.day} ${p.year}년 ${p.month}월 ${p.day}일 ${p.year}-${p.month}-${p.day}`;
      if (dateStr.includes(q)) return true;
      return false;
    });
  }

  /**
   * 인물 조회
   */
  getAll(dbType = 'celebrity') {
    return dbType === 'celebrity' ? this.celebrityDb : this.personalDb;
  }

  /**
   * 개인 DB 저장
   */
  _savePersonalDb() {
    try {
      localStorage.setItem('personal_db', JSON.stringify(this.personalDb));
    } catch (error) {
      console.error('[DatabaseManager] Failed to save personal DB:', error);
    }
  }

  /**
   * 개인 DB 내보내기
   */
  exportPersonalDb() {
    const data = JSON.stringify(this.personalDb, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal_db_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * 개인 DB 가져오기
   */
  importPersonalDb(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (!Array.isArray(data)) {
        throw new Error('유효하지 않은 데이터 형식');
      }
      
      this.personalDb = data;
      this._savePersonalDb();
      
      return { success: true, count: data.length };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * 기본 데이터 로드 (비동기)
   */
  async loadDefaults() {
    if (this.initialized) {
      return this;
    }

    try {
      // 유명인 DB 로드 시도 (index.html 기준 경로)
      const response = await fetch('./js/data/celebrity_db.json');
      if (response.ok) {
        this.celebrityDb = await response.json();
        console.log(`[DatabaseManager] Loaded ${this.celebrityDb.length} celebrities`);
      }
    } catch (error) {
      console.warn('[DatabaseManager] Could not load celebrity data:', error);
      this.celebrityDb = [];
    }

    // 사용자가 추가한 유명인 데이터 로드 및 병합
    try {
      const customCeleb = localStorage.getItem('celebrity_db_custom');
      console.log(`[DatabaseManager] localStorage celebrity_db_custom: ${customCeleb ? customCeleb.length + ' chars' : 'empty'}`);
      if (customCeleb) {
        const parsed = JSON.parse(customCeleb);
        if (Array.isArray(parsed)) {
          let addedCount = 0;
          parsed.filter(p => this._validatePerson(p)).forEach(p => {
            const exists = this.celebrityDb.some(c =>
              c.name === p.name && c.year === p.year && c.month === p.month && c.day === p.day
            );
            if (!exists) { this.celebrityDb.push(p); addedCount++; }
          });
          console.log(`[DatabaseManager] Custom celebrities: ${parsed.length} in storage, ${addedCount} newly merged`);
        }
      }
    } catch (e) { console.error('[DatabaseManager] Failed to load custom celebrities:', e); }

    // Firestore에서 커스텀 유명인 추가 로드
    await this._loadCelebritiesFromFirestore();

    // 개인 DB는 로컬 스토리지에서 로드
    try {
      const stored = localStorage.getItem('personal_db');
      this.personalDb = stored ? JSON.parse(stored) : [];
    } catch {
      this.personalDb = [];
    }

    this.initialized = true;
    return this;
  }
}

// 싱글톤 인스턴스 export
export const appState = new AppState();
export const dbManager = new DatabaseManager();

// 클래스도 export (필요한 경우)
export { AppState, DatabaseManager, EventBus };

export default {
  appState,
  dbManager,
  AppState,
  DatabaseManager,
  EventBus
};
