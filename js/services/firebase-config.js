/**
 * Firebase 설정 파일
 *
 * 사용 전 Firebase Console에서 프로젝트 생성 후 설정값 입력 필요:
 * 1. https://console.firebase.google.com 접속
 * 2. 프로젝트 생성
 * 3. 웹 앱 추가
 * 4. 설정값 복사하여 아래에 붙여넣기
 * 5. Authentication > Sign-in method에서 Google 활성화
 * 6. Firestore Database 생성
 */

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyCT35ZUVMKM8V1Duc7cydUmIBk0T_OH-zE",
  authDomain: "saju-wiki.firebaseapp.com",
  projectId: "saju-wiki",
  storageBucket: "saju-wiki.firebasestorage.app",
  messagingSenderId: "846763046239",
  appId: "1:846763046239:web:4d0a7a5b3e50ce046172ea",
  measurementId: "G-WE60PK0S1X"
};

// Firebase 초기화 상태
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

/**
 * Firebase 초기화
 */
export async function initializeFirebase() {
  if (firebaseApp) return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };

  try {
    // Firebase SDK가 로드되었는지 확인
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK가 로드되지 않았습니다.');
      return null;
    }

    // 이미 초기화되었는지 확인
    if (firebase.apps.length === 0) {
      firebaseApp = firebase.initializeApp(firebaseConfig);
    } else {
      firebaseApp = firebase.apps[0];
    }

    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();

    console.log('Firebase 초기화 완료');
    return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
  } catch (error) {
    console.error('Firebase 초기화 실패:', error);
    return null;
  }
}

/**
 * Firebase 설정이 완료되었는지 확인
 */
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
}

export { firebaseConfig };
