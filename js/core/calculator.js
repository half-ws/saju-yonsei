/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 - 사주 계산 엔진 (Core Calculator)
 * ═══════════════════════════════════════════════════════════════════════════
 * 모든 사주 관련 계산 로직을 통합 관리
 */

import {
  CHEONGAN, JIJI, CHEONGAN_HANJA, JIJI_HANJA,
  CHEONGAN_OHENG, JIJI_OHENG, CHEONGAN_EUMYANG, JIJI_EUMYANG,
  OHENG_RELATIONS, TWELVE_STAGES, JANGSEONG_POSITION,
  YUKSHIP_GAPJA, GAPJA_INDEX_MAP,
  REF_DATE, REF_DAY_IDX, REF_YEAR, REF_YEAR_IDX,
  THRESHOLDS, TERM_MONTH, JIJANGGAN,
  TIME_BOUNDARIES, TEN_GODS_GROUPED,
  STEM_W, BR_W, BR_EL, BONGI_EUMYANG,
  STEM_COMBINE, STEM_CLASH, BRANCH_COMBINE, BRANCH_CLASH,
  BANHAP_TABLE, WANGJI
} from './constants.js';

import { Result, createError, ErrorCodes, safeExecute } from '../utils/error-handler.js';

/**
 * 천문 계산 유틸리티
 */
const AstronomyUtils = {
  /**
   * 율리우스일 계산
   */
  julianDay(y, m, d, h = 0, mi = 0) {
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + 
           Math.floor(30.6001 * (m + 1)) + 
           d + (h + mi / 60) / 24 + B - 1524.5;
  },

  /**
   * 태양 황경 계산
   */
  sunLongitude(jd) {
    const T = (jd - 2451545) / 36525;
    let L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    if (L0 < 0) L0 += 360;
    
    const M = (357.52911 + T * (35999.05029 - T * 0.0001537)) % 360;
    const Mr = M * Math.PI / 180;
    
    const C = (1.914602 - T * (0.004817 + T * 0.000014)) * Math.sin(Mr) +
              (0.019993 - T * 0.000101) * Math.sin(2 * Mr) +
              0.000289 * Math.sin(3 * Mr);
    
    const om = 125.04 - 1934.136 * T;
    return ((L0 + C - 0.00569 - 0.00478 * Math.sin(om * Math.PI / 180)) % 360 + 360) % 360;
  },

  /**
   * 율리우스일 → KST 변환
   */
  jdToKST(jd) {
    let j = jd + 9 / 24 + 0.5;
    let Z = Math.floor(j);
    let F = j - Z;
    let A;
    
    if (Z < 2299161) {
      A = Z;
    } else {
      const al = Math.floor((Z - 1867216.25) / 36524.25);
      A = Z + 1 + al - Math.floor(al / 4);
    }
    
    const B = A + 1524;
    const C = Math.floor((B - 122.1) / 365.25);
    const D = Math.floor(365.25 * C);
    const E = Math.floor((B - D) / 30.6001);
    
    const dd = B - D - Math.floor(30.6001 * E) + F;
    const mo = E < 14 ? E - 1 : E - 13;
    const yr = mo > 2 ? C - 4716 : C - 4715;
    
    const di = Math.floor(dd);
    const fr = (dd - di) * 24;
    const hh = Math.floor(fr);
    const fr2 = (fr - hh) * 60;
    const mm = Math.floor(fr2);
    
    return new Date(yr, mo - 1, di, Math.min(hh, 23), Math.min(mm, 59));
  }
};

/**
 * 절기 계산기 (캐싱 적용)
 */
const TermCache = new Map();

function findSolarTerm(year, termName, targetLongitude) {
  const cacheKey = `${year}-${termName}`;
  if (TermCache.has(cacheKey)) {
    return TermCache.get(cacheKey);
  }

  const sm = TERM_MONTH[termName];
  let startDate;
  
  if (sm === 1) {
    startDate = new Date(year - 1, 11, 17);
  } else {
    startDate = new Date(year, sm - 1, 1 - 15);
  }

  let j0 = AstronomyUtils.julianDay(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    startDate.getDate()
  );
  
  let prevOffset = null;

  for (let i = 0; i < 50; i++) {
    const j = j0 + i;
    const offset = ((AstronomyUtils.sunLongitude(j) - targetLongitude) % 360 + 360) % 360;
    
    if (prevOffset !== null && prevOffset > 300 && offset < 60) {
      // 이진 검색으로 정밀 탐색
      let a = j - 1, b = j;
      for (let k = 0; k < 52; k++) {
        const m = (a + b) / 2;
        if (((AstronomyUtils.sunLongitude(m) - targetLongitude) % 360 + 360) % 360 > 180) {
          a = m;
        } else {
          b = m;
        }
      }
      
      const result = AstronomyUtils.jdToKST((a + b) / 2);
      TermCache.set(cacheKey, result);
      return result;
    }
    prevOffset = offset;
  }

  throw createError(ErrorCodes.TERM_NOT_FOUND, { termName, year });
}

/**
 * 사주 계산기 클래스
 */
export class SajuCalculator {
  /**
   * 시간으로부터 지지 인덱스 계산
   */
  static getHourBranch(hour, minute) {
    const totalMinutes = hour * 60 + minute;
    
    // 자시 특별 처리 (23:30 이후)
    if (totalMinutes >= 1410 || totalMinutes < 90) return 0;
    
    for (const boundary of TIME_BOUNDARIES) {
      if (totalMinutes >= boundary.start && totalMinutes < boundary.end) {
        return boundary.branch;
      }
    }
    return 0;
  }

  /**
   * 십성 계산 (최적화: 단일 함수로 통합)
   * @param {number} dayStemIdx - 일간 인덱스
   * @param {number} targetStemIdx - 비교 대상 천간 인덱스
   * @returns {string} 십성
   */
  static getTenGod(dayStemIdx, targetStemIdx) {
    if (dayStemIdx === targetStemIdx) return '비견';
    
    const dayElement = Math.floor(dayStemIdx / 2);
    const targetElement = Math.floor(targetStemIdx / 2);
    const sameParity = (dayStemIdx % 2) === (targetStemIdx % 2);
    
    if (dayElement === targetElement) {
      return sameParity ? '비견' : '겁재';
    }
    
    // 생: 목→화→토→금→수→목
    if (OHENG_RELATIONS.생[dayElement] === targetElement) {
      return sameParity ? '식신' : '상관';
    }
    
    // 극: 목→토, 화→금, 토→수, 금→목, 수→화
    if (OHENG_RELATIONS.극[dayElement] === targetElement) {
      return sameParity ? '편재' : '정재';
    }
    
    // 역생 (나를 생하는)
    if (OHENG_RELATIONS.생[targetElement] === dayElement) {
      return sameParity ? '편인' : '정인';
    }
    
    // 역극 (나를 극하는)
    if (OHENG_RELATIONS.극[targetElement] === dayElement) {
      return sameParity ? '편관' : '정관';
    }
    
    return '?';
  }

  /**
   * 십이운성 계산
   */
  static getTwelveStage(stemIdx, branchIdx) {
    const startPos = JANGSEONG_POSITION[stemIdx];
    let position;
    
    if (stemIdx % 2 === 0) {
      // 양간: 순행
      position = ((branchIdx - startPos) % 12 + 12) % 12;
    } else {
      // 음간: 역행
      position = ((startPos - branchIdx) % 12 + 12) % 12;
    }
    
    return TWELVE_STAGES[position];
  }

  /**
   * 메인 사주 계산 함수
   */
  static calculate(year, month, day, hour, minute) {
    const birthKST = new Date(year, month - 1, day, hour, minute);
    
    // 자시 보정 (23:30 이후면 다음날)
    let sajuDate = new Date(year, month - 1, day);
    if (hour >= 23 && minute >= 30) {
      sajuDate = new Date(sajuDate.getTime() + 86400000);
    }

    // 일주 계산
    const dayDiff = Math.round((sajuDate.getTime() - REF_DATE.getTime()) / 86400000);
    const dayIdx = ((REF_DAY_IDX + dayDiff) % 60 + 60) % 60;

    // 시주 계산
    const hourBranch = this.getHourBranch(hour, minute);
    const dayStem = dayIdx % 10;
    const hourStemStart = ((dayStem % 5) * 2) % 10;
    const hourStem = (hourStemStart + hourBranch) % 10;
    const hourIdx = GAPJA_INDEX_MAP[`${hourStem},${hourBranch}`];

    // 년주 계산
    const ipchunThis = findSolarTerm(year, '입춘', 315);
    const sajuYear = birthKST < ipchunThis ? year - 1 : year;
    const yearIdx = ((REF_YEAR_IDX + (sajuYear - REF_YEAR)) % 60 + 60) % 60;

    // 월주 계산
    const termDefs = [
      ['입춘', 315, sajuYear, 1], ['경칩', 345, sajuYear, 2],
      ['청명', 15, sajuYear, 3], ['입하', 45, sajuYear, 4],
      ['망종', 75, sajuYear, 5], ['소서', 105, sajuYear, 6],
      ['입추', 135, sajuYear, 7], ['백로', 165, sajuYear, 8],
      ['한로', 195, sajuYear, 9], ['입동', 225, sajuYear, 10],
      ['대설', 255, sajuYear, 11], ['소한', 285, sajuYear + 1, 12]
    ];

    const boundaries = termDefs.map(([name, lon, sy, mn]) => ({
      dt: findSolarTerm(sy, name, lon),
      monthNum: mn,
      name
    }));
    boundaries.push({
      dt: findSolarTerm(sajuYear + 1, '입춘', 315),
      monthNum: null,
      name: '입춘'
    });

    let monthNum = 1;
    let curTerm = '입춘', curTermDt = boundaries[0].dt;
    let nextTerm = '경칩', nextTermDt = boundaries[1].dt;

    for (let i = 0; i < boundaries.length - 1; i++) {
      if (birthKST >= boundaries[i].dt && birthKST < boundaries[i + 1].dt) {
        monthNum = boundaries[i].monthNum;
        curTerm = boundaries[i].name;
        curTermDt = boundaries[i].dt;
        nextTerm = boundaries[i + 1].name;
        nextTermDt = boundaries[i + 1].dt;
        break;
      }
    }

    const yearStem = yearIdx % 10;
    const monthStemStart = ((yearStem % 5) * 2 + 2) % 10;
    const monthStem = (monthStemStart + (monthNum - 1)) % 10;
    const monthBranch = (monthNum + 1) % 12;
    const monthIdx = GAPJA_INDEX_MAP[`${monthStem},${monthBranch}`];

    // 결과 조합
    const positions = ['hour', 'day', 'month', 'year'];
    const idxs = { hour: hourIdx, day: dayIdx, month: monthIdx, year: yearIdx };
    const dsi = dayIdx % 10;

    const result = {
      pillars: {
        hour: YUKSHIP_GAPJA[hourIdx],
        day: YUKSHIP_GAPJA[dayIdx],
        month: YUKSHIP_GAPJA[monthIdx],
        year: YUKSHIP_GAPJA[yearIdx]
      },
      idxs,
      tgStem: {},
      tgBranch: {},
      ts: {},
      tsSelf: {},
      hiddenStems: {},
      sajuYear,
      monthNum,
      curTerm,
      curTermDt,
      nextTerm,
      nextTermDt,
      birthKST,
      input: { year, month, day, hour, minute }
    };

    // 각 기둥별 십성/십이운성/지장간 계산
    for (const p of positions) {
      const si = idxs[p] % 10;
      const bi = idxs[p] % 12;
      
      result.tgStem[p] = p === 'day' ? '일간' : this.getTenGod(dsi, si);

      const branchChar = JIJI[bi];
      // 본기(本氣)를 찾아서 지지의 십성 계산
      const hiddenMain = JIJANGGAN[branchChar].find(h => h.t === '본기') || JIJANGGAN[branchChar][0];
      result.tgBranch[p] = this.getTenGod(dsi, CHEONGAN.indexOf(hiddenMain.s));
      
      result.ts[p] = this.getTwelveStage(dsi, bi);
      result.tsSelf[p] = this.getTwelveStage(si, bi);
      
      result.hiddenStems[p] = JIJANGGAN[branchChar].map(h => ({
        stem: h.s,
        type: h.t,
        tenGod: this.getTenGod(dsi, CHEONGAN.indexOf(h.s)),
        element: CHEONGAN_OHENG[CHEONGAN.indexOf(h.s)]
      }));
    }

    return result;
  }
}

/**
 * 오행 분석기 - 원본 calcWeightedOheng 완벽 구현
 * 합충에 따른 변환과 저항계수를 적용한 복잡한 가중치 계산
 */
export class OhengAnalyzer {
  /**
   * 오행에서 천간 인덱스로 변환 (음양 고려)
   */
  static el2si(el, yy) {
    const b = { 목: 0, 화: 2, 토: 4, 금: 6, 수: 8 };
    return b[el] + (yy === '음' ? 1 : 0);
  }

  /**
   * 천간 쌍 관계 체크 (합/충)
   */
  static checkStemPair(s1, s2) {
    const results = [];
    // 합 체크
    for (const [a, b, e] of STEM_COMBINE) {
      if ((s1 === a && s2 === b) || (s1 === b && s2 === a)) {
        results.push({ type: '합', desc: `합(${e})` });
      }
    }
    // 충 체크
    for (const [a, b] of STEM_CLASH) {
      if ((s1 === a && s2 === b) || (s1 === b && s2 === a)) {
        results.push({ type: '충', desc: '충' });
      }
    }
    return results;
  }

  /**
   * 지지 쌍 관계 체크 (합/충)
   */
  static checkBranchPair(b1, b2) {
    const results = [];
    // 육합 체크
    for (const [a, b, e] of BRANCH_COMBINE) {
      if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
        results.push({ type: '합', desc: `합(${e})` });
      }
    }
    // 충 체크
    for (const [a, b] of BRANCH_CLASH) {
      if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
        results.push({ type: '충', desc: '충' });
      }
    }
    return results;
  }

  /**
   * 저항 계수 계산
   * - 일주(day)는 시주/월주와 합충 시 0.5배 저항
   * - 월주(month)는 년주/일주와 합충 시 0.5배 저항
   */
  static resFactor(p1, p2, target) {
    if (p1 === 'hour' && p2 === 'day' && target === 'day') return 0.5;
    if (p1 === 'day' && p2 === 'month') return 0.5;
    if (p1 === 'month' && p2 === 'year' && target === 'month') return 0.5;
    return 1;
  }

  /**
   * 가중치 적용 오행 분포 계산 (원본 calcWeightedOheng 완벽 구현)
   */
  static calculateWeightedOheng(result, hasTime) {
    const poss = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const dsi = result.idxs.day % 10;

    // 천간/지지 데이터 구조화
    const sd = {}, bd = {};
    for (const p of poss) {
      sd[p] = {
        si: result.idxs[p] % 10,
        el: CHEONGAN_OHENG[result.idxs[p] % 10],
        w: STEM_W[p],
        of: 1,  // offset factor (저항으로 감소)
        tr: []  // transforms (합화 변환)
      };
      const bi = result.idxs[p] % 12;
      bd[p] = {
        bi,
        dist: BR_EL[bi],
        w: BR_W[p],
        of: 1,
        tr: [],
        yy: BONGI_EUMYANG[bi]
      };
    }

    // 인접 기둥 쌍
    const adj = [];
    for (let i = 0; i < poss.length - 1; i++) {
      adj.push([poss[i], poss[i + 1]]);
    }

    // ═══ 천간 합충 처리 ═══
    // 기본 1/3 반영, 원래 2/3 유지 (저항 시 절반)
    for (const [p1, p2] of adj) {
      for (const rel of this.checkStemPair(sd[p1].si, sd[p2].si)) {
        if (rel.type === '합') {
          const m = rel.desc.match(/합\((.)\)/);
          if (m) {
            const rf1 = this.resFactor(p1, p2, p1);
            const rf2 = this.resFactor(p1, p2, p2);
            sd[p1].tr.push({ e: m[1], f: 1/3 * rf1 });
            sd[p1].of *= (1 - 1/3 * rf1);
            sd[p2].tr.push({ e: m[1], f: 1/3 * rf2 });
            sd[p2].of *= (1 - 1/3 * rf2);
          }
        } else if (rel.type === '충') {
          const rf1 = this.resFactor(p1, p2, p1);
          const rf2 = this.resFactor(p1, p2, p2);
          sd[p1].of *= (1 - 1/3 * rf1);
          sd[p2].of *= (1 - 1/3 * rf2);
        }
      }
    }

    // ═══ 지지 합충 처리 ═══
    // 기본 2/3 반영, 원래 1/3 유지 (저항 시 절반)
    for (const [p1, p2] of adj) {
      for (const rel of this.checkBranchPair(bd[p1].bi, bd[p2].bi)) {
        if (rel.type === '합') {
          const m = rel.desc.match(/합\((.)\)/);
          if (m) {
            const rf1 = this.resFactor(p1, p2, p1);
            const rf2 = this.resFactor(p1, p2, p2);
            bd[p1].tr.push({ e: m[1], f: 2/3 * rf1 });
            bd[p1].of *= (1 - 2/3 * rf1);
            bd[p2].tr.push({ e: m[1], f: 2/3 * rf2 });
            bd[p2].of *= (1 - 2/3 * rf2);
          }
        } else if (rel.type === '충') {
          const rf1 = this.resFactor(p1, p2, p1);
          const rf2 = this.resFactor(p1, p2, p2);
          bd[p1].of *= (1 - 2/3 * rf1);
          bd[p2].of *= (1 - 2/3 * rf2);
        }
      }
    }

    // ═══ 지지 반합 처리 ═══
    // 왕지 위치 기반 변화량 결정
    for (const [p1, p2] of adj) {
      const bi1 = bd[p1].bi, bi2 = bd[p2].bi;
      let el = null;
      for (const [a, b, e] of BANHAP_TABLE) {
        if ((bi1 === a && bi2 === b) || (bi1 === b && bi2 === a)) {
          el = e;
          break;
        }
      }
      if (!el) continue;

      const isPair = (p1 === 'month' && p2 === 'year') || (p1 === 'day' && p2 === 'hour');
      let f1, f2;

      if (isPair) {
        const w1 = WANGJI.has(bi1), w2 = WANGJI.has(bi2);
        if (w1 && !w2) { f1 = 1/6; f2 = 2/3; }
        else if (!w1 && w2) { f1 = 1/3; f2 = 1/6; }
        else { f1 = 1/3; f2 = 1/3; }
      } else {
        f1 = 2/3 * this.resFactor(p1, p2, p1);
        f2 = 2/3 * this.resFactor(p1, p2, p2);
      }

      bd[p1].tr.push({ e: el, f: f1 });
      bd[p1].of *= (1 - f1);
      bd[p2].tr.push({ e: el, f: f2 });
      bd[p2].of *= (1 - f2);
    }

    // ═══ 가중 오행 계산 ═══
    const oh = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };

    // 천간 오행
    for (const p of poss) {
      const s = sd[p];
      oh[s.el] += s.w * s.of;
      for (const t of s.tr) {
        oh[t.e] += s.w * t.f;
      }
    }

    // 지지 오행
    for (const p of poss) {
      const b = bd[p];
      for (const { e, r } of b.dist) {
        oh[e] += b.w * r * b.of;
      }
      for (const t of b.tr) {
        oh[t.e] += b.w * t.f;
      }
    }

    // ═══ 가중 십성 계산 ═══
    const cnt = { 비견: 0, 겁재: 0, 식신: 0, 상관: 0, 편재: 0, 정재: 0, 편관: 0, 정관: 0, 편인: 0, 정인: 0 };

    const addSipsung = (si, w) => {
      if (w <= 0) return;
      const tg = SajuCalculator.getTenGod(dsi, si);
      if (cnt.hasOwnProperty(tg)) cnt[tg] += w;
    };

    // 천간 십성
    for (const p of poss) {
      const s = sd[p];
      addSipsung(s.si, s.w * s.of);
      for (const t of s.tr) {
        addSipsung(this.el2si(t.e, CHEONGAN_EUMYANG[s.si]), s.w * t.f);
      }
    }

    // 지지 십성
    for (const p of poss) {
      const b = bd[p];
      for (const { e, r } of b.dist) {
        addSipsung(this.el2si(e, b.yy), b.w * r * b.of);
      }
      for (const t of b.tr) {
        addSipsung(this.el2si(t.e, b.yy), b.w * t.f);
      }
    }

    // 비율 계산
    const total = Object.values(oh).reduce((a, b) => a + b, 0) || 1;
    const percent = {};
    for (const e of Object.keys(oh)) {
      percent[e] = Math.round(oh[e] / total * 100);
    }

    return {
      raw: oh,
      oh,         // 원본 호환
      percent,
      cnt,        // 십성 카운트 (원본 호환)
      tenGodCount: cnt,
      total
    };
  }
}

/**
 * 용신 분석기 (간소화 버전)
 * - 억부용신: 부족 오행(13% 이하)이나 매우 발달한 오행(40% 이상)을 극하는 오행
 * - 통관용신: 두 개의 발달한 오행이 상극 관계일 때 중재하는 오행
 */
export class YongsinAnalyzer {
  /**
   * 용신 계산 (전문 만세력과 동일한 가중치 오행 사용)
   */
  static calculate(result, hasTime) {
    // 오행 분포 계산 - OhengAnalyzer의 가중치 계산 사용
    const weighted = OhengAnalyzer.calculateWeightedOheng(result, hasTime);
    const ohengPercent = weighted.percent;

    // 억부용신 계산
    const 억부 = this._calculateUkbu(ohengPercent);

    // 통관용신 계산
    const 통관 = this._calculateTongkwan(ohengPercent);

    return {
      용신: 억부.용신,
      용신설명: 억부.설명,
      통관: 통관.통관,
      통관설명: 통관.설명,
      oheng: ohengPercent
    };
  }

  /**
   * 억부용신 계산
   * - 부족 오행(13% 이하) 또는 매우 발달한 오행(40% 이상)을 극하는 오행
   */
  static _calculateUkbu(ohengPercent) {
    const ohengNames = ['목', '화', '토', '금', '수'];
    // 상극 관계: 목→토, 화→금, 토→수, 금→목, 수→화
    const 극대상 = { 목: '토', 화: '금', 토: '수', 금: '목', 수: '화' };
    const 극하는 = { 토: '목', 금: '화', 수: '토', 목: '금', 화: '수' };

    // 부족 오행 (13% 이하) 찾기
    const bujok = ohengNames.filter(e => ohengPercent[e] <= 13);
    // 매우 발달 오행 (40% 이상) 찾기
    const balda = ohengNames.filter(e => ohengPercent[e] >= 40);

    let 용신 = null;
    let 설명 = '';

    // 매우 발달한 오행이 있으면 그것을 극하는 오행이 용신
    if (balda.length > 0) {
      const target = balda[0];
      용신 = 극하는[target];
      설명 = `${target}(${ohengPercent[target]}%) 과다 → ${용신}으로 억제`;
    }
    // 부족 오행이 있으면 그것을 생하는 오행이나 극하는 오행이 용신
    else if (bujok.length > 0) {
      const target = bujok[0];
      용신 = 극하는[극대상[target]]; // 부족 오행을 극하는 오행을 극함 = 부족 오행을 생하는 것과 유사
      설명 = `${target}(${ohengPercent[target]}%) 부족 → ${용신}으로 보충`;
    }
    // 특별한 경우 없으면 가장 약한 오행 기준
    else {
      const sorted = Object.entries(ohengPercent).sort((a, b) => a[1] - b[1]);
      const weakest = sorted[0][0];
      용신 = 극하는[극대상[weakest]];
      설명 = `오행 균형 → ${용신} 활용`;
    }

    return { 용신, 설명 };
  }

  /**
   * 통관용신 계산
   * - 두 개의 발달한 오행(20% 이상)이 상극 관계일 때 중재하는 오행
   */
  static _calculateTongkwan(ohengPercent) {
    const sorted = Object.entries(ohengPercent).sort((a, b) => b[1] - a[1]);
    const ohengNames = ['목', '화', '토', '금', '수'];

    // 상위 2개 오행이 모두 20% 이상인지 확인
    if (sorted[0][1] >= 20 && sorted[1][1] >= 20) {
      const e1 = ohengNames.indexOf(sorted[0][0]);
      const e2 = ohengNames.indexOf(sorted[1][0]);

      // e1 → e2 극 관계인지 확인 (목→토, 화→금, 토→수, 금→목, 수→화)
      if (OHENG_RELATIONS.극[e1] === e2) {
        const 통관 = ohengNames[OHENG_RELATIONS.생[e1]];
        return {
          통관,
          설명: `${sorted[0][0]}(${sorted[0][1]}%)→${통관}→${sorted[1][0]}(${sorted[1][1]}%)`
        };
      }
      // e2 → e1 극 관계인지 확인
      if (OHENG_RELATIONS.극[e2] === e1) {
        const 통관 = ohengNames[OHENG_RELATIONS.생[e2]];
        return {
          통관,
          설명: `${sorted[1][0]}(${sorted[1][1]}%)→${통관}→${sorted[0][0]}(${sorted[0][1]}%)`
        };
      }
    }

    return { 통관: null, 설명: '상극 오행 없음' };
  }
}

/**
 * 대운 계산기
 */
export class DaeunCalculator {
  static calculate(result, gender) {
    const yearStemIdx = result.idxs.year % 10;
    const isYang = yearStemIdx % 2 === 0;
    const isMale = gender === 'm';
    const forward = (isYang && isMale) || (!isYang && !isMale);

    const birth = result.birthKST.getTime();
    const daysToBound = Math.max(0, forward
      ? (result.nextTermDt.getTime() - birth) / 864e5
      : (birth - result.curTermDt.getTime()) / 864e5
    );

    // 3일 = 1년, 1일 = 4개월
    const daeunYears = Math.floor(daysToBound / 3);
    const remainDays = daysToBound - daeunYears * 3;
    const daeunMonths = Math.round(remainDays / 3 * 12);

    const { year: bY, month: bM } = result.input;
    let startMonth = bM + daeunMonths;
    let startYear = bY + daeunYears;
    
    while (startMonth > 12) { startMonth -= 12; startYear++; }
    while (startMonth < 1) { startMonth += 12; startYear--; }
    
    const startKoreanAge = startYear - bY + 1;
    const monthIdx60 = result.idxs.month;
    const dayStemIdx = result.idxs.day % 10;

    const list = [];
    for (let i = 1; i <= 12; i++) {
      const idx = forward
        ? ((monthIdx60 + i) % 60 + 60) % 60
        : ((monthIdx60 - i) % 60 + 60) % 60;

      const calYear = startYear + (i - 1) * 10;
      const koreanAge = startKoreanAge + (i - 1) * 10;
      const branchChar = JIJI[idx % 12];
      const hiddenMain = JIJANGGAN[branchChar].find(h => h.t === '본기') || JIJANGGAN[branchChar][0];

      list.push({
        idx,
        pillar: YUKSHIP_GAPJA[idx],
        age: koreanAge,
        calYear,
        startMonth,
        tgStem: SajuCalculator.getTenGod(dayStemIdx, idx % 10),
        tgBranch: SajuCalculator.getTenGod(dayStemIdx, CHEONGAN.indexOf(hiddenMain.s)),
        ts: SajuCalculator.getTwelveStage(dayStemIdx, idx % 12)
      });
    }

    return {
      list,
      forward,
      startAge: startKoreanAge,
      startYear,
      startMonth
    };
  }
}

/**
 * 세운 계산기
 */
export class SaeunCalculator {
  static calculate(result, startYear, endYear) {
    const dayStemIdx = result.idxs.day % 10;
    const birthYear = result.input.year;
    const currentYear = new Date().getFullYear();
    const list = [];

    for (let y = startYear; y <= endYear; y++) {
      const yearIdx = ((REF_YEAR_IDX + (y - REF_YEAR)) % 60 + 60) % 60;
      const branchChar = JIJI[yearIdx % 12];
      const hiddenMain = JIJANGGAN[branchChar].find(h => h.t === '본기') || JIJANGGAN[branchChar][0];

      list.push({
        year: y,
        idx: yearIdx,
        pillar: YUKSHIP_GAPJA[yearIdx],
        age: y - birthYear + 1,  // 세는 나이
        isCurrent: y === currentYear,
        tgStem: SajuCalculator.getTenGod(dayStemIdx, yearIdx % 10),
        tgBranch: SajuCalculator.getTenGod(dayStemIdx, CHEONGAN.indexOf(hiddenMain.s)),
        ts: SajuCalculator.getTwelveStage(dayStemIdx, yearIdx % 12)
      });
    }

    return list;
  }
}

/**
 * 월운 계산기
 */
export class WolunCalculator {
  static calculate(result, targetYear) {
    const dayStemIdx = result.idxs.day % 10;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const yearIdx = ((REF_YEAR_IDX + (targetYear - REF_YEAR)) % 60 + 60) % 60;
    const yearStem = yearIdx % 10;

    // 절기 정보: [절기명, 황경, 월번호]
    const termDefs = [
      ['입춘', 315, 1], ['경칩', 345, 2], ['청명', 15, 3],
      ['입하', 45, 4], ['망종', 75, 5], ['소서', 105, 6],
      ['입추', 135, 7], ['백로', 165, 8], ['한로', 195, 9],
      ['입동', 225, 10], ['대설', 255, 11], ['소한', 285, 12]
    ];

    const monthStemStart = ((yearStem % 5) * 2 + 2) % 10;
    const list = [];

    for (const [termName, termLongitude, monthNum] of termDefs) {
      const monthStem = (monthStemStart + (monthNum - 1)) % 10;
      const monthBranch = (monthNum + 1) % 12;
      const monthIdx = GAPJA_INDEX_MAP[`${monthStem},${monthBranch}`];

      // 절기 날짜 계산
      const searchYear = monthNum === 12 ? targetYear + 1 : targetYear;
      let termDate = null;
      try {
        termDate = findSolarTerm(searchYear, termName, termLongitude);
      } catch (e) {
        termDate = null;
      }

      const actualMonth = termDate ? termDate.getMonth() + 1 : monthNum;
      const isCurrent = targetYear === currentYear && actualMonth === currentMonth;

      const branchChar = JIJI[monthIdx % 12];
      const hiddenMain = JIJANGGAN[branchChar].find(h => h.t === '본기') || JIJANGGAN[branchChar][0];

      list.push({
        idx: monthIdx,
        pillar: YUKSHIP_GAPJA[monthIdx],
        monthNum,
        termName,
        termDt: termDate,
        isCurrent,
        tgStem: SajuCalculator.getTenGod(dayStemIdx, monthIdx % 10),
        tgBranch: SajuCalculator.getTenGod(dayStemIdx, CHEONGAN.indexOf(hiddenMain.s)),
        ts: SajuCalculator.getTwelveStage(dayStemIdx, monthIdx % 12)
      });
    }

    return list;
  }
}

/**
 * 합충형파해 감지기
 */
export class RelationDetector {
  static detect(result, hasTime) {
    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const posK = { year: '년', month: '월', day: '일', hour: '시' };
    const relations = [];

    const stems = {}, branches = {};
    for (const p of positions) {
      stems[p] = result.idxs[p] % 10;
      branches[p] = result.idxs[p] % 12;
    }

    // 천간합충표
    const 천간합표 = [[0, 5, '토'], [1, 6, '금'], [2, 7, '수'], [3, 8, '목'], [4, 9, '화']];
    const 천간충표 = [[0, 6], [1, 7], [2, 8], [3, 9]];

    // 지지 육합/육충표
    const 육합표 = [[0, 1, '토'], [2, 11, '목'], [3, 10, '화'], [4, 9, '금'], [5, 8, '수'], [6, 7, '화']];
    const 육충표 = [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]];

    // 형/파/해표
    const 형표 = [[2, 5, '무은지형'], [5, 8, '무은지형'], [2, 8, '무은지형'],
                  [1, 10, '은혜지형'], [10, 7, '은혜지형'], [1, 7, '은혜지형'],
                  [0, 3, '무례지형']];
    const 파표 = [[0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [10, 7]];
    const 해표 = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]];
    const 자형지 = new Set([4, 6, 9, 11]);

    // 인접 쌍
    const adjPairs = [];
    for (let i = 0; i < positions.length - 1; i++) {
      adjPairs.push([positions[i], positions[i + 1]]);
    }

    for (const [p1, p2] of adjPairs) {
      const s1 = stems[p1], s2 = stems[p2];
      const b1 = branches[p1], b2 = branches[p2];
      const lb = posK[p1] + posK[p2];

      // 천간 합충
      for (const [a, b, el] of 천간합표) {
        if ((s1 === a && s2 === b) || (s1 === b && s2 === a)) {
          relations.push({
            cat: '합', row: 'stem', p1, p2,
            desc: `${CHEONGAN[s1]}${CHEONGAN_HANJA[s1]}${CHEONGAN[s2]}${CHEONGAN_HANJA[s2]}합(${el})`, lb
          });
        }
      }
      for (const [a, b] of 천간충표) {
        if ((s1 === a && s2 === b) || (s1 === b && s2 === a)) {
          relations.push({
            cat: '충', row: 'stem', p1, p2,
            desc: `${CHEONGAN[s1]}${CHEONGAN_HANJA[s1]}${CHEONGAN[s2]}${CHEONGAN_HANJA[s2]}충`, lb
          });
        }
      }

      // 지지 육합/육충
      for (const [a, b, el] of 육합표) {
        if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
          relations.push({
            cat: '합', row: 'branch', p1, p2,
            desc: `${JIJI[b1]}${JIJI_HANJA[b1]}${JIJI[b2]}${JIJI_HANJA[b2]}합(${el})`, lb
          });
        }
      }
      for (const [a, b] of 육충표) {
        if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
          relations.push({
            cat: '충', row: 'branch', p1, p2,
            desc: `${JIJI[b1]}${JIJI_HANJA[b1]}${JIJI[b2]}${JIJI_HANJA[b2]}충`, lb
          });
        }
      }

      // 형/파/해
      for (const [a, b, kind] of 형표) {
        if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
          relations.push({
            cat: '형', row: 'branch', p1, p2,
            desc: `${JIJI[b1]}${JIJI_HANJA[b1]}${JIJI[b2]}${JIJI_HANJA[b2]}형(${kind})`, lb
          });
        }
      }
      for (const [a, b] of 파표) {
        if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
          relations.push({
            cat: '파', row: 'branch', p1, p2,
            desc: `${JIJI[b1]}${JIJI_HANJA[b1]}${JIJI[b2]}${JIJI_HANJA[b2]}파`, lb
          });
        }
      }
      for (const [a, b] of 해표) {
        if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
          relations.push({
            cat: '해', row: 'branch', p1, p2,
            desc: `${JIJI[b1]}${JIJI_HANJA[b1]}${JIJI[b2]}${JIJI_HANJA[b2]}해`, lb
          });
        }
      }

      // 자형 (같은 지지)
      if (b1 === b2 && 자형지.has(b1)) {
        relations.push({
          cat: '형', row: 'branch', p1, p2,
          desc: `${JIJI[b1]}${JIJI_HANJA[b1]}${JIJI[b2]}${JIJI_HANJA[b2]}자형`, lb
        });
      }
    }

    // 삼합/방합/삼형 (3개 조합)
    if (positions.length >= 3) {
      const triGroups = [];
      for (let i = 0; i <= positions.length - 3; i++) {
        triGroups.push([positions[i], positions[i + 1], positions[i + 2]]);
      }

      const 삼합표 = [[2, 6, 10, '화'], [5, 9, 1, '금'], [8, 0, 4, '수'], [11, 3, 7, '목']];
      const 방합표 = [[2, 3, 4, '목'], [5, 6, 7, '화'], [8, 9, 10, '금'], [11, 0, 1, '수']];
      const 삼형표 = [[2, 5, 8, '무은지형'], [1, 10, 7, '은혜지형']];

      for (const tri of triGroups) {
        const tb = tri.map(p => branches[p]);
        const tlb = tri.map(p => posK[p]).join('');

        for (const [a, b, c, el] of 삼합표) {
          if (tb.includes(a) && tb.includes(b) && tb.includes(c)) {
            relations.push({ cat: '합', row: 'branch', p1: tri[0], p2: tri[2], desc: `삼합${el}국`, lb: tlb });
          }
        }
        for (const [a, b, c, el] of 방합표) {
          if (tb.includes(a) && tb.includes(b) && tb.includes(c)) {
            relations.push({ cat: '합', row: 'branch', p1: tri[0], p2: tri[2], desc: `방합${el}국`, lb: tlb });
          }
        }
        for (const [a, b, c, kind] of 삼형표) {
          if (tb.includes(a) && tb.includes(b) && tb.includes(c)) {
            relations.push({ cat: '형', row: 'branch', p1: tri[0], p2: tri[2], desc: `삼형(${kind})`, lb: tlb });
          }
        }
      }
    }

    return relations;
  }
}

export default {
  SajuCalculator,
  OhengAnalyzer,
  YongsinAnalyzer,
  DaeunCalculator,
  SaeunCalculator,
  WolunCalculator,
  RelationDetector
};
