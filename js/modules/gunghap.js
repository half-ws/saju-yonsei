/**
 * 연세사주 - 궁합 계산 모듈
 *
 * 두 사람의 사주를 비교하여 궁합을 분석하는 모듈
 * - 천간 궁합 (합/충)
 * - 지지 궁합 (합/충/형)
 * - 오행 상생상극
 * - 일주 궁합
 * - 종합 궁합 점수 (6단계 Python 알고리즘 기반)
 */

import {
  THRESHOLDS, CHEONGAN, JIJI, CHEONGAN_OHENG, JIJI_OHENG,
  CHEONGAN_HANJA, JIJI_HANJA, CHEONGAN_EUMYANG, JIJI_EUMYANG,
  TEN_GODS, YUKSHIP_GAPJA,
  BR_EL, GAPJA_INDEX_MAP, REF_DATE, REF_DAY_IDX, REF_YEAR, REF_YEAR_IDX
} from '../core/constants.js';
import { RelationAnalyzer } from '../core/relations.js';
import { appState } from '../core/state.js';
import { SajuCalculator, OhengAnalyzer, YongsinAnalyzer } from '../core/calculator.js';
import { escapeHtml, smartInputLimit } from '../utils/dom.js';

// 오행 인덱스 맵
const OHENG_IDX = { 목: 0, 화: 1, 토: 2, 금: 3, 수: 4 };
const OHENG_NAMES = ['목', '화', '토', '금', '수'];
const STEM_OHENG_IDX = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]; // 천간→오행idx

// ═══════════════════════════════════════════════════
// 헬퍼 함수들
// ═══════════════════════════════════════════════════

/**
 * 삼합 반합 체크 (2지지)
 */
function checkSamhapHalf(b1, b2) {
  const tbl = [
    [2, 6, '화'], [6, 10, '화'],   // 인오술 화국
    [5, 9, '금'], [9, 1, '금'],    // 사유축 금국
    [8, 0, '수'], [0, 4, '수'],    // 신자진 수국
    [11, 3, '목'], [3, 7, '목']    // 해묘미 목국
  ];
  for (const [a, b, el] of tbl) {
    if ((b1 === a && b2 === b) || (b1 === b && b2 === a)) {
      return { ok: true, el, desc: `${JIJI[b1]}${JIJI_HANJA[b1]}${JIJI[b2]}${JIJI_HANJA[b2]}반합(${el})` };
    }
  }
  return { ok: false };
}

/**
 * 완전 삼합 체크 (3지지 이상)
 */
function checkSamhapFull(branches) {
  const s = new Set(branches);
  const tbl = [
    [2, 6, 10, '화'],  // 인오술
    [5, 9, 1, '금'],   // 사유축
    [8, 0, 4, '수'],   // 신자진
    [11, 3, 7, '목']   // 해묘미
  ];
  for (const [a, b, c, el] of tbl) {
    if (s.has(a) && s.has(b) && s.has(c)) {
      return { ok: true, el };
    }
  }
  return { ok: false };
}

/**
 * 완전 방합 체크 (3지지)
 */
function checkBanghapFull(branches) {
  const s = new Set(branches);
  const tbl = [
    [2, 3, 4, '목'],   // 인묘진 - 동방합
    [5, 6, 7, '화'],   // 사오미 - 남방합
    [8, 9, 10, '금'],  // 신유술 - 서방합
    [11, 0, 1, '수']   // 해자축 - 북방합
  ];
  for (const [a, b, c, el] of tbl) {
    if (s.has(a) && s.has(b) && s.has(c)) {
      return { ok: true, el };
    }
  }
  return { ok: false };
}

/**
 * 삼형 체크 (3자)
 */
function checkSamhyung(branches) {
  const s = new Set(branches);
  if (s.has(2) && s.has(5) && s.has(8)) return { ok: true, name: '무은지형(인사신)' };
  if (s.has(1) && s.has(10) && s.has(7)) return { ok: true, name: '은혜지형(축술미)' };
  if (s.has(0) && s.has(3)) return { ok: true, name: '무례지형(자묘)' };
  return { ok: false };
}

/**
 * 십신 계산 (원본 tenGod 함수)
 */
function tenGod(dsi, tsi) {
  return SajuCalculator.getTenGod(dsi, tsi);
}

/**
 * 12운성 계산
 */
function twelveStage(stemIdx, branchIdx) {
  return SajuCalculator.getTwelveStage(stemIdx, branchIdx);
}

/**
 * 사주 개인 정보 파생
 */
function derivePersonInfo(r, hasTime, ys) {
  const poss = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
  const stems = poss.map(p => r.idxs[p] % 10);
  const branches = poss.map(p => r.idxs[p] % 12);
  const dsi = r.idxs.day % 10;
  const dayElement = Math.floor(dsi / 2); // 일간 오행 인덱스

  // 오행 퍼센트 - 전문 만세력과 동일한 가중치 계산 사용
  const weighted = OhengAnalyzer.calculateWeightedOheng(r, hasTime);
  const oh = weighted.percent || { 목: 20, 화: 20, 토: 20, 금: 20, 수: 20 };
  const en = ['목', '화', '토', '금', '수'];
  const sorted = en.slice().sort((a, b) => oh[b] - oh[a]);
  const balda = en.filter(e => oh[e] >= 30);
  if (!balda.length) balda.push(sorted[0]);
  const bujokList = en.filter(e => oh[e] <= 13);
  const bujok = bujokList.length ? bujokList[bujokList.length - 1] : sorted[sorted.length - 1];

  // 십성 그룹별 퍼센트 계산 (오행 기반)
  // 비겁: 일간 오행, 식상: 생하는 오행, 재성: 극하는 오행, 관성: 극받는 오행, 인성: 생받는 오행
  const 생 = [1, 2, 3, 4, 0]; // 목→화, 화→토, 토→금, 금→수, 수→목
  const 극 = [2, 3, 4, 0, 1]; // 목→토, 화→금, 토→수, 금→목, 수→화
  const 역생 = [4, 0, 1, 2, 3]; // 수→목, 목→화...
  const 역극 = [3, 4, 0, 1, 2]; // 금→목, 수→화...

  const tsGroup = {
    비겁: oh[en[dayElement]] || 0,
    식상: oh[en[생[dayElement]]] || 0,
    재성: oh[en[극[dayElement]]] || 0,
    관성: oh[en[역극[dayElement]]] || 0,
    인성: oh[en[역생[dayElement]]] || 0
  };

  // 발달 십성 그룹 (가장 높은 그룹)
  const tsSorted = Object.entries(tsGroup).sort((a, b) => b[1] - a[1]);
  const baldaSS = tsSorted[0][0];

  // 애착 유형 계산
  const attachmentResult = calculateAttachmentType(tsGroup, bujokList, en, dayElement, 생, 극, 역생, 역극);

  // 원국 내 육합
  const wonkukYukap = [];
  const 육합tbl = [[0, 1, '토'], [2, 11, '목'], [3, 10, '화'], [4, 9, '금'], [5, 8, '수']];
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      for (const [a, b] of 육합tbl) {
        if ((branches[i] === a && branches[j] === b) || (branches[i] === b && branches[j] === a)) {
          wonkukYukap.push([branches[i], branches[j]]);
        }
      }
    }
  }

  // 원국 내 삼합
  const wonkukSamhap = [];
  const 삼합tbl = [[2, 6, 10, '화'], [5, 9, 1, '금'], [8, 0, 4, '수'], [11, 3, 7, '목']];
  if (branches.length >= 3) {
    for (let i = 0; i < branches.length - 2; i++) {
      for (let j = i + 1; j < branches.length - 1; j++) {
        for (let k = j + 1; k < branches.length; k++) {
          const tb = [branches[i], branches[j], branches[k]];
          const ts = new Set(tb);
          for (const [a, b, c] of 삼합tbl) {
            if (ts.has(a) && ts.has(b) && ts.has(c)) wonkukSamhap.push(tb);
          }
        }
      }
    }
  }

  // 12운성
  const woljiUS = twelveStage(dsi, r.idxs.month % 12);
  const iljiUS = twelveStage(dsi, r.idxs.day % 12);

  return {
    poss, stems, branches, balda, bujok, bujokList, baldaSS, tsGroup,
    attachmentType: attachmentResult.type,
    attachmentSubType: attachmentResult.subType,
    wonkukYukap, wonkukSamhap, woljiUS, iljiUS,
    용신: ys.용신,
    yongsin: [ys.용신]
  };
}

/**
 * 애착 유형 계산
 * - 회피형: 재성/관성 중 하나가 20% 넘고, 인성/식상 둘 다 부족
 * - 불안형: 인성/식상 중 하나가 20% 넘고, 재성/관성 둘 다 부족
 * - 안정형: 부족 오행 없음 (오행 구족)
 * - 해당 사항 없음: 위 3개 외
 */
function calculateAttachmentType(tsGroup, bujokList, en, dayElement, 생, 극, 역생, 역극) {
  const 재성 = tsGroup.재성;
  const 관성 = tsGroup.관성;
  const 인성 = tsGroup.인성;
  const 식상 = tsGroup.식상;

  // 인성/식상에 해당하는 오행이 부족 오행인지 확인
  const 인성오행 = en[역생[dayElement]];
  const 식상오행 = en[생[dayElement]];
  const 재성오행 = en[극[dayElement]];
  const 관성오행 = en[역극[dayElement]];

  const 인성부족 = bujokList.includes(인성오행);
  const 식상부족 = bujokList.includes(식상오행);
  const 재성부족 = bujokList.includes(재성오행);
  const 관성부족 = bujokList.includes(관성오행);

  // 안정형: 부족 오행 없음
  if (bujokList.length === 0) {
    return { type: '안정형', subType: '균형' };
  }

  // 회피형: 재성/관성 중 하나가 20% 넘고, 인성/식상 둘 다 부족
  if ((재성 >= 20 || 관성 >= 20) && 인성부족 && 식상부족) {
    let subType = '보통';
    if (재성 >= 관성 * 2) subType = '기버';
    else if (관성 >= 재성 * 2) subType = '테이커';
    return { type: '회피형', subType };
  }

  // 불안형: 인성/식상 중 하나가 20% 넘고, 재성/관성 둘 다 부족
  if ((인성 >= 20 || 식상 >= 20) && 재성부족 && 관성부족) {
    let subType = '보통';
    if (인성 >= 식상 * 2) subType = '테이커';
    else if (식상 >= 인성 * 2) subType = '기버';
    return { type: '불안형', subType };
  }

  return { type: '해당 사항 없음', subType: '' };
}

/**
 * 궁합 점수 가중치
 */
const GUNGHAP_WEIGHTS = {
  ILGAN: 30,        // 일간 궁합 (가장 중요)
  ILJI: 25,         // 일지 궁합
  WOLJU: 20,        // 월주 궁합
  OHENG_BALANCE: 15, // 오행 보완
  RELATION: 10      // 기타 관계
};

/**
 * 천간 궁합 점수표
 */
const STEM_COMPATIBILITY = {
  // 합 (相合) - 매우 좋음
  COMBINE: 25,
  // 충 (相衝) - 나쁨
  CLASH: -15,
  // 같은 오행 - 보통
  SAME_OHENG: 10,
  // 상생 - 좋음
  GENERATE: 15,
  // 상극 - 안 좋음
  OVERCOME: -10
};

/**
 * 지지 궁합 점수표
 */
const BRANCH_COMPATIBILITY = {
  // 육합 - 매우 좋음
  SIX_COMBINE: 25,
  // 삼합 - 좋음
  TRIPLE_COMBINE: 20,
  // 방합 - 좋음
  DIRECTIONAL: 15,
  // 충 - 나쁨
  CLASH: -20,
  // 형 - 나쁨
  PUNISHMENT: -15,
  // 파 - 약간 나쁨
  BREAK: -10,
  // 해 - 약간 나쁨
  HARM: -10,
  // 같은 지지 - 보통
  SAME: 5
};

/**
 * 오행 상생상극
 */
const OHENG_RELATION = {
  // 상생 (木→火→土→金→水→木)
  GENERATE: { '목': '화', '화': '토', '토': '금', '금': '수', '수': '목' },
  // 상극 (木→土→水→火→金→木)
  OVERCOME: { '목': '토', '토': '수', '수': '화', '화': '금', '금': '목' }
};

/**
 * 궁합 분석기
 */
export class GunghapAnalyzer {
  constructor() {
    this.state = appState;
  }

  async init() {
    // 초기화 (필요한 경우)
  }

  /**
   * 완전한 궁합 분석 (Python 알고리즘 기반 v2)
   * @param {Object} rA - 본인 사주 계산 결과
   * @param {Object} rB - 상대 사주 계산 결과
   * @param {boolean} htA - 본인 시간 유무
   * @param {boolean} htB - 상대 시간 유무
   * @returns {Object} 궁합 분석 결과
   */
  analyzeCompatibilityFull(rA, rB, htA, htB) {
    // 용신 분석
    const ysA = YongsinAnalyzer.calculate(rA, htA);
    const ysB = YongsinAnalyzer.calculate(rB, htB);
    const infoA = derivePersonInfo(rA, htA, ysA);
    const infoB = derivePersonInfo(rB, htB, ysB);

    const notes = [];
    const flags = { sameYongsin: false, wonkukBroken: [], samhyung: null, yongsinSame: false };
    const details = { jiji: 0, chungan: 0, ohang: 0, sipsung: 0, unseong: 0, special: 0 };
    let hasHapAny = false, hasChungAny = false;

    // 합 결과오행 → 용신 가점
    const ohangChange = (resultOh) => {
      let s = 0;
      for (const [tag, info] of [['본인', infoA], ['상대', infoB]]) {
        if (info.yongsin.includes(resultOh)) {
          s += 10;
          notes.push(`  → ${tag} 용신(${resultOh}): +10`);
        }
      }
      return s;
    };

    // ═══ STEP 1: 지지 합충 ═══
    (() => {
      let s = 0;
      const brsA = infoA.branches, brsB = infoB.branches;

      // Phase 1: 완전 삼합/방합 (A월일지+B월일지 = 4개)
      const four = [rA.idxs.month % 12, rA.idxs.day % 12, rB.idxs.month % 12, rB.idxs.day % 12];
      let completeSH = checkSamhapFull(four), completeBH = checkBanghapFull(four), completeFound = false;
      if (completeSH.ok) {
        s += 30;
        notes.push(`[지지] 완전삼합 → ${completeSH.el} → +30`);
        s += ohangChange(completeSH.el);
        completeFound = true;
      } else if (completeBH.ok) {
        s += 30;
        notes.push(`[지지] 완전방합 → ${completeBH.el} → +30`);
        s += ohangChange(completeBH.el);
        completeFound = true;
      }

      // Phase 2: 같은 궁성끼리 비교
      const pairs = [
        ['월지', rA.idxs.month % 12, rB.idxs.month % 12],
        ['일지', rA.idxs.day % 12, rB.idxs.day % 12],
        ['년지', rA.idxs.year % 12, rB.idxs.year % 12]
      ];
      if (htA && htB) pairs.push(['시지', rA.idxs.hour % 12, rB.idxs.hour % 12]);
      const posScores = {};

      for (const [pos, b1, b2] of pairs) {
        const isCore = pos === '월지' || pos === '일지';
        const yukPts = pos === '일지' ? 15 : pos === '월지' ? 10 : 5;
        const halfPts = isCore ? 10 : 3;
        const chungPts = pos === '월지' ? -15 : pos === '일지' ? -10 : -5;
        let ps = 0, found = false;

        // (1) 육합
        for (const rel of RelationAnalyzer.checkBranchPair(b1, b2)) {
          if (rel.type === '합') {
            ps += yukPts;
            notes.push(`[지지] ${pos} 육합: ${rel.desc} → +${yukPts}`);
            if (rel.result) ps += ohangChange(rel.result);
            found = true;
            hasHapAny = true;
            break;
          }
        }

        // (2) 삼합반합 (완전삼합 미발견 시)
        if (!found && !completeFound) {
          const sh = checkSamhapHalf(b1, b2);
          if (sh.ok) {
            ps += halfPts;
            notes.push(`[지지] ${pos} 삼합반합: ${sh.desc} → +${halfPts}`);
            ps += ohangChange(sh.el);
            found = true;
            hasHapAny = true;
          }
        }

        // (3) 충
        if (!found) {
          for (const rel of RelationAnalyzer.checkBranchPair(b1, b2)) {
            if (rel.type === '충') {
              ps += chungPts;
              notes.push(`[지지] ${pos} 충: ${rel.desc} → ${chungPts}`);
              hasChungAny = true;
              break;
            }
          }
        }
        posScores[pos] = ps;
      }
      s += Object.values(posScores).reduce((a, b) => a + b, 0);
      details.jiji = s;
    })();

    // ═══ STEP 2: 천간 합충 (위치별 가중치) ═══
    (() => {
      let s = 0;
      const pairs = [
        ['일간', rA.idxs.day % 10, rB.idxs.day % 10, 1],
        ['월간', rA.idxs.month % 10, rB.idxs.month % 10, 0.6],
        ['년간', rA.idxs.year % 10, rB.idxs.year % 10, 0.3]
      ];
      if (htA && htB) pairs.push(['시간', rA.idxs.hour % 10, rB.idxs.hour % 10, 0.3]);

      for (const [label, s1, s2, wt] of pairs) {
        for (const rel of RelationAnalyzer.checkStemPair(s1, s2)) {
          if (rel.type === '합') {
            const pts = Math.round(7 * wt);
            s += pts;
            notes.push(`[천간] ${label}합: ${rel.desc} → +${pts}`);
          } else if (rel.type === '충') {
            const pts = Math.round(5 * wt);
            s -= pts;
            notes.push(`[천간] ${label}충: ${rel.desc} → -${pts}`);
          }
        }
      }
      details.chungan = s;
    })();

    // ═══ STEP 3: 오행 보완 ═══
    (() => {
      let s = 0;
      let aFillsB = false, bFillsA = false;

      // A발달 → B부족 채움
      if (infoB.bujok && infoA.balda.includes(infoB.bujok)) {
        s += 15;
        aFillsB = true;
        notes.push(`[오행] 본인발달(${infoA.balda}) → 상대부족(${infoB.bujok}) 채움: +15`);
      }

      // B발달 → A부족 채움
      if (infoA.bujok && infoB.balda.includes(infoA.bujok)) {
        s += 15;
        bFillsA = true;
        notes.push(`[오행] 상대발달(${infoB.balda}) → 본인부족(${infoA.bujok}) 채움: +15`);
      }

      // 상호보완 보너스
      if (aFillsB && bFillsA) {
        s += 5;
        notes.push(`[오행] 상호보완 시너지: +5`);
      }

      // 발달오행 겹침 + 합 존재 시 보너스
      const common = infoA.balda.filter(e => infoB.balda.includes(e));
      if (common.length && hasHapAny) {
        s += 10;
        notes.push(`[오행] 발달오행 겹침(${common})+합 존재: +10`);
      }

      // 용신 동일 (플래그만)
      if (ysA.용신 === ysB.용신) {
        flags.yongsinSame = true;
        notes.push(`[오행] 용신 동일(${ysA.용신}) → 세운 확인 권장`);
      }
      details.ohang = s;
    })();

    // ═══ STEP 4: 애착 유형 ═══
    (() => {
      let s = 0;
      const aT = infoA.attachmentType, bT = infoB.attachmentType;
      const aSub = infoA.attachmentSubType, bSub = infoB.attachmentSubType;
      const aSS = infoA.baldaSS, bSS = infoB.baldaSS;

      // (1) 회피형↔불안형: 상호보완적
      if ((aT === '회피형' && bT === '불안형') || (aT === '불안형' && bT === '회피형')) {
        s += 10;
        notes.push(`[애착] ${aT}↔${bT}: 상호보완 → +10`);
        // 기버-테이커 조합 보너스
        if ((aSub === '기버' && bSub === '테이커') || (aSub === '테이커' && bSub === '기버')) {
          s += 5;
          notes.push(`[애착] 기버↔테이커 조합: +5`);
        }
      }

      // (2) 안정형 포함 시 가점
      if (aT === '안정형' || bT === '안정형') {
        s += 8;
        notes.push(`[애착] 안정형 포함: +8`);
        // 둘 다 안정형
        if (aT === '안정형' && bT === '안정형') {
          s += 7;
          notes.push(`[애착] 둘 다 안정형: +7`);
        }
      }

      // (3) 동일 불안정 유형: 감점
      if (aT === bT && (aT === '회피형' || aT === '불안형')) {
        s -= 10;
        notes.push(`[애착] 동일유형(${aT}+${bT}): -10`);
        // 동일 서브타입 추가 감점
        if (aSub === bSub && (aSub === '기버' || aSub === '테이커')) {
          s -= 5;
          notes.push(`[애착] 동일 서브타입(${aSub}): -5`);
        }
      }

      // (4) 십성 특별매칭 (발달 십성 기반)
      const sp = [
        [['식신', '상관'], ['편인', '정인']],
        [['편재', '정재'], ['편관', '정관']]
      ];
      for (const [ga, gb] of sp) {
        if ((ga.includes(aSS) && gb.includes(bSS)) || (gb.includes(aSS) && ga.includes(bSS))) {
          s += 8;
          notes.push(`[십성] 특별매칭: ${aSS}↔${bSS} → +8`);
          break;
        }
      }

      details.sipsung = s;
    })();

    // ═══ STEP 5: 12운성 + 삼형 ═══
    (() => {
      let s = 0;
      const cat = u => {
        if (['장생', '목욕', '관대'].includes(u)) return '생지';
        if (['건록', '제왕'].includes(u)) return '왕지';
        return '묘지';
      };
      const aWC = cat(infoA.woljiUS), aIC = cat(infoA.iljiUS);
      const bWC = cat(infoB.woljiUS), bIC = cat(infoB.iljiUS);

      // A,B 각각 월지·일지 운성이 같은 카테고리일 때만 적용
      if (aWC === aIC && bWC === bIC) {
        const aC = aIC, bC = bIC;
        if (aC === bC) {
          // 같은 카테고리
          if (infoA.iljiUS === infoB.iljiUS) {
            notes.push(`[운성] 동일 운성(${infoA.iljiUS}+${infoB.iljiUS}): 0`);
          } else {
            // 일지끼리 충 관계인지 확인
            const db1 = rA.idxs.day % 12, db2 = rB.idxs.day % 12;
            let isChung = false;
            const 충t = [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]];
            for (const [a, b] of 충t) {
              if ((db1 === a && db2 === b) || (db1 === b && db2 === a)) {
                isChung = true;
                break;
              }
            }
            if (isChung) {
              notes.push(`[운성] 동일카테고리(${aC}) 충 관계 → 기존 충 점수 유지`);
            } else {
              s -= 3;
              notes.push(`[운성] 동일카테고리(${aC}: ${infoA.iljiUS}↔${infoB.iljiUS}): -3`);
            }
          }
        } else if ((aC === '생지' && bC === '묘지') || (aC === '묘지' && bC === '생지')) {
          s += 3;
          notes.push(`[운성] 생지↔묘지 보완: +3`);
        }
      } else {
        notes.push(`[운성] 적용조건 미충족`);
      }

      // 삼형 (A+B 전체 지지)
      const allBrs = [...infoA.branches, ...infoB.branches];
      const sh = checkSamhyung(allBrs);
      if (sh.ok) {
        s -= 3;
        flags.samhyung = sh.name;
        notes.push(`[운성] 삼형(${sh.name}): -3`);
      }
      details.unseong = s;
    })();

    // ═══ STEP 6: 특수 상황 ═══
    (() => {
      let s = 0;
      details.special = s;
    })();

    // ═══ 총점 → 정규화 (0~100) ═══
    const rawTotal = details.jiji + details.chungan + details.ohang + details.sipsung + details.unseong + details.special;
    const normalized = Math.round(Math.max(0, Math.min(100, 50 + rawTotal)));

    // ═══ 합충 집계 (표시용, 같은 궁성끼리만) ═══
    const possA = htA ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const possB = htB ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    let sH = 0, sC = 0, bH = 0, bC = 0, bX = 0;
    for (const p of possA) {
      if (!possB.includes(p)) continue;
      for (const r of RelationAnalyzer.checkStemPair(rA.idxs[p] % 10, rB.idxs[p] % 10)) {
        if (r.type === '합') sH++;
        else sC++;
      }
      for (const r of RelationAnalyzer.checkBranchPair(rA.idxs[p] % 12, rB.idxs[p] % 12)) {
        if (r.type === '합') bH++;
        else if (r.type === '충') bC++;
        else if (r.type === '형') bX++;
      }
      const sh = checkSamhapHalf(rA.idxs[p] % 12, rB.idxs[p] % 12);
      if (sh.ok) {
        const hasYuk = RelationAnalyzer.checkBranchPair(rA.idxs[p] % 12, rB.idxs[p] % 12).some(r => r.type === '합');
        if (!hasYuk) bH++;
      }
    }

    // 일간 십성 (표시용)
    const dsiA = rA.idxs.day % 10, dsiB = rB.idxs.day % 10;

    // oheng 데이터 - 전문 만세력과 동일한 가중치 계산 사용
    const weightedA = OhengAnalyzer.calculateWeightedOheng(rA, htA);
    const weightedB = OhengAnalyzer.calculateWeightedOheng(rB, htB);
    const ohA = weightedA.percent || { 목: 20, 화: 20, 토: 20, 금: 20, 수: 20 };
    const ohB = weightedB.percent || { 목: 20, 화: 20, 토: 20, 금: 20, 수: 20 };

    return {
      ysA, ysB, ohA, ohB, infoA, infoB,
      dayRelAB: tenGod(dsiA, dsiB), dayRelBA: tenGod(dsiB, dsiA),
      dayStemRels: RelationAnalyzer.checkStemPair(dsiA, dsiB),
      yearStemRels: RelationAnalyzer.checkStemPair(rA.idxs.year % 10, rB.idxs.year % 10),
      monthStemRels: RelationAnalyzer.checkStemPair(rA.idxs.month % 10, rB.idxs.month % 10),
      hourStemRels: (htA && htB) ? RelationAnalyzer.checkStemPair(rA.idxs.hour % 10, rB.idxs.hour % 10) : [],
      hourBrRels: (htA && htB) ? RelationAnalyzer.checkBranchPair(rA.idxs.hour % 12, rB.idxs.hour % 12) : [],
      dayBrRels: RelationAnalyzer.checkBranchPair(rA.idxs.day % 12, rB.idxs.day % 12),
      yearBrRels: RelationAnalyzer.checkBranchPair(rA.idxs.year % 12, rB.idxs.year % 12),
      monthBrRels: RelationAnalyzer.checkBranchPair(rA.idxs.month % 12, rB.idxs.month % 12),
      yongsinAinB: ohB[ysA.용신] || 0, yongsinBinA: ohA[ysB.용신] || 0,
      cross: { sH, sC, bH, bC, bX },
      details, notes, flags, rawTotal,
      scores: { total: normalized }
    };
  }

  /**
   * 두 사주의 궁합 분석 (간단 버전)
   * @param {Object} person1 - 첫 번째 사람의 사주 계산 결과
   * @param {Object} person2 - 두 번째 사람의 사주 계산 결과
   * @returns {Object} 궁합 분석 결과
   */
  analyze(person1, person2) {
    if (!person1 || !person2) {
      throw new Error('두 사람의 사주 정보가 필요합니다');
    }

    const result = {
      // 기본 정보
      person1: this.extractBasicInfo(person1),
      person2: this.extractBasicInfo(person2),

      // 상세 분석
      ilganAnalysis: this.analyzeIlgan(person1, person2),
      iljiAnalysis: this.analyzeIlji(person1, person2),
      woljuAnalysis: this.analyzeWolju(person1, person2),
      ohengAnalysis: this.analyzeOhengBalance(person1, person2),
      relationAnalysis: this.analyzeRelations(person1, person2),

      // 점수
      scores: {},
      totalScore: 0,

      // 종합 해석
      interpretation: '',
      advice: []
    };

    // 점수 계산
    result.scores = this.calculateScores(result);
    result.totalScore = this.calculateTotalScore(result.scores);

    // 해석 생성
    result.interpretation = this.generateInterpretation(result);
    result.advice = this.generateAdvice(result);

    return result;
  }
  
  /**
   * 기본 정보 추출
   */
  extractBasicInfo(person) {
    return {
      name: person.name || '본인',
      gender: person.gender,
      ilgan: person.saju?.dayPillar?.stem || person.dayPillar?.stem,
      ilji: person.saju?.dayPillar?.branch || person.dayPillar?.branch,
      wolgan: person.saju?.monthPillar?.stem || person.monthPillar?.stem,
      wolji: person.saju?.monthPillar?.branch || person.monthPillar?.branch,
      oheng: person.oheng || {}
    };
  }
  
  /**
   * 일간 궁합 분석
   */
  analyzeIlgan(person1, person2) {
    const stem1Idx = CHEONGAN.indexOf(person1.saju?.dayPillar?.stem || person1.dayPillar?.stem);
    const stem2Idx = CHEONGAN.indexOf(person2.saju?.dayPillar?.stem || person2.dayPillar?.stem);
    
    const stem1 = CHEONGAN[stem1Idx];
    const stem2 = CHEONGAN[stem2Idx];
    
    const oheng1 = CHEONGAN_OHENG[stem1Idx];
    const oheng2 = CHEONGAN_OHENG[stem2Idx];
    
    const result = {
      stems: [stem1, stem2],
      ohengs: [oheng1, oheng2],
      relation: null,
      score: 0,
      description: ''
    };
    
    // 합 체크 (갑기합, 을경합, 병신합, 정임합, 무계합)
    const combines = [[0, 5], [1, 6], [2, 7], [3, 8], [4, 9]];
    const isCombine = combines.some(([a, b]) => 
      (stem1Idx === a && stem2Idx === b) || (stem1Idx === b && stem2Idx === a)
    );
    
    if (isCombine) {
      result.relation = 'combine';
      result.score = STEM_COMPATIBILITY.COMBINE;
      result.description = `${stem1}와 ${stem2}가 합(合)하여 매우 좋은 궁합입니다.`;
      return result;
    }
    
    // 충 체크 (갑경충, 을신충, 병임충, 정계충, 무무충, 기기충)
    const clashes = [[0, 6], [1, 7], [2, 8], [3, 9]];
    const isClash = clashes.some(([a, b]) => 
      (stem1Idx === a && stem2Idx === b) || (stem1Idx === b && stem2Idx === a)
    );
    
    if (isClash) {
      result.relation = 'clash';
      result.score = STEM_COMPATIBILITY.CLASH;
      result.description = `${stem1}와 ${stem2}가 충(衝)하여 갈등이 있을 수 있습니다.`;
      return result;
    }
    
    // 같은 오행
    if (oheng1 === oheng2) {
      result.relation = 'same';
      result.score = STEM_COMPATIBILITY.SAME_OHENG;
      result.description = `두 사람 모두 ${oheng1}의 기운으로 비슷한 성향입니다.`;
      return result;
    }
    
    // 상생 체크
    if (OHENG_RELATION.GENERATE[oheng1] === oheng2) {
      result.relation = 'generate';
      result.score = STEM_COMPATIBILITY.GENERATE;
      result.description = `${oheng1}이 ${oheng2}를 생(生)하여 서로 돕는 관계입니다.`;
      return result;
    }
    
    if (OHENG_RELATION.GENERATE[oheng2] === oheng1) {
      result.relation = 'generated';
      result.score = STEM_COMPATIBILITY.GENERATE - 5; // 받는 쪽은 조금 낮게
      result.description = `${oheng2}가 ${oheng1}을 생(生)하여 도움을 받는 관계입니다.`;
      return result;
    }
    
    // 상극 체크
    if (OHENG_RELATION.OVERCOME[oheng1] === oheng2) {
      result.relation = 'overcome';
      result.score = STEM_COMPATIBILITY.OVERCOME;
      result.description = `${oheng1}이 ${oheng2}를 극(克)하여 주의가 필요합니다.`;
      return result;
    }
    
    if (OHENG_RELATION.OVERCOME[oheng2] === oheng1) {
      result.relation = 'overcame';
      result.score = STEM_COMPATIBILITY.OVERCOME - 5;
      result.description = `${oheng2}가 ${oheng1}을 극(克)하여 주의가 필요합니다.`;
      return result;
    }
    
    // 특별한 관계 없음
    result.relation = 'neutral';
    result.score = 0;
    result.description = '특별한 일간 관계가 없습니다.';
    
    return result;
  }
  
  /**
   * 일지 궁합 분석
   */
  analyzeIlji(person1, person2) {
    const branch1 = person1.saju?.dayPillar?.branch || person1.dayPillar?.branch;
    const branch2 = person2.saju?.dayPillar?.branch || person2.dayPillar?.branch;
    
    const branch1Idx = JIJI.indexOf(branch1);
    const branch2Idx = JIJI.indexOf(branch2);
    
    const result = {
      branches: [branch1, branch2],
      relations: [],
      score: 0,
      descriptions: []
    };
    
    // 같은 지지
    if (branch1 === branch2) {
      result.relations.push('same');
      result.score += BRANCH_COMPATIBILITY.SAME;
      result.descriptions.push(`두 사람 모두 ${branch1}의 일지로 비슷한 가정운입니다.`);
    }
    
    // 육합 체크
    const sixCombines = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
    const isSixCombine = sixCombines.some(([a, b]) => 
      (branch1Idx === a && branch2Idx === b) || (branch1Idx === b && branch2Idx === a)
    );
    
    if (isSixCombine) {
      result.relations.push('sixCombine');
      result.score += BRANCH_COMPATIBILITY.SIX_COMBINE;
      result.descriptions.push(`${branch1}와 ${branch2}가 육합하여 매우 좋은 배우자 궁합입니다.`);
    }
    
    // 충 체크
    const clashes = [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]];
    const isClash = clashes.some(([a, b]) => 
      (branch1Idx === a && branch2Idx === b) || (branch1Idx === b && branch2Idx === a)
    );
    
    if (isClash) {
      result.relations.push('clash');
      result.score += BRANCH_COMPATIBILITY.CLASH;
      result.descriptions.push(`${branch1}와 ${branch2}가 충(衝)하여 가정에서 갈등이 있을 수 있습니다.`);
    }
    
    // 형 체크
    const punishments = this.checkPunishment(branch1Idx, branch2Idx);
    if (punishments.length > 0) {
      result.relations.push('punishment');
      result.score += BRANCH_COMPATIBILITY.PUNISHMENT;
      result.descriptions.push(`${branch1}와 ${branch2} 사이에 형(刑)이 있어 주의가 필요합니다.`);
    }
    
    // 삼합 가능성 (두 사람이 삼합의 일부를 이룸)
    const triples = [
      [0, 4, 8],   // 신자진 수국
      [1, 5, 9],   // 사유축 금국
      [2, 6, 10],  // 인오술 화국
      [3, 7, 11]   // 해묘미 목국
    ];
    
    for (const triple of triples) {
      const has1 = triple.includes(branch1Idx);
      const has2 = triple.includes(branch2Idx);
      if (has1 && has2 && branch1Idx !== branch2Idx) {
        result.relations.push('triplePartial');
        result.score += BRANCH_COMPATIBILITY.TRIPLE_COMBINE / 2;
        result.descriptions.push(`두 사람이 삼합의 일부를 이루어 협력 관계가 좋습니다.`);
        break;
      }
    }
    
    // 관계가 없으면 기본 점수
    if (result.relations.length === 0) {
      result.descriptions.push('일지 간에 특별한 관계가 없습니다.');
    }
    
    return result;
  }
  
  /**
   * 형살 체크
   */
  checkPunishment(idx1, idx2) {
    const punishments = [];
    
    // 삼형
    // 인사신형 (寅巳申)
    if ([2, 5, 8].includes(idx1) && [2, 5, 8].includes(idx2) && idx1 !== idx2) {
      punishments.push('인사신형');
    }
    // 축술미형 (丑戌未)
    if ([1, 7, 10].includes(idx1) && [1, 7, 10].includes(idx2) && idx1 !== idx2) {
      punishments.push('축술미형');
    }
    
    // 자묘형 (子卯刑)
    if ((idx1 === 0 && idx2 === 3) || (idx1 === 3 && idx2 === 0)) {
      punishments.push('자묘형');
    }
    
    // 자형 (自刑: 辰辰, 午午, 酉酉, 亥亥)
    if (idx1 === idx2 && [4, 6, 9, 11].includes(idx1)) {
      punishments.push('자형');
    }
    
    return punishments;
  }
  
  /**
   * 월주 궁합 분석
   */
  analyzeWolju(person1, person2) {
    const wolgan1 = person1.saju?.monthPillar?.stem || person1.monthPillar?.stem;
    const wolji1 = person1.saju?.monthPillar?.branch || person1.monthPillar?.branch;
    const wolgan2 = person2.saju?.monthPillar?.stem || person2.monthPillar?.stem;
    const wolji2 = person2.saju?.monthPillar?.branch || person2.monthPillar?.branch;
    
    const result = {
      pillars: [[wolgan1, wolji1], [wolgan2, wolji2]],
      score: 0,
      description: ''
    };
    
    // 월지 계절 비교
    const seasons = {
      '인': '봄', '묘': '봄', '진': '봄',
      '사': '여름', '오': '여름', '미': '여름',
      '신': '가을', '유': '가을', '술': '가을',
      '해': '겨울', '자': '겨울', '축': '겨울'
    };
    
    const season1 = seasons[wolji1];
    const season2 = seasons[wolji2];
    
    if (season1 === season2) {
      result.score += 10;
      result.description = `두 사람 모두 ${season1}에 태어나 비슷한 성장 환경을 가졌습니다.`;
    } else {
      // 계절 궁합
      const seasonCompat = {
        '봄_가을': -5,
        '여름_겨울': -5,
        '봄_여름': 5,
        '여름_가을': 5,
        '가을_겨울': 5,
        '겨울_봄': 5
      };
      
      const key1 = `${season1}_${season2}`;
      const key2 = `${season2}_${season1}`;
      
      result.score += seasonCompat[key1] || seasonCompat[key2] || 0;
      result.description = `${season1}과 ${season2}에 태어난 두 사람입니다.`;
    }
    
    return result;
  }
  
  /**
   * 오행 밸런스 분석
   */
  analyzeOhengBalance(person1, person2) {
    const oheng1 = person1.oheng || {};
    const oheng2 = person2.oheng || {};
    
    const result = {
      person1Oheng: oheng1,
      person2Oheng: oheng2,
      complementary: [],
      score: 0,
      description: ''
    };
    
    // 각자 부족한 오행을 상대방이 채워주는지 체크
    const ohengList = ['목', '화', '토', '금', '수'];
    
    for (const oh of ohengList) {
      const val1 = oheng1[oh] || 0;
      const val2 = oheng2[oh] || 0;
      
      // 한쪽이 부족하고 다른 쪽이 발달한 경우
      if (val1 < THRESHOLDS.OHENG_WEAK && val2 > THRESHOLDS.OHENG_STRONG) {
        result.complementary.push({ element: oh, from: 'person2', to: 'person1' });
        result.score += 5;
      }
      if (val2 < THRESHOLDS.OHENG_WEAK && val1 > THRESHOLDS.OHENG_STRONG) {
        result.complementary.push({ element: oh, from: 'person1', to: 'person2' });
        result.score += 5;
      }
    }
    
    if (result.complementary.length > 0) {
      result.description = '두 사람의 오행이 서로 보완됩니다.';
    } else {
      result.description = '오행 보완 관계가 뚜렷하지 않습니다.';
    }
    
    return result;
  }
  
  /**
   * 기타 관계 분석 (전체 4주 비교)
   */
  analyzeRelations(person1, person2) {
    const pillars1 = this.extractPillars(person1);
    const pillars2 = this.extractPillars(person2);
    
    const result = {
      stemRelations: [],
      branchRelations: [],
      score: 0
    };
    
    // 각 기둥 간의 관계 체크
    for (const p1 of pillars1) {
      for (const p2 of pillars2) {
        const stem1Idx = CHEONGAN.indexOf(p1.stem);
        const stem2Idx = CHEONGAN.indexOf(p2.stem);
        const branch1Idx = JIJI.indexOf(p1.branch);
        const branch2Idx = JIJI.indexOf(p2.branch);

        // 천간 관계
        const stemRels = RelationAnalyzer.checkStemPair(stem1Idx, stem2Idx);
        for (const stemRel of stemRels) {
          result.stemRelations.push({
            stems: [p1.stem, p2.stem],
            pillars: [p1.type, p2.type],
            relation: stemRel
          });
        }

        // 지지 관계
        const branchRels = RelationAnalyzer.checkBranchPair(branch1Idx, branch2Idx);
        for (const branchRel of branchRels) {
          result.branchRelations.push({
            branches: [p1.branch, p2.branch],
            pillars: [p1.type, p2.type],
            relation: branchRel
          });
        }
      }
    }
    
    // 점수 계산 (합은 +, 충/형은 -)
    for (const rel of result.stemRelations) {
      if (rel.relation.type === '합') result.score += 3;
      if (rel.relation.type === '충') result.score -= 2;
    }

    for (const rel of result.branchRelations) {
      if (rel.relation.type === '합') result.score += 3;
      if (rel.relation.type === '충') result.score -= 3;
      if (rel.relation.type === '형') result.score -= 2;
      if (rel.relation.type === '파') result.score -= 1;
      if (rel.relation.type === '해') result.score -= 1;
    }
    
    return result;
  }
  
  /**
   * 사주에서 4주 추출
   */
  extractPillars(person) {
    const saju = person.saju || person;
    const pillars = [];
    
    const pillarTypes = [
      { key: 'yearPillar', type: '년주' },
      { key: 'monthPillar', type: '월주' },
      { key: 'dayPillar', type: '일주' },
      { key: 'hourPillar', type: '시주' }
    ];
    
    for (const { key, type } of pillarTypes) {
      if (saju[key]) {
        pillars.push({
          type,
          stem: saju[key].stem,
          branch: saju[key].branch
        });
      }
    }
    
    return pillars;
  }
  
  /**
   * 점수 계산
   */
  calculateScores(result) {
    return {
      ilgan: Math.max(0, 50 + result.ilganAnalysis.score),
      ilji: Math.max(0, 50 + result.iljiAnalysis.score),
      wolju: Math.max(0, 50 + result.woljuAnalysis.score),
      oheng: Math.max(0, 50 + result.ohengAnalysis.score),
      relations: Math.max(0, 50 + result.relationAnalysis.score)
    };
  }
  
  /**
   * 총점 계산
   */
  calculateTotalScore(scores) {
    const weighted = 
      (scores.ilgan * GUNGHAP_WEIGHTS.ILGAN +
       scores.ilji * GUNGHAP_WEIGHTS.ILJI +
       scores.wolju * GUNGHAP_WEIGHTS.WOLJU +
       scores.oheng * GUNGHAP_WEIGHTS.OHENG_BALANCE +
       scores.relations * GUNGHAP_WEIGHTS.RELATION) / 100;
    
    return Math.round(weighted);
  }
  
  /**
   * 종합 해석 생성
   */
  generateInterpretation(result) {
    const score = result.totalScore;
    
    if (score >= 80) {
      return '천생연분! 서로를 깊이 이해하고 함께 성장할 수 있는 최상의 궁합입니다.';
    } else if (score >= 70) {
      return '좋은 궁합입니다. 서로의 장점을 살리고 단점을 보완하면 행복한 관계를 유지할 수 있습니다.';
    } else if (score >= 60) {
      return '무난한 궁합입니다. 서로의 차이를 인정하고 노력하면 좋은 관계를 만들어갈 수 있습니다.';
    } else if (score >= 50) {
      return '보통 궁합입니다. 서로 다른 성향이 있으니 충분한 대화와 이해가 필요합니다.';
    } else {
      return '쉽지 않은 궁합입니다. 관계 유지를 위해서는 상당한 노력과 배려가 필요합니다.';
    }
  }
  
  /**
   * 조언 생성
   */
  generateAdvice(result) {
    const advice = [];
    
    // 일간 관계에 따른 조언
    if (result.ilganAnalysis.relation === 'combine') {
      advice.push('일간이 합하므로 첫인상부터 서로에게 끌림을 느낄 수 있습니다.');
    } else if (result.ilganAnalysis.relation === 'clash') {
      advice.push('일간이 충하므로 의견 충돌이 잦을 수 있습니다. 타협과 양보를 연습하세요.');
    }
    
    // 일지 관계에 따른 조언
    if (result.iljiAnalysis.relations.includes('sixCombine')) {
      advice.push('일지 육합으로 결혼 생활이 원만할 가능성이 높습니다.');
    } else if (result.iljiAnalysis.relations.includes('clash')) {
      advice.push('일지 충으로 가정 내 마찰이 있을 수 있습니다. 각자의 공간과 시간을 존중하세요.');
    }
    
    // 오행 보완 조언
    if (result.ohengAnalysis.complementary.length > 0) {
      advice.push('두 분의 오행이 서로 보완되어 함께할 때 더 완전해집니다.');
    }
    
    // 기본 조언
    if (advice.length === 0) {
      advice.push('서로의 차이를 인정하고 존중하는 것이 좋은 관계의 기본입니다.');
    }
    
    return advice;
  }
}

/**
 * 궁합 결과 포맷터
 */
export class GunghapFormatter {
  /**
   * 점수를 등급으로 변환
   */
  static scoreToGrade(score) {
    if (score >= 80) return { grade: 'S', label: '천생연분', color: '#FF6B6B' };
    if (score >= 70) return { grade: 'A', label: '좋은 궁합', color: '#4ECDC4' };
    if (score >= 60) return { grade: 'B', label: '무난한 궁합', color: '#45B7D1' };
    if (score >= 50) return { grade: 'C', label: '보통', color: '#96CEB4' };
    return { grade: 'D', label: '노력 필요', color: '#DDA0DD' };
  }
  
  /**
   * 퍼센트 바 HTML 생성
   */
  static renderScoreBar(score, maxScore = 100) {
    const percentage = Math.min(100, Math.round((score / maxScore) * 100));
    const grade = this.scoreToGrade(score);
    
    return `
      <div class="score-bar-container">
        <div class="score-bar" style="width: ${percentage}%; background-color: ${grade.color};"></div>
        <span class="score-label">${score}점</span>
      </div>
    `;
  }
  
  /**
   * 궁합 관계 아이콘
   */
  static relationIcon(relation) {
    const icons = {
      combine: '💕',
      sixCombine: '💑',
      tripleCombine: '🤝',
      clash: '⚡',
      punishment: '🔥',
      generate: '🌱',
      overcome: '⚔️',
      same: '👯',
      neutral: '➖'
    };
    
    return icons[relation] || '❓';
  }
}

/**
 * 궁합 UI 렌더러
 */
export class GunghapRenderer {
  constructor() {
    this.person1Result = null;
    this.person2Result = null;
    this.person1Gender = null;
    this.person2Gender = 'f';
    this.person1HasTime = false;
    this.person2HasTime = false;
    this.person2Name = null; // 유명인 이름 저장
  }

  /**
   * 초기화 - 이벤트 리스너 설정
   */
  init() {
    // index.html에 폼이 이미 있으므로 _renderPerson2Form 호출하지 않음
    this._setupEventListeners();
    this._setupActionButtons();
    // 메인 계산기에 이미 입력된 값이 있으면 자동으로 본인 정보 설정
    this._ensurePerson1();
  }


  /**
   * 유명인/최고의 조합 버튼 설정
   */
  _setupActionButtons() {
    // 유명인 버튼
    const celebBtn = document.getElementById('btn-gunghap-celeb');
    if (celebBtn) {
      celebBtn.addEventListener('click', () => this._showCelebSearch());
    }

    // 최고의 조합 버튼
    const bestBtn = document.getElementById('btn-gunghap-best');
    if (bestBtn) {
      bestBtn.addEventListener('click', () => this.findBestMatch());
    }
  }

  /**
   * 유명인 검색 모달 표시
   */
  _showCelebSearch() {
    // 유명인 DB 탭으로 이동하여 선택하게 함
    // 플래그 설정: 궁합 탭에서 왔음을 표시
    window.__celebReturnTab = 'gunghap';
    if (window.switchTab) {
      window.switchTab('celeb');
    }
  }

  /**
   * 상대방 정보 설정 (유명인 DB에서 선택 시)
   */
  setPartnerFromDb(person) {
    if (!person) return;
    // 유명인 이름 저장
    this.person2Name = person.name || null;

    document.getElementById('gh-year').value = person.year || '';
    document.getElementById('gh-month').value = String(person.month || '').padStart(2, '0');
    document.getElementById('gh-day').value = String(person.day || '').padStart(2, '0');
    if (person.hour !== null && person.hour !== undefined) {
      document.getElementById('gh-hour').value = String(person.hour).padStart(2, '0');
    }
    if (person.min !== undefined) {
      document.getElementById('gh-min').value = String(person.min).padStart(2, '0');
    }
    if (person.gender) {
      this.person2Gender = person.gender;
      document.getElementById('gh-gender-m').classList.toggle('active', person.gender === 'm');
      document.getElementById('gh-gender-f').classList.toggle('active', person.gender === 'f');
    }
    this._updateCalcButton();
  }

  /**
   * 외부에서 궁합 분석 실행 (유명인 선택 후 자동 실행용)
   */
  runAnalysis() {
    // 항상 현재 입력값 확인
    const year = parseInt(document.getElementById('in-year')?.value);
    const month = parseInt(document.getElementById('in-month')?.value);
    const day = parseInt(document.getElementById('in-day')?.value);

    if (!year || !month || !day) {
      alert('상단에서 본인의 생년월일을 먼저 입력해주세요.');
      return;
    }

    const hourVal = document.getElementById('in-hour')?.value?.trim();
    const minVal = document.getElementById('in-min')?.value?.trim();
    const hour = hourVal ? parseInt(hourVal) : 12;
    const minute = minVal ? parseInt(minVal) : 0;
    const hasTime = !!hourVal;

    // 성별 가져오기
    const genderM = document.getElementById('gender-m');
    const gender = genderM?.classList.contains('active') ? 'm' : 'f';

    // 입력값이 변경되었는지 확인
    const inp = this.person1Result?.input;
    const needsUpdate = !this.person1Result ||
      inp?.year !== year || inp?.month !== month || inp?.day !== day ||
      inp?.hour !== hour || inp?.minute !== minute ||
      this.person1Gender !== gender;

    if (needsUpdate) {
      // 사주 계산
      const result = SajuCalculator.calculate(year, month, day, hour, minute);
      result.input = { year, month, day, hour, minute };

      // person1 설정
      this.person1Result = result;
      this.person1HasTime = hasTime;
      this.person1Gender = gender;
      this._renderPerson1Info();
    }

    this._calculate();
  }

  /**
   * 본인 정보 업데이트 (메인 계산기 결과에서)
   */
  updatePerson1(result, hasTime, gender) {
    this.person1Result = result;
    this.person1HasTime = hasTime;
    this.person1Gender = gender;
    this._renderPerson1Info();
    this._updateCalcButton();
  }

  /**
   * 본인 정보 렌더링
   */
  _renderPerson1Info() {
    const container = document.getElementById('gunghap-person1-info');
    if (!container) return;

    if (!this.person1Result) {
      container.innerHTML = '<div class="gunghap-empty-msg">상단 계산기에서 본인 정보를 먼저 입력해주세요</div>';
      return;
    }

    const r = this.person1Result;
    const inp = r.input;
    const genderStr = this.person1Gender === 'm' ? '남' : this.person1Gender === 'f' ? '여' : '';

    let html = `<div class="gh-person-summary">`;
    html += `<div class="gh-date">${inp.year}.${String(inp.month).padStart(2, '0')}.${String(inp.day).padStart(2, '0')}`;
    if (this.person1HasTime) html += ` ${String(inp.hour).padStart(2, '0')}:${String(inp.minute).padStart(2, '0')}`;
    html += `</div>`;
    if (genderStr) html += `<div class="gh-gender">${genderStr}</div>`;
    html += `<div class="gh-pillars-mini">`;

    const positions = this.person1HasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    for (const p of positions) {
      html += `<span class="gh-pillar-mini">${r.pillars[p]}</span>`;
    }
    html += `</div></div>`;

    container.innerHTML = html;
  }

  /**
   * 이벤트 리스너 설정
   */
  _setupEventListeners() {
    // 성별 버튼
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('gh-gender-btn')) {
        document.querySelectorAll('.gh-gender-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.person2Gender = e.target.dataset.gender;
      }
    });

    // 입력 필드 변경 시 버튼 활성화 체크 (본인 + 상대방)
    ['in-year', 'in-month', 'in-day', 'gh-year', 'gh-month', 'gh-day', 'gh-hour', 'gh-min'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this._updateCalcButton());
    });

    // 궁합 입력 필드 스마트 입력 제한 (공유 유틸리티 사용)
    document.getElementById('gh-year')?.addEventListener('input', function() { smartInputLimit(this, 0, 2100); });
    document.getElementById('gh-month')?.addEventListener('input', function() { smartInputLimit(this, 0, 12); });
    document.getElementById('gh-day')?.addEventListener('input', function() { smartInputLimit(this, 0, 31); });
    document.getElementById('gh-hour')?.addEventListener('input', function() { smartInputLimit(this, 0, 23); });
    document.getElementById('gh-min')?.addEventListener('input', function() { smartInputLimit(this, 0, 59); });

    // 계산 버튼
    const calcBtn = document.getElementById('btn-gunghap-calc');
    if (calcBtn) {
      calcBtn.addEventListener('click', () => {
        this.person2Name = null; // 수동 입력 시 유명인 이름 초기화
        this._calculate();
      });
    }
  }

  /**
   * 계산 버튼 활성화 상태 업데이트
   */
  _updateCalcButton() {
    const btn = document.getElementById('btn-gunghap-calc');
    if (!btn) return;

    // 본인 정보: person1Result가 있거나 입력 필드에 값이 있으면 OK
    const p1Year = document.getElementById('in-year')?.value;
    const p1Month = document.getElementById('in-month')?.value;
    const p1Day = document.getElementById('in-day')?.value;
    const hasPerson1 = this.person1Result || (p1Year && p1Month && p1Day);

    // 상대방 정보
    const year = document.getElementById('gh-year')?.value;
    const month = document.getElementById('gh-month')?.value;
    const day = document.getElementById('gh-day')?.value;
    const hour = document.getElementById('gh-hour')?.value;
    const minute = document.getElementById('gh-min')?.value;

    const hasPerson2 = year && month && day;
    const timeValid = !hour || (hour && minute !== '');

    const isValid = hasPerson1 && hasPerson2 && timeValid;
    btn.disabled = !isValid;
  }

  /**
   * 궁합 계산 실행
   */
  _calculate() {
    // 항상 현재 입력 필드에서 본인 정보를 가져와서 계산 (변경 사항 반영)
    const p1Year = parseInt(document.getElementById('in-year')?.value);
    const p1Month = parseInt(document.getElementById('in-month')?.value);
    const p1Day = parseInt(document.getElementById('in-day')?.value);

    if (!p1Year || !p1Month || !p1Day) {
      alert('상단에서 본인의 생년월일을 먼저 입력해주세요.');
      return;
    }

    const p1HourVal = document.getElementById('in-hour')?.value?.trim();
    const p1MinVal = document.getElementById('in-min')?.value?.trim();
    const p1Hour = p1HourVal ? parseInt(p1HourVal) : 12;
    const p1Minute = p1MinVal ? parseInt(p1MinVal) : 0;
    this.person1HasTime = !!p1HourVal;

    this.person1Result = SajuCalculator.calculate(p1Year, p1Month, p1Day, p1Hour, p1Minute);
    this.person1Result.input = { year: p1Year, month: p1Month, day: p1Day, hour: p1Hour, minute: p1Minute };

    const genderM = document.getElementById('gender-m');
    this.person1Gender = genderM?.classList.contains('active') ? 'm' : 'f';
    this._renderPerson1Info();

    const year = parseInt(document.getElementById('gh-year')?.value);
    const month = parseInt(document.getElementById('gh-month')?.value);
    const day = parseInt(document.getElementById('gh-day')?.value);
    const hourVal = document.getElementById('gh-hour')?.value;
    const hour = hourVal ? parseInt(hourVal) : 12;
    const minute = parseInt(document.getElementById('gh-min')?.value) || 0;

    this.person2HasTime = !!hourVal;

    try {
      this.person2Result = SajuCalculator.calculate(year, month, day, hour, minute);
      this.person2Result.input = { year, month, day, hour, minute };

      // 완전한 궁합 분석 실행 (Python 알고리즘 기반)
      const analyzer = new GunghapAnalyzer();
      const compatResult = analyzer.analyzeCompatibilityFull(
        this.person1Result,
        this.person2Result,
        this.person1HasTime,
        this.person2HasTime
      );

      // 결과 렌더링
      this._renderResultsFull(compatResult);

    } catch (error) {
      console.error('궁합 계산 오류:', error);
      const resultsEl = document.getElementById('gunghap-results');
      if (resultsEl) {
        resultsEl.innerHTML = `<div class="error-msg">계산 중 오류가 발생했습니다: ${escapeHtml(error.message)}</div>`;
        resultsEl.style.display = 'block';
      }
    }
  }

  /**
   * 분석용 데이터 구조 생성
   */
  _preparePersonData(result, ohengData, yongsinData, gender) {
    return {
      saju: {
        yearPillar: { stem: result.pillars.year[0], branch: result.pillars.year[1] },
        monthPillar: { stem: result.pillars.month[0], branch: result.pillars.month[1] },
        dayPillar: { stem: result.pillars.day[0], branch: result.pillars.day[1] },
        hourPillar: { stem: result.pillars.hour[0], branch: result.pillars.hour[1] }
      },
      oheng: ohengData.percent,
      yongsin: yongsinData,
      gender,
      idxs: result.idxs,
      pillars: result.pillars,
      input: result.input
    };
  }

  /**
   * 결과 렌더링
   */
  _renderResults(result, oheng1, oheng2, yongsin1, yongsin2) {
    const container = document.getElementById('gunghap-results');
    if (!container) return;

    const grade = GunghapFormatter.scoreToGrade(result.totalScore);
    const r1 = this.person1Result, r2 = this.person2Result;

    let html = '<div class="gh-results-wrap">';

    // 점수 헤더
    html += `<div class="gh-score-center">
      <div class="gh-score-num" style="color:${grade.color}">${result.totalScore}<span style="font-size:1rem;font-weight:400;color:var(--text-dim)">/100</span></div>
      <div class="gh-score-grade" style="background:${grade.color}">${grade.grade}</div>
      <div class="gh-score-label">${grade.label}</div>
    </div>`;

    // 두 사람 사주 비교
    const person2LabelOld = this.person2Name || '상대';
    html += `<div class="gh-pillars-wrap">
      <div class="gh-side">
        <div class="section-title">본인${this.person1Gender === 'm' ? ' (남)' : this.person1Gender === 'f' ? ' (여)' : ''}</div>
        <div class="gh-side-info">${r1.input.year}.${String(r1.input.month).padStart(2, '0')}.${String(r1.input.day).padStart(2, '0')}</div>
        ${this._miniPillars(r1, this.person1HasTime)}
      </div>
      <div class="gh-vs">VS</div>
      <div class="gh-side">
        <div class="section-title">${person2LabelOld}${this.person2Gender === 'm' ? ' (남)' : this.person2Gender === 'f' ? ' (여)' : ''}</div>
        <div class="gh-side-info">${r2.input.year}.${String(r2.input.month).padStart(2, '0')}.${String(r2.input.day).padStart(2, '0')}</div>
        ${this._miniPillars(r2, this.person2HasTime)}
      </div>
    </div>`;

    // 해석
    html += `<div class="gh-interpretation">
      <div class="section-title">종합 해석</div>
      <p>${result.interpretation}</p>
    </div>`;

    // 궁합 관계 해설 카드
    html += `<div class="gh-relationship-card">
      <div class="section-title">두 사람의 궁합 관계</div>
      <div class="gh-rel-body">
        <div class="gh-rel-section">
          <div class="gh-rel-section-title">관계 유형</div>
          <div class="gh-rel-content"></div>
        </div>
        <div class="gh-rel-section">
          <div class="gh-rel-section-title">관계 역학</div>
          <div class="gh-rel-content"></div>
        </div>
        <div class="gh-rel-section">
          <div class="gh-rel-section-title">조언</div>
          <div class="gh-rel-content"></div>
        </div>
      </div>
    </div>`;

    // 상세 분석 카드들
    html += `<div class="compat-grid">`;

    // 일간 관계
    html += `<div class="compat-card">
      <div class="cc-title">일간 관계</div>
      <div class="cc-content">
        <p>${result.ilganAnalysis.description}</p>
        <div class="cc-score">점수: ${result.scores.ilgan}점</div>
      </div>
    </div>`;

    // 일지 관계
    html += `<div class="compat-card">
      <div class="cc-title">일지 관계</div>
      <div class="cc-content">
        ${result.iljiAnalysis.descriptions.map(d => `<p>${d}</p>`).join('')}
        <div class="cc-score">점수: ${result.scores.ilji}점</div>
      </div>
    </div>`;

    // 월주 관계
    html += `<div class="compat-card">
      <div class="cc-title">월주 관계</div>
      <div class="cc-content">
        <p>${result.woljuAnalysis.description}</p>
        <div class="cc-score">점수: ${result.scores.wolju}점</div>
      </div>
    </div>`;

    // 오행 보완
    html += `<div class="compat-card">
      <div class="cc-title">오행 보완</div>
      <div class="cc-content">
        <p>${result.ohengAnalysis.description}</p>
        ${result.ohengAnalysis.complementary.length > 0 ?
          `<p>보완 관계: ${result.ohengAnalysis.complementary.map(c => `${c.element} (${c.from} → ${c.to})`).join(', ')}</p>` : ''}
        <div class="cc-score">점수: ${result.scores.oheng}점</div>
      </div>
    </div>`;

    html += `</div>`; // compat-grid

    // 조언
    if (result.advice.length > 0) {
      html += `<div class="gh-advice">
        <div class="section-title">💡 조언</div>
        <ul>${result.advice.map(a => `<li>${a}</li>`).join('')}</ul>
      </div>`;
    }

    html += `</div>`; // gh-results-wrap

    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 공유 섹션 표시
    const shareEl = document.getElementById('gunghap-share');
    if (shareEl) shareEl.style.display = '';
  }

  /**
   * 완전한 결과 렌더링 (Python 알고리즘 결과용)
   */
  _renderResultsFull(c) {
    const container = document.getElementById('gunghap-results');
    if (!container) return;

    const r1 = this.person1Result, r2 = this.person2Result;
    const sc = c.scores.total;
    const scColor = sc >= 70 ? '#2d8a4e' : sc >= 45 ? '#b8860b' : '#c0392b';
    const rawColor = v => v > 0 ? '#2d8a4e' : v < 0 ? '#c0392b' : '#b8860b';
    const ohengColors = { 목: '#2d8a4e', 화: '#c0392b', 토: '#b8860b', 금: '#7f8c8d', 수: '#2874a6' };

    // 관계 태그 생성
    const tagFor = rels => {
      if (!rels || !rels.length) return '<span class="cc-tag cc-neutral">없음</span>';
      return rels.map(r =>
        `<span class="cc-tag ${r.type === '합' ? 'cc-good' : r.type === '충' ? 'cc-bad' : 'cc-warn'}">${r.desc}</span>`
      ).join(' ');
    };

    let html = '<div class="gh-results-wrap">';

    // 점수 헤더
    html += `<div class="gh-score-center">
        <div class="gh-score-num" style="color:${scColor}">${sc}<span style="font-size:1rem;font-weight:400;color:var(--text-dim)">/100</span></div>
        <div class="gh-score-label">종합 궁합 점수</div>
      </div>`;

    // 두 사람 사주 비교
    const gA = this.person1Gender === 'm' ? '남' : this.person1Gender === 'f' ? '여' : '';
    const gB = this.person2Gender === 'm' ? '남' : this.person2Gender === 'f' ? '여' : '';
    const person2Label = this.person2Name || '상대';
    html += `<div class="gh-pillars-wrap">
      <div class="gh-side">
        <div class="section-title">본인${gA ? ' (' + gA + ')' : ''}</div>
        <div class="gh-side-info">${r1.input.year}.${String(r1.input.month).padStart(2, '0')}.${String(r1.input.day).padStart(2, '0')}</div>
        ${this._miniPillars(r1, this.person1HasTime)}
      </div>
      <div class="gh-vs">VS</div>
      <div class="gh-side">
        <div class="section-title">${person2Label}${gB ? ' (' + gB + ')' : ''}</div>
        <div class="gh-side-info">${r2.input.year}.${String(r2.input.month).padStart(2, '0')}.${String(r2.input.day).padStart(2, '0')}</div>
        ${this._miniPillars(r2, this.person2HasTime)}
      </div>
    </div>`;

    // 점수 상세 테이블
    const d = c.details;
    const cats = [
      ['지지 합충', d.jiji], ['천간 합충', d.chungan], ['오행 보완', d.ohang],
      ['십성 구조', d.sipsung], ['12운성', d.unseong], ['특수 상황', d.special]
    ];
    html += `<div class="gh-score-details">`;
    html += `<div class="gh-details-title">항목별 점수 <span class="gh-raw-total">(원점수 합계: ${c.rawTotal >= 0 ? '+' : ''}${c.rawTotal})</span></div>`;
    for (const [label, val] of cats) {
      const pct = Math.min(Math.abs(val) / 20 * 100, 100);
      const col = rawColor(val);
      html += `<div class="gh-score-row">
        <span class="gh-score-label">${label}</span>
        <span class="gh-score-bar">
          ${val >= 0
            ? `<span class="gh-bar-fill gh-bar-positive" style="width:${pct}%;background:${col}"></span>`
            : `<span class="gh-bar-fill gh-bar-negative" style="width:${pct}%;background:${col}"></span>`}
        </span>
        <span class="gh-score-value" style="color:${col}">${val >= 0 ? '+' : ''}${val}</span>
      </div>`;
    }
    html += `</div>`;

    // 궁합 관계 해설 카드
    html += `<div class="gh-relationship-card">
      <div class="section-title">두 사람의 궁합 관계</div>
      <div class="gh-rel-body">
        <div class="gh-rel-section">
          <div class="gh-rel-section-title">관계 유형</div>
          <div class="gh-rel-content"></div>
        </div>
        <div class="gh-rel-section">
          <div class="gh-rel-section-title">관계 역학</div>
          <div class="gh-rel-content"></div>
        </div>
        <div class="gh-rel-section">
          <div class="gh-rel-section-title">조언</div>
          <div class="gh-rel-content"></div>
        </div>
      </div>
    </div>`;

    // 상세 분석 카드들
    html += `<div class="compat-grid">`;

    // 일간 관계
    const dsA = r1.idxs.day % 10, dsB = r2.idxs.day % 10;
    html += `<div class="compat-card">
      <div class="cc-title">일간 관계</div>
      <div class="cc-row">본인(${CHEONGAN[dsA]}${CHEONGAN_HANJA[dsA]}) → ${person2Label}: <b>${c.dayRelAB}</b></div>
      <div class="cc-row">${person2Label}(${CHEONGAN[dsB]}${CHEONGAN_HANJA[dsB]}) → 본인: <b>${c.dayRelBA}</b></div>
      ${c.dayStemRels.length ? `<div class="cc-row">${tagFor(c.dayStemRels)}</div>` : ''}
    </div>`;

    // 애착 유형 & 십성 구조
    const getAttachmentLabel = (type, subType) => {
      if (type === '안정형') return '안정형(균형)';
      if (type === '해당 사항 없음') return '—';
      return subType ? `${type}(${subType})` : type;
    };
    html += `<div class="compat-card">
      <div class="cc-title">애착 유형 & 십성</div>
      <div class="cc-row">본인: <b>${c.infoA.baldaSS}</b> · ${getAttachmentLabel(c.infoA.attachmentType, c.infoA.attachmentSubType)}</div>
      <div class="cc-row">${person2Label}: <b>${c.infoB.baldaSS}</b> · ${getAttachmentLabel(c.infoB.attachmentType, c.infoB.attachmentSubType)}</div>
    </div>`;

    // 지지 궁합
    const jijiPositions = [
      ['년지', r1.idxs.year % 12, r2.idxs.year % 12, c.yearBrRels],
      ['월지', r1.idxs.month % 12, r2.idxs.month % 12, c.monthBrRels],
      ['일지', r1.idxs.day % 12, r2.idxs.day % 12, c.dayBrRels]
    ];
    if (this.person1HasTime && this.person2HasTime) {
      jijiPositions.push(['시지', r1.idxs.hour % 12, r2.idxs.hour % 12, c.hourBrRels]);
    }
    html += `<div class="compat-card">
      <div class="cc-title">지지 궁합</div>`;
    for (const [pos, bA, bB, rels] of jijiPositions) {
      const sh = checkSamhapHalf(bA, bB);
      const allRels = [...rels];
      if (sh.ok && !rels.some(r => r.type === '합')) {
        allRels.push({ type: '합', desc: sh.desc });
      }
      html += `<div class="gh-rel-row">
        <span class="gh-rel-pos">${pos}</span>
        <span><b>${JIJI[bA]}${JIJI_HANJA[bA]}</b></span>
        <span class="gh-rel-arrow">↔</span>
        <span><b>${JIJI[bB]}${JIJI_HANJA[bB]}</b></span>
        <span>${tagFor(allRels)}</span>
      </div>`;
    }
    html += `</div>`;

    // 천간 궁합
    const cheonganPositions = [
      ['년간', r1.idxs.year % 10, r2.idxs.year % 10, c.yearStemRels],
      ['월간', r1.idxs.month % 10, r2.idxs.month % 10, c.monthStemRels],
      ['일간', r1.idxs.day % 10, r2.idxs.day % 10, c.dayStemRels]
    ];
    if (this.person1HasTime && this.person2HasTime) {
      cheonganPositions.push(['시간', r1.idxs.hour % 10, r2.idxs.hour % 10, c.hourStemRels]);
    }
    html += `<div class="compat-card">
      <div class="cc-title">천간 궁합</div>`;
    for (const [pos, sA, sB, rels] of cheonganPositions) {
      html += `<div class="gh-rel-row">
        <span class="gh-rel-pos">${pos}</span>
        <span><b>${CHEONGAN[sA]}${CHEONGAN_HANJA[sA]}</b></span>
        <span class="gh-rel-arrow">↔</span>
        <span><b>${CHEONGAN[sB]}${CHEONGAN_HANJA[sB]}</b></span>
        <span>${tagFor(rels)}</span>
      </div>`;
    }
    html += `</div>`;

    // 오행·용신 보완
    html += `<div class="compat-card compat-card-wide">
      <div class="cc-title">오행·용신 보완</div>
      <div class="gh-oheng-wrap">
        <div class="gh-oheng-side">
          <div class="gh-oheng-label">본인</div>
          <div class="gh-oheng-bars">`;
    for (const oh of ['목', '화', '토', '금', '수']) {
      const val = c.ohA[oh] || 0;
      html += `<div class="gh-oheng-bar">
        <span class="gh-oh-name" style="color:${ohengColors[oh]}">${oh}</span>
        <span class="gh-oh-track"><span class="gh-oh-fill" style="width:${Math.min(val, 100)}%;background:${ohengColors[oh]}"></span></span>
        <span class="gh-oh-val">${val.toFixed(0)}</span>
      </div>`;
    }
    html += `</div>
          <div class="gh-yongsin">억부용신: <b>${c.ysA.용신 || '—'}</b>${c.ysA.통관 ? ` / 통관용신: <b>${c.ysA.통관}</b>` : ''}</div>
        </div>
        <div class="gh-oheng-side">
          <div class="gh-oheng-label">${person2Label}</div>
          <div class="gh-oheng-bars">`;
    for (const oh of ['목', '화', '토', '금', '수']) {
      const val = c.ohB[oh] || 0;
      html += `<div class="gh-oheng-bar">
        <span class="gh-oh-name" style="color:${ohengColors[oh]}">${oh}</span>
        <span class="gh-oh-track"><span class="gh-oh-fill" style="width:${Math.min(val, 100)}%;background:${ohengColors[oh]}"></span></span>
        <span class="gh-oh-val">${val.toFixed(0)}</span>
      </div>`;
    }
    html += `</div>
          <div class="gh-yongsin">억부용신: <b>${c.ysB.용신 || '—'}</b>${c.ysB.통관 ? ` / 통관용신: <b>${c.ysB.통관}</b>` : ''}</div>
        </div>
      </div>
      <div class="gh-oheng-summary">
        ${c.infoA.balda.filter(e => c.infoB.bujokList.includes(e)).length > 0
          ? `<p>본인 발달(${c.infoA.balda}) → ${person2Label} 부족(${c.infoB.bujok}) 보완</p>` : ''}
        ${c.infoB.balda.filter(e => c.infoA.bujokList.includes(e)).length > 0
          ? `<p>${person2Label} 발달(${c.infoB.balda}) → 본인 부족(${c.infoA.bujok}) 보완</p>` : ''}
        ${c.flags.yongsinSame ? `<p class="gh-warn">용신 동일(${c.ysA.용신}) - 같은 해에 길흉 공유 가능</p>` : ''}
        ${c.flags.samhyung ? `<p class="gh-warn">삼형 발견: ${c.flags.samhyung}</p>` : ''}
      </div>
    </div>`;

    html += `</div>`; // compat-grid

    // 분석 상세 노트 (접기)
    if (c.notes.length > 0) {
      html += `<details class="gh-notes">
        <summary>분석 상세 로그 (${c.notes.length}개)</summary>
        <div class="gh-notes-list">
          ${c.notes.map(n => `<div class="gh-note">${n}</div>`).join('')}
        </div>
      </details>`;
    }

    html += `</div>`; // gh-results-wrap

    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 공유 섹션 표시
    const shareEl = document.getElementById('gunghap-share');
    if (shareEl) shareEl.style.display = '';
  }

  /**
   * 상세 사주 기둥 렌더링 (한자, 음양, 십성 포함)
   */
  _miniPillars(result, hasTime) {
    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const posNames = { hour: '시주', day: '일주', month: '월주', year: '년주' };
    const ohengColors = { 목: '#2d8a4e', 화: '#c0392b', 토: '#b8860b', 금: '#7f8c8d', 수: '#2874a6' };
    const dayStemIdx = result.idxs.day % 10;

    let html = '<div class="gh-pillars-detail">';

    // 시주가 없을 때 빈 칸 추가
    if (!hasTime) {
      html += `<div class="gh-pillar-detail empty">
        <div class="ghp-label">시주</div>
        <div class="ghp-tg">?</div>
        <div class="ghp-stem"><span class="ghp-hanja">?</span></div>
        <div class="ghp-yy">?</div>
        <div class="ghp-divider"></div>
        <div class="ghp-branch"><span class="ghp-hanja">?</span></div>
        <div class="ghp-yy">?</div>
        <div class="ghp-tg-branch">?</div>
      </div>`;
    }

    for (const p of positions) {
      const stemIdx = result.idxs[p] % 10;
      const branchIdx = result.idxs[p] % 12;
      const stemOh = CHEONGAN_OHENG[stemIdx];
      const branchOh = JIJI_OHENG[branchIdx];
      const stemYY = CHEONGAN_EUMYANG[stemIdx];
      const branchYY = JIJI_EUMYANG[branchIdx];

      // 십성 계산
      let tgStem = p === 'day' ? '일간' : SajuCalculator.getTenGod(dayStemIdx, stemIdx);
      let tgBranch = result.tgBranch?.[p] || '';

      const isDayPillar = p === 'day';

      html += `<div class="gh-pillar-detail${isDayPillar ? ' day' : ''}">
        <div class="ghp-label">${posNames[p]}</div>
        <div class="ghp-tg">${tgStem}</div>
        <div class="ghp-stem" style="color:${ohengColors[stemOh]}">
          <span class="ghp-hanja">${CHEONGAN_HANJA[stemIdx]}</span>
          <span class="ghp-hangul">${CHEONGAN[stemIdx]}</span>
        </div>
        <div class="ghp-yy">${stemYY === '양' ? '+' : '-'}${stemOh}</div>
        <div class="ghp-divider"></div>
        <div class="ghp-branch" style="color:${ohengColors[branchOh]}">
          <span class="ghp-hanja">${JIJI_HANJA[branchIdx]}</span>
          <span class="ghp-hangul">${JIJI[branchIdx]}</span>
        </div>
        <div class="ghp-yy">${branchYY === '양' ? '+' : '-'}${branchOh}</div>
        <div class="ghp-tg-branch">${tgBranch}</div>
      </div>`;
    }
    html += '</div>';
    return html;
  }

  /**
   * 최고의 궁합 찾기 실행
   */
  /**
   * 메인 계산기 입력 필드에서 본인 정보 자동 설정
   */
  _ensurePerson1() {
    const p1Year = parseInt(document.getElementById('in-year')?.value);
    const p1Month = parseInt(document.getElementById('in-month')?.value);
    const p1Day = parseInt(document.getElementById('in-day')?.value);

    if (!p1Year || !p1Month || !p1Day) return false;

    const p1HourVal = document.getElementById('in-hour')?.value?.trim();
    const p1MinVal = document.getElementById('in-min')?.value?.trim();
    const p1Hour = p1HourVal ? parseInt(p1HourVal) : 12;
    const p1Minute = p1MinVal ? parseInt(p1MinVal) : 0;

    const genderM = document.getElementById('gender-m');
    const gender = genderM?.classList.contains('active') ? 'm' : 'f';

    // 입력값이 변경되었는지 확인 (스왑 후에도 정확히 반영)
    const inp = this.person1Result?.input;
    const needsUpdate = !this.person1Result ||
      inp?.year !== p1Year || inp?.month !== p1Month || inp?.day !== p1Day ||
      inp?.hour !== p1Hour || inp?.minute !== p1Minute ||
      this.person1Gender !== gender;

    if (needsUpdate) {
      this.person1HasTime = !!p1HourVal;
      this.person1Result = SajuCalculator.calculate(p1Year, p1Month, p1Day, p1Hour, p1Minute);
      this.person1Result.input = { year: p1Year, month: p1Month, day: p1Day, hour: p1Hour, minute: p1Minute };
      this.person1Gender = gender;
      this._renderPerson1Info();
    }
    return true;
  }

  findBestMatch(silent = false) {
    if (!this._ensurePerson1()) {
      if (!silent) alert('본인 정보를 먼저 입력해주세요.');
      return;
    }

    const container = document.getElementById('gunghap-results');
    if (!container) return;

    // 나이 선택값 읽기
    const ageSelect = document.getElementById('bm-age-select');
    const ageDiff = ageSelect ? parseInt(ageSelect.value, 10) : 0;
    const personYear = this.person1Result.input.year;
    const targetYear = personYear - ageDiff;

    // 대상 년도의 년주 인덱스 계산
    const targetYi = ((REF_YEAR_IDX + (targetYear - REF_YEAR)) % 60 + 60) % 60;

    // 진행 UI 표시
    container.innerHTML = `
      <div class="bm-loading">
        <div id="bm-progress">궁합 분석 중...</div>
      </div>
    `;
    container.style.display = 'block';

    const finder = new BestMatchFinder(this.person1Result, this.person1HasTime);
    const result = finder.findBestMatchForYear(targetYi, targetYear);
    result.targetYear = targetYear;
    result.ageDiff = ageDiff;
    this._renderBestMatch(result);
  }

  /**
   * Best Match 결과 렌더링
   */
  _renderBestMatch(data) {
    const container = document.getElementById('gunghap-results');
    if (!container) return;

    const { bestList, worstList, dist, dMap, elapsed, targetYear, ageDiff } = data;
    const r = this.person1Result;
    const ohengColors = { 목: '#2d8a4e', 화: '#c0392b', 토: '#b8860b', 금: '#7f8c8d', 수: '#2874a6' };

    const ageLabel = ageDiff > 0 ? `${ageDiff}살 연상` : ageDiff < 0 ? `${Math.abs(ageDiff)}살 연하` : '동갑';

    const pillarH = (yi, mi, di) => {
      const ids = [di, mi, yi];
      const pN = ['일주', '월주', '년주'];
      let h = '<div class="gh-pillars" style="justify-content:center;margin:12px 0">';
      for (let i = 0; i < 3; i++) {
        const idx = ids[i], si = idx % 10, bi = idx % 12;
        h += `<div class="gh-pillar">
          <div class="gp-label">${pN[i]}</div>
          <div class="gp-char" style="color:${ohengColors[CHEONGAN_OHENG[si]]}">${CHEONGAN[si]}<span class="gp-cn">${CHEONGAN_HANJA[si]}</span></div>
          <div class="gp-div"></div>
          <div class="gp-char" style="color:${ohengColors[JIJI_OHENG[bi]]}">${JIJI[bi]}<span class="gp-cn">${JIJI_HANJA[bi]}</span></div>
          <div class="gp-sub">${CHEONGAN_OHENG[si]}/${JIJI_OHENG[bi]}</div>
        </div>`;
      }
      return h + '</div>';
    };

    const matchCard = (cand, rank, emoji, label, color) => {
      const ex = BestMatchFinder.getExampleDate(cand.yi, cand.mi, cand.di);
      let h = `<div class="bm-match" style="border-left:3px solid ${color}">`;
      h += `<div class="bm-match-title">${emoji} ${label} #${rank}</div>`;
      h += `<div class="bm-match-score" style="color:${color}">${cand.norm}<span style="font-size:1rem;font-weight:400;color:var(--text-dim)">/100</span></div>`;
      h += pillarH(cand.yi, cand.mi, cand.di);
      h += `<div class="bm-match-detail">`;
      h += `<span class="bm-detail-chip">지지 ${cand.jijiScore >= 0 ? '+' : ''}${cand.jijiScore}</span>`;
      h += `<span class="bm-detail-chip">천간 ${cand.chunganScore >= 0 ? '+' : ''}${cand.chunganScore}</span>`;
      h += `<span class="bm-detail-chip">오행 ${cand.ohangScore >= 0 ? '+' : ''}${cand.ohangScore}</span>`;
      h += `</div>`;
      h += `<div style="text-align:center;font-size:0.75rem;color:var(--text-dim);margin-top:10px">예시 생년월일: <b>${ex.y}년 ${ex.m}월 ${ex.d}일</b>생 (${YUKSHIP_GAPJA[cand.di]}일주)</div>`;
      h += `</div>`;
      return h;
    };

    let html = '<div class="bm-results">';

    // 대상 년도 배너
    html += `<div class="bm-banner">
      <div class="bm-banner-range">${targetYear}년생 (${ageLabel})</div>
      <div class="bm-banner-sub">점수 범위: <span style="color:#c0392b">${worstList.length ? worstList[0].norm : '-'}점</span> ~ <span style="color:#2d8a4e">${bestList.length ? bestList[0].norm : '-'}점</span></div>
    </div>`;

    // 최고의 궁합 (점수순 상위 3개, 조건 없음)
    if (bestList.length > 0) {
      html += `<div class="section-title" style="margin:20px 0 12px">최고의 궁합</div>`;
      html += `<div class="bm-match-grid">`;
      for (let i = 0; i < bestList.length; i++) {
        html += matchCard(bestList[i], i + 1, '🏆', '최고의 궁합', '#2d8a4e');
      }
      html += `</div>`;
    }

    // 최악의 궁합 (점수순 하위 3개, 조건 없음)
    if (worstList.length > 0) {
      html += `<div class="section-title" style="margin:20px 0 12px">최악의 궁합</div>`;
      html += `<div class="bm-match-grid">`;
      for (let i = 0; i < worstList.length; i++) {
        html += matchCard(worstList[i], i + 1, '💀', '최악의 궁합', '#c0392b');
      }
      html += `</div>`;
    }

    // 점수 분포
    const maxD = Math.max(...dist, 1);
    html += `<div class="bm-distrib">
      <div class="bm-distrib-title">📊 점수 분포</div>
      <div class="bm-distrib-bars">`;
    for (let i = 0; i < 21; i++) {
      const pct = dist[i] / maxD * 100;
      const scoreStart = i * 5;
      const c = scoreStart < 20 ? '#c0392b' : scoreStart < 35 ? '#e67e22' : scoreStart < 55 ? '#b8860b' : scoreStart < 75 ? '#27ae60' : '#2d8a4e';
      const label = i % 2 === 0 ? `${scoreStart}` : '';
      html += `<div class="bm-dbar" style="height:${Math.max(pct, 1)}%;background:${c}">
        <div class="bm-dbar-count">${dist[i] > 100 ? '' : dist[i] || ''}</div>
        <div class="bm-dbar-label">${label}</div>
      </div>`;
    }
    html += `</div></div>`;

    // 일주별 랭킹
    const ranked = dMap.map((d, i) => ({ ...d, idx: i })).sort((a, b) => b.avg - a.avg);
    html += `<div class="bm-rank">
      <div class="bm-rank-title">🎯 일주별 궁합 랭킹 TOP 5</div>
      <ul class="bm-rank-list">`;
    for (let i = 0; i < Math.min(5, ranked.length); i++) {
      const d = ranked[i], si = d.idx % 10, bi = d.idx % 12;
      const c = d.avg >= 65 ? '#2d8a4e' : d.avg >= 45 ? '#b8860b' : '#c0392b';
      html += `<li class="bm-rank-item">
        <span class="bm-rank-num">${i + 1}</span>
        <span class="bm-rank-pillar" style="color:${c}">${YUKSHIP_GAPJA[d.idx]}</span>
        <span class="bm-rank-el">${CHEONGAN_OHENG[si]}${JIJI_OHENG[bi]}</span>
        <div class="bm-rank-bar-wrap"><div class="bm-rank-bar" style="width:${d.avg}%;background:${c}"></div></div>
        <span class="bm-rank-score">${d.avg.toFixed(1)}</span>
      </li>`;
    }
    html += `</ul></div>`;

    // 궁합이 낮은 일주
    html += `<div class="bm-rank">
      <div class="bm-rank-title">⚠️ 궁합이 낮은 일주 BOTTOM 5</div>
      <ul class="bm-rank-list">`;
    for (let i = ranked.length - 1; i >= Math.max(0, ranked.length - 5); i--) {
      const d = ranked[i], si = d.idx % 10, bi = d.idx % 12;
      const c = d.avg >= 65 ? '#2d8a4e' : d.avg >= 45 ? '#b8860b' : '#c0392b';
      html += `<li class="bm-rank-item">
        <span class="bm-rank-num">${ranked.length - i}</span>
        <span class="bm-rank-pillar" style="color:${c}">${YUKSHIP_GAPJA[d.idx]}</span>
        <span class="bm-rank-el">${CHEONGAN_OHENG[si]}${JIJI_OHENG[bi]}</span>
        <div class="bm-rank-bar-wrap"><div class="bm-rank-bar" style="width:${d.avg}%;background:${c}"></div></div>
        <span class="bm-rank-score">${d.avg.toFixed(1)}</span>
      </li>`;
    }
    html += `</ul></div>`;

    html += `</div>`;

    container.innerHTML = html;
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * 최고의 궁합 찾기 클래스
 * 모든 일주 조합을 분석하여 최적/최악 매칭 찾기
 */
export class BestMatchFinder {
  constructor(resultA, hasTimeA) {
    this.resultA = resultA;
    this.hasTimeA = hasTimeA;
    this.ysA = YongsinAnalyzer.calculate(resultA, hasTimeA);
    this.infoA = derivePersonInfo(resultA, hasTimeA, this.ysA);

    // 룩업 테이블 구축
    this._buildLookupTables();
    this._precomputeScores();
  }

  /**
   * 룩업 테이블 구축
   */
  _buildLookupTables() {
    // 천간합충 테이블
    this.SP_T = new Int8Array(100);
    this.SP_E = new Int8Array(100);
    [[0, 5, 2], [1, 6, 3], [2, 7, 4], [3, 8, 0], [4, 9, 1]].forEach(([a, b, e]) => {
      this.SP_T[a * 10 + b] = this.SP_T[b * 10 + a] = 1;
      this.SP_E[a * 10 + b] = this.SP_E[b * 10 + a] = e;
    });
    [[0, 6], [1, 7], [2, 8], [3, 9]].forEach(([a, b]) => {
      this.SP_T[a * 10 + b] = this.SP_T[b * 10 + a] = 2;
    });

    // 지지합충 테이블
    this.BP_T = new Int8Array(144);
    this.BP_E = new Int8Array(144);
    [[0, 1, 2], [2, 11, 0], [3, 10, 1], [4, 9, 3], [5, 8, 4]].forEach(([a, b, e]) => {
      this.BP_T[a * 12 + b] = this.BP_T[b * 12 + a] = 1;
      this.BP_E[a * 12 + b] = this.BP_E[b * 12 + a] = e;
    });
    [[0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]].forEach(([a, b]) => {
      this.BP_T[a * 12 + b] = this.BP_T[b * 12 + a] = 2;
    });

    // 반합 테이블
    this.SH = new Uint8Array(144);
    [[2, 6], [6, 10], [5, 9], [9, 1], [8, 0], [0, 4], [11, 3], [3, 7]].forEach(([a, b]) => {
      this.SH[a * 12 + b] = this.SH[b * 12 + a] = 1;
    });

    // 지지 오행 분포 (숫자화)
    this.BD = BR_EL.map(arr => arr.map(({ e, r }) => [OHENG_IDX[e], r]));
  }

  /**
   * A측 궁성별 점수 사전계산
   */
  _precomputeScores() {
    const r = this.resultA;
    const aDS = r.idxs.day % 10, aDB = r.idxs.day % 12;
    const aMS = r.idxs.month % 10, aMB = r.idxs.month % 12;
    const aYS = r.idxs.year % 10, aYB = r.idxs.year % 12;

    // 일주별 점수 (60개)
    this.dayIljiS = new Float32Array(60);
    this.dayIlganS = new Float32Array(60);
    for (let di = 0; di < 60; di++) {
      const dbi = di % 12, dsi = di % 10;
      const bk = aDB * 12 + dbi;
      if (this.BP_T[bk] === 1) this.dayIljiS[di] = 15;
      else if (this.SH[bk]) this.dayIljiS[di] = 10;
      else if (this.BP_T[bk] === 2) this.dayIljiS[di] = -10;
      const sk = aDS * 10 + dsi;
      if (this.SP_T[sk] === 1) this.dayIlganS[di] = 7;
      else if (this.SP_T[sk] === 2) this.dayIlganS[di] = -5;
    }

    // 년주별 점수 (60개)
    this.yearNyS = new Float32Array(60);
    this.yearNgS = new Float32Array(60);
    for (let yi = 0; yi < 60; yi++) {
      const ybi = yi % 12, ysi = yi % 10;
      const bk = aYB * 12 + ybi;
      if (this.BP_T[bk] === 1) this.yearNyS[yi] = 5;
      else if (this.SH[bk]) this.yearNyS[yi] = 3;
      else if (this.BP_T[bk] === 2) this.yearNyS[yi] = -5;
      const sk = aYS * 10 + ysi;
      if (this.SP_T[sk] === 1) this.yearNgS[yi] = 2;
      else if (this.SP_T[sk] === 2) this.yearNgS[yi] = -2;
    }

    // 월지별 점수 (12개)
    this.monthBrS = new Float32Array(12);
    for (let mn = 1; mn <= 12; mn++) {
      const mBr = (mn + 1) % 12, bk = aMB * 12 + mBr;
      if (this.BP_T[bk] === 1) this.monthBrS[mn - 1] = 10;
      else if (this.SH[bk]) this.monthBrS[mn - 1] = 8;
      else if (this.BP_T[bk] === 2) this.monthBrS[mn - 1] = -15;
    }

    // 월간별 점수 (10개)
    this.monthStS = new Float32Array(10);
    for (let ms = 0; ms < 10; ms++) {
      const sk = aMS * 10 + ms;
      if (this.SP_T[sk] === 1) this.monthStS[ms] = 4;
      else if (this.SP_T[sk] === 2) this.monthStS[ms] = -3;
    }

    // 부족/발달 오행 셋
    this.baldaASet = new Set(this.infoA.balda.map(e => OHENG_IDX[e]));
    this.bujokAIdx = OHENG_IDX[this.infoA.bujok];
    this.bujokASet = new Set(this.infoA.bujokList.map(e => OHENG_IDX[e]));
  }

  /**
   * 빠른 가중 오행 계산 (3궁, no-time 전용)
   */
  _fastOh(di, mi, yi) {
    const s0 = di % 10, s1 = mi % 10, s2 = yi % 10;
    const b0 = di % 12, b1 = mi % 12, b2 = yi % 12;
    let sOf0 = 1, sOf1 = 1, sOf2 = 1, bOf0 = 1, bOf1 = 1, bOf2 = 1;
    let st0e = -1, st0f = 0, st1ae = -1, st1af = 0, st1be = -1, st1bf = 0, st2e = -1, st2f = 0;
    let bt0e = -1, bt0f = 0, bt1ae = -1, bt1af = 0, bt1be = -1, bt1bf = 0, bt2e = -1, bt2f = 0;

    // 천간 day-month
    const sk01 = s0 * 10 + s1;
    if (this.SP_T[sk01] === 1) {
      const e = this.SP_E[sk01];
      st0e = e; st0f = 1 / 6; st1ae = e; st1af = 1 / 6;
      sOf0 *= 5 / 6; sOf1 *= 5 / 6;
    } else if (this.SP_T[sk01] === 2) {
      sOf0 *= 5 / 6; sOf1 *= 5 / 6;
    }

    // 천간 month-year
    const sk12 = s1 * 10 + s2;
    if (this.SP_T[sk12] === 1) {
      const e = this.SP_E[sk12];
      st1be = e; st1bf = 1 / 6; st2e = e; st2f = 1 / 3;
      sOf1 *= 5 / 6; sOf2 *= 2 / 3;
    } else if (this.SP_T[sk12] === 2) {
      sOf1 *= 5 / 6; sOf2 *= 2 / 3;
    }

    // 지지 day-month
    const bk01 = b0 * 12 + b1;
    if (this.BP_T[bk01] === 1) {
      const e = this.BP_E[bk01];
      bt0e = e; bt0f = 1 / 3; bt1ae = e; bt1af = 1 / 3;
      bOf0 *= 2 / 3; bOf1 *= 2 / 3;
    } else if (this.BP_T[bk01] === 2) {
      bOf0 *= 2 / 3; bOf1 *= 2 / 3;
    }

    // 지지 month-year
    const bk12 = b1 * 12 + b2;
    if (this.BP_T[bk12] === 1) {
      const e = this.BP_E[bk12];
      bt1be = e; bt1bf = 1 / 3; bt2e = e; bt2f = 2 / 3;
      bOf1 *= 2 / 3; bOf2 *= 1 / 3;
    } else if (this.BP_T[bk12] === 2) {
      bOf1 *= 2 / 3; bOf2 *= 1 / 3;
    }

    // 오행 합산
    const oh = [0, 0, 0, 0, 0];
    oh[STEM_OHENG_IDX[s0]] += 15 * sOf0; if (st0e >= 0) oh[st0e] += 15 * st0f;
    oh[STEM_OHENG_IDX[s1]] += 20 * sOf1; if (st1ae >= 0) oh[st1ae] += 20 * st1af; if (st1be >= 0) oh[st1be] += 20 * st1bf;
    oh[STEM_OHENG_IDX[s2]] += 10 * sOf2; if (st2e >= 0) oh[st2e] += 10 * st2f;
    for (const [e, r] of this.BD[b0]) oh[e] += 20 * r * bOf0; if (bt0e >= 0) oh[bt0e] += 20 * bt0f;
    for (const [e, r] of this.BD[b1]) oh[e] += 30 * r * bOf1; if (bt1ae >= 0) oh[bt1ae] += 30 * bt1af; if (bt1be >= 0) oh[bt1be] += 30 * bt1bf;
    for (const [e, r] of this.BD[b2]) oh[e] += 15 * r * bOf2; if (bt2e >= 0) oh[bt2e] += 15 * bt2f;
    return oh;
  }

  /**
   * 비동기 분석 실행
   */
  findBestMatch(onProgress, onComplete) {
    const t0 = performance.now();
    const dist = new Array(21).fill(0);
    let gBestList = [], gWorstList = [];
    const dMap = [];
    for (let i = 0; i < 60; i++) {
      dMap[i] = { sum: 0, cnt: 0, best: -999, worst: 999, bYI: 0, bMI: 0 };
    }

    let diIdx = 0;
    const CHUNK = 15;
    const GJ = GAPJA_INDEX_MAP;

    const processChunk = () => {
      const end = Math.min(diIdx + CHUNK, 60);
      for (; diIdx < end; diIdx++) {
        const di = diIdx, ds = dMap[di];
        const iljiS = this.dayIljiS[di], ilganS = this.dayIlganS[di];

        for (let yi = 0; yi < 60; yi++) {
          const nyS = this.yearNyS[yi], ngS = this.yearNgS[yi];
          const ySt = yi % 10, msS = ((ySt % 5) * 2 + 2) % 10;

          for (let mn = 1; mn <= 12; mn++) {
            const mSt = (msS + (mn - 1)) % 10, mBr = (mn + 1) % 12;
            const mi = GJ[`${mSt},${mBr}`];
            const jijiScore = iljiS + this.monthBrS[mn - 1] + nyS;
            const chunganScore = ilganS + this.monthStS[mSt] + ngS;

            const oh = this._fastOh(di, mi, yi);
            let maxV = -1, minV = 999, maxE = 0, minE = 0;
            const baldaB = [], bujokB = [];
            for (let e = 0; e < 5; e++) {
              if (oh[e] >= 30) baldaB.push(e);
              if (oh[e] <= 15) bujokB.push(e);
              if (oh[e] > maxV) { maxV = oh[e]; maxE = e; }
              if (oh[e] < minV) { minV = oh[e]; minE = e; }
            }
            if (!baldaB.length) baldaB.push(maxE);
            const bujokBF = bujokB.length ? bujokB[bujokB.length - 1] : minE;

            let ohangScore = 0;
            if (this.baldaASet.has(bujokBF)) ohangScore += 15;
            if (baldaB.includes(this.bujokAIdx)) ohangScore += 15;
            for (const bi of bujokB) {
              if (this.bujokASet.has(bi)) ohangScore -= 8;
            }

            const raw = jijiScore + chunganScore + ohangScore;
            const score = Math.round(Math.max(0, Math.min(100, 50 + raw)));
            dist[Math.min(Math.floor(score / 5), 20)]++;

            // 일간, 일지, 월간, 월지, 년주 정보 저장
            const dsi = di % 10, dbi = di % 12;
            const msi = mi % 10, mbi = mi % 12;
            const cand = {
              score: raw, norm: score, di, yi, mi, jijiScore, chunganScore, ohangScore,
              dsi, dbi, msi, mbi, yKey: yi  // 일간, 일지, 월간, 월지, 년주
            };

            // 다양성 체크: 일주(di) 다름 + 년주 안겹침
            const isDiverse = (list, c) => {
              for (const x of list) {
                // 일주가 같으면 불가 (일주는 모두 다르게)
                if (x.di === c.di) return false;
                // 년주 겹치면 불가
                if (x.yKey === c.yKey) return false;
              }
              return true;
            };

            // 상위 (92점 이상 필터는 렌더링에서 처리)
            if (gBestList.length < 10) {
              if (isDiverse(gBestList, cand)) gBestList.push(cand);
            } else if (raw > gBestList[gBestList.length - 1].score && isDiverse(gBestList, cand)) {
              gBestList.push(cand);
              gBestList.sort((a, b) => b.score - a.score);
              gBestList.splice(10);
            }

            // 하위 (8점 이하 필터는 렌더링에서 처리)
            if (gWorstList.length < 10) {
              if (isDiverse(gWorstList, cand)) gWorstList.push(cand);
            } else if (raw < gWorstList[gWorstList.length - 1].score && isDiverse(gWorstList, cand)) {
              gWorstList.push(cand);
              gWorstList.sort((a, b) => a.score - b.score);
              gWorstList.splice(10);
            }

            if (raw > ds.best) { ds.best = raw; ds.bYI = yi; ds.bMI = mi; }
            if (raw < ds.worst) ds.worst = raw;
            ds.sum += score; ds.cnt++;
          }
        }
      }

      const pct = Math.round(diIdx / 60 * 100);
      if (onProgress) onProgress(pct);

      if (diIdx < 60) {
        requestAnimationFrame(processChunk);
      } else {
        const elapsed = performance.now() - t0;
        for (let i = 0; i < 60; i++) {
          dMap[i].avg = dMap[i].cnt ? dMap[i].sum / dMap[i].cnt : 0;
        }
        if (onComplete) {
          onComplete({
            bestList: gBestList,
            worstList: gWorstList,
            dist,
            dMap,
            elapsed
          });
        }
      }
    };

    requestAnimationFrame(processChunk);
  }

  /**
   * 특정 년도(yi)에 대해 최고/최악 궁합 찾기 (동기 처리, 다양성 제한 없음)
   */
  findBestMatchForYear(yi, targetCalendarYear = null) {
    const GJ = GAPJA_INDEX_MAP;
    const ySt = yi % 10;
    const msS = ((ySt % 5) * 2 + 2) % 10;
    const nyS = this.yearNyS[yi], ngS = this.yearNgS[yi];

    const allCands = [];

    for (let di = 0; di < 60; di++) {
      const iljiS = this.dayIljiS[di], ilganS = this.dayIlganS[di];

      for (let mn = 1; mn <= 12; mn++) {
        const mSt = (msS + (mn - 1)) % 10, mBr = (mn + 1) % 12;
        const mi = GJ[`${mSt},${mBr}`];
        const jijiScore = iljiS + this.monthBrS[mn - 1] + nyS;
        const chunganScore = ilganS + this.monthStS[mSt] + ngS;

        const oh = this._fastOh(di, mi, yi);
        let maxV = -1, minV = 999, maxE = 0, minE = 0;
        const baldaB = [], bujokB = [];
        for (let e = 0; e < 5; e++) {
          if (oh[e] >= 30) baldaB.push(e);
          if (oh[e] <= 15) bujokB.push(e);
          if (oh[e] > maxV) { maxV = oh[e]; maxE = e; }
          if (oh[e] < minV) { minV = oh[e]; minE = e; }
        }
        if (!baldaB.length) baldaB.push(maxE);
        const bujokBF = bujokB.length ? bujokB[bujokB.length - 1] : minE;

        let ohangScore = 0;
        if (this.baldaASet.has(bujokBF)) ohangScore += 15;
        if (baldaB.includes(this.bujokAIdx)) ohangScore += 15;
        for (const bi of bujokB) {
          if (this.bujokASet.has(bi)) ohangScore -= 8;
        }

        const raw = jijiScore + chunganScore + ohangScore;
        const score = Math.round(Math.max(0, Math.min(100, 50 + raw)));

        allCands.push({
          score: raw, norm: score, di, yi, mi, jijiScore, chunganScore, ohangScore,
          dsi: di % 10, dbi: di % 12, msi: mi % 10, mbi: mi % 12, yKey: yi
        });
      }
    }

    // 양력 연도 필터: 예시 날짜가 대상 연도와 다르면 제외
    let filtered = allCands;
    if (targetCalendarYear) {
      filtered = allCands.filter(c => {
        const ex = BestMatchFinder.getExampleDate(c.yi, c.mi, c.di);
        return ex.y === targetCalendarYear;
      });
      if (filtered.length === 0) filtered = allCands; // 폴백
    }

    // 점수순 정렬
    filtered.sort((a, b) => b.score - a.score);

    // 다양성 필터: 일주(di) 중복 방지 + 월주 완전 겹침 방지
    const pickDiverse = (sorted) => {
      const picked = [];
      for (const c of sorted) {
        if (picked.length >= 3) break;
        const dominated = picked.some(p => {
          // 일주(di)가 같으면 탈락 — 3개 카드 모두 다른 일주
          if (c.di === p.di) return true;
          // 월주가 완전 동일하면 탈락
          if (c.msi === p.msi && c.mbi === p.mbi) return true;
          return false;
        });
        if (!dominated) picked.push(c);
      }
      return picked;
    };

    const bestList = pickDiverse(filtered);
    const worstList = pickDiverse([...filtered].reverse());

    // 점수 분포
    const dist = new Array(21).fill(0);
    for (const c of filtered) {
      dist[Math.min(Math.floor(c.norm / 5), 20)]++;
    }

    // 일주별 평균
    const dMap = [];
    for (let i = 0; i < 60; i++) {
      dMap[i] = { sum: 0, cnt: 0, avg: 0 };
    }
    for (const c of filtered) {
      dMap[c.di].sum += c.norm;
      dMap[c.di].cnt++;
    }
    for (let i = 0; i < 60; i++) {
      dMap[i].avg = dMap[i].cnt ? dMap[i].sum / dMap[i].cnt : 0;
    }

    return { bestList, worstList, dist, dMap, elapsed: 0 };
  }

  /**
   * 예시 날짜 계산
   */
  static getExampleDate(yi, mi, di) {
    const mBr = mi % 12, mn = ((mBr - 2 + 12) % 12) + 1;
    let baseY = REF_YEAR + ((yi - REF_YEAR_IDX) % 60 + 60) % 60;
    let y = baseY;
    while (y >= 2020) y -= 60;
    while (y < 1940) y += 60;
    // mn은 사주월(1=인월~12=축월)이므로 양력으로는 +1월 (인월=2월)
    const ref = new Date(y, mn, 15);
    const dd = Math.round((ref.getTime() - REF_DATE.getTime()) / 86400000);
    const curDI = ((REF_DAY_IDX + dd) % 60 + 60) % 60;
    let off = ((di - curDI) % 60 + 60) % 60;
    if (off > 30) off -= 60;
    const td = new Date(ref.getTime() + off * 86400000);
    return { y: td.getFullYear(), m: td.getMonth() + 1, d: td.getDate() };
  }
}

export default GunghapAnalyzer;
