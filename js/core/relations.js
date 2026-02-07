/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 연세사주 - 관계 분석 모듈 (합충형파해)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { CHEONGAN, JIJI } from './constants.js';

/**
 * 관계 정의 테이블
 */
const RELATIONS = {
  // 천간합 (갑기합토, 을경합금, 병신합수, 정임합목, 무계합화)
  STEM_COMBINE: [
    { pair: [0, 5], result: '토' },  // 갑기
    { pair: [1, 6], result: '금' },  // 을경
    { pair: [2, 7], result: '수' },  // 병신
    { pair: [3, 8], result: '목' },  // 정임
    { pair: [4, 9], result: '화' }   // 무계
  ],
  
  // 천간충 (갑경충, 을신충, 병임충, 정계충)
  STEM_CLASH: [
    [0, 6], [1, 7], [2, 8], [3, 9]
  ],
  
  // 지지육합
  BRANCH_COMBINE: [
    { pair: [0, 1], result: '토' },   // 자축합
    { pair: [2, 11], result: '목' },  // 인해합
    { pair: [3, 10], result: '화' },  // 묘술합
    { pair: [4, 9], result: '금' },   // 진유합
    { pair: [5, 8], result: '수' },   // 사신합
    { pair: [6, 7], result: '화' }    // 오미합
  ],
  
  // 지지육충
  BRANCH_CLASH: [
    [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]
  ],
  
  // 지지형 (삼형, 자묘형, 술미축형 등)
  BRANCH_PUNISHMENT: [
    { branches: [2, 5], type: '인사형' },
    { branches: [5, 8], type: '사신형' },
    { branches: [2, 8], type: '인신형' },
    { branches: [1, 10], type: '축술형' },
    { branches: [10, 7], type: '술미형' },
    { branches: [1, 7], type: '축미형' },
    { branches: [0, 3], type: '자묘형' }
  ],
  
  // 지지파
  BRANCH_BREAK: [
    [0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [10, 7]
  ],
  
  // 지지해
  BRANCH_HARM: [
    [0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]
  ],
  
  // 삼합
  TRIPLE_COMBINE: [
    { branches: [2, 6, 10], result: '화' },  // 인오술 화국
    { branches: [5, 9, 1], result: '금' },   // 사유축 금국
    { branches: [8, 0, 4], result: '수' },   // 신자진 수국
    { branches: [11, 3, 7], result: '목' }   // 해묘미 목국
  ],
  
  // 방합
  DIRECTIONAL_COMBINE: [
    { branches: [2, 3, 4], direction: '동', result: '목' },
    { branches: [5, 6, 7], direction: '남', result: '화' },
    { branches: [8, 9, 10], direction: '서', result: '금' },
    { branches: [11, 0, 1], direction: '북', result: '수' }
  ]
};

/**
 * 관계 분석기 클래스
 */
export class RelationAnalyzer {
  /**
   * 천간 쌍 관계 검사
   */
  static checkStemPair(stemIdx1, stemIdx2) {
    const results = [];
    
    // 천간합 검사
    for (const { pair, result } of RELATIONS.STEM_COMBINE) {
      if ((stemIdx1 === pair[0] && stemIdx2 === pair[1]) ||
          (stemIdx1 === pair[1] && stemIdx2 === pair[0])) {
        results.push({
          type: '합',
          desc: `${CHEONGAN[stemIdx1]}${CHEONGAN[stemIdx2]}합(${result})`,
          result
        });
      }
    }
    
    // 천간충 검사
    for (const [a, b] of RELATIONS.STEM_CLASH) {
      if ((stemIdx1 === a && stemIdx2 === b) ||
          (stemIdx1 === b && stemIdx2 === a)) {
        results.push({
          type: '충',
          desc: `${CHEONGAN[stemIdx1]}${CHEONGAN[stemIdx2]}충`
        });
      }
    }
    
    return results;
  }

  /**
   * 지지 쌍 관계 검사
   */
  static checkBranchPair(branchIdx1, branchIdx2) {
    const results = [];
    
    // 육합 검사
    for (const { pair, result } of RELATIONS.BRANCH_COMBINE) {
      if ((branchIdx1 === pair[0] && branchIdx2 === pair[1]) ||
          (branchIdx1 === pair[1] && branchIdx2 === pair[0])) {
        results.push({
          type: '합',
          desc: `${JIJI[branchIdx1]}${JIJI[branchIdx2]}합(${result})`,
          result
        });
      }
    }
    
    // 육충 검사
    for (const [a, b] of RELATIONS.BRANCH_CLASH) {
      if ((branchIdx1 === a && branchIdx2 === b) ||
          (branchIdx1 === b && branchIdx2 === a)) {
        results.push({
          type: '충',
          desc: `${JIJI[branchIdx1]}${JIJI[branchIdx2]}충`
        });
      }
    }
    
    // 형 검사
    for (const { branches, type } of RELATIONS.BRANCH_PUNISHMENT) {
      if ((branchIdx1 === branches[0] && branchIdx2 === branches[1]) ||
          (branchIdx1 === branches[1] && branchIdx2 === branches[0])) {
        results.push({
          type: '형',
          desc: `${JIJI[branchIdx1]}${JIJI[branchIdx2]}형`,
          punishmentType: type
        });
      }
    }
    
    // 파 검사
    for (const [a, b] of RELATIONS.BRANCH_BREAK) {
      if ((branchIdx1 === a && branchIdx2 === b) ||
          (branchIdx1 === b && branchIdx2 === a)) {
        results.push({
          type: '파',
          desc: `${JIJI[branchIdx1]}${JIJI[branchIdx2]}파`
        });
      }
    }
    
    // 해 검사
    for (const [a, b] of RELATIONS.BRANCH_HARM) {
      if ((branchIdx1 === a && branchIdx2 === b) ||
          (branchIdx1 === b && branchIdx2 === a)) {
        results.push({
          type: '해',
          desc: `${JIJI[branchIdx1]}${JIJI[branchIdx2]}해`
        });
      }
    }
    
    return results;
  }

  /**
   * 원국 내 모든 관계 감지
   */
  static detectAllRelations(result, hasTime) {
    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const positionLabels = { hour: '시', day: '일', month: '월', year: '년' };
    const relations = [];

    // 인접 기둥 간 관계 분석
    for (let i = 0; i < positions.length - 1; i++) {
      const p1 = positions[i];
      const p2 = positions[i + 1];
      
      const stem1 = result.idxs[p1] % 10;
      const stem2 = result.idxs[p2] % 10;
      const branch1 = result.idxs[p1] % 12;
      const branch2 = result.idxs[p2] % 12;

      // 천간 관계
      for (const rel of this.checkStemPair(stem1, stem2)) {
        relations.push({
          ...rel,
          row: 'stem',
          p1, p2,
          cat: rel.type,
          position: `${positionLabels[p1]}-${positionLabels[p2]}간`
        });
      }

      // 지지 관계
      for (const rel of this.checkBranchPair(branch1, branch2)) {
        relations.push({
          ...rel,
          row: 'branch',
          p1, p2,
          cat: rel.type,
          position: `${positionLabels[p1]}-${positionLabels[p2]}지`
        });
      }
    }

    // 비인접 관계 (년-일, 시-월 등)
    if (positions.length >= 3) {
      for (let i = 0; i < positions.length - 2; i++) {
        const p1 = positions[i];
        const p2 = positions[i + 2];
        
        const branch1 = result.idxs[p1] % 12;
        const branch2 = result.idxs[p2] % 12;

        // 지지 관계만 검사 (충/형이 주요)
        for (const rel of this.checkBranchPair(branch1, branch2)) {
          if (['충', '형'].includes(rel.type)) {
            relations.push({
              ...rel,
              row: 'branch',
              p1, p2,
              cat: rel.type,
              position: `${positionLabels[p1]}-${positionLabels[p2]}지`
            });
          }
        }
      }
    }

    return relations;
  }

  /**
   * 삼합 검사
   */
  static checkTripleCombine(branchIndices) {
    const results = [];
    
    for (const { branches, result } of RELATIONS.TRIPLE_COMBINE) {
      const count = branches.filter(b => branchIndices.includes(b)).length;
      if (count === 3) {
        results.push({
          type: '삼합',
          desc: `${branches.map(b => JIJI[b]).join('')} 삼합(${result})`,
          result,
          complete: true
        });
      } else if (count === 2) {
        // 반합 (2개만 있는 경우)
        const present = branches.filter(b => branchIndices.includes(b));
        results.push({
          type: '반합',
          desc: `${present.map(b => JIJI[b]).join('')} 반합`,
          result,
          complete: false
        });
      }
    }
    
    return results;
  }

  /**
   * 방합 검사
   */
  static checkDirectionalCombine(branchIndices) {
    const results = [];
    
    for (const { branches, direction, result } of RELATIONS.DIRECTIONAL_COMBINE) {
      const count = branches.filter(b => branchIndices.includes(b)).length;
      if (count === 3) {
        results.push({
          type: '방합',
          desc: `${branches.map(b => JIJI[b]).join('')} ${direction}방합(${result})`,
          direction,
          result,
          complete: true
        });
      }
    }
    
    return results;
  }

  /**
   * 대운/세운과 원국 간 관계 분석
   */
  static analyzeWithFortune(fortuneIdx, originalIdxs, hasTime) {
    const fortStem = fortuneIdx % 10;
    const fortBranch = fortuneIdx % 12;
    const positions = hasTime ? ['hour', 'day', 'month', 'year'] : ['day', 'month', 'year'];
    const positionLabels = { hour: '시', day: '일', month: '월', year: '년' };
    const hits = [];

    for (const pos of positions) {
      const origStem = originalIdxs[pos] % 10;
      const origBranch = originalIdxs[pos] % 12;

      // 천간 관계
      for (const rel of this.checkStemPair(fortStem, origStem)) {
        hits.push(`${CHEONGAN[fortStem]}${CHEONGAN[origStem]}${rel.type}${rel.result ? `(${rel.result})` : ''}-${positionLabels[pos]}간`);
      }

      // 지지 관계
      for (const rel of this.checkBranchPair(fortBranch, origBranch)) {
        hits.push(`${JIJI[fortBranch]}${JIJI[origBranch]}${rel.type}${rel.result ? `(${rel.result})` : ''}-${positionLabels[pos]}지`);
      }
    }

    return hits.length ? hits.join(', ') : '없음';
  }
}

export default RelationAnalyzer;
