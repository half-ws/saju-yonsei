/**
 * 인증 서비스
 * Google 로그인 및 사용자 관리
 */

import { initializeFirebase, isFirebaseConfigured } from './firebase-config.js';

// 현재 로그인된 사용자
let currentUser = null;

// 인증 상태 변경 리스너들
const authListeners = [];

/**
 * 인증 서비스 초기화
 */
export async function initAuthService() {
  if (!isFirebaseConfigured()) {
    console.warn('Firebase가 설정되지 않았습니다. firebase-config.js 파일을 확인하세요.');
    return false;
  }

  const firebase = await initializeFirebase();
  if (!firebase) return false;

  // 인증 상태 변경 감지
  firebase.auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: user.providerData[0]?.providerId || 'google'
      };
      saveUserToFirestore(currentUser);
    } else {
      currentUser = null;
    }
    notifyAuthListeners(currentUser);
  });

  return true;
}

/**
 * Google 로그인
 */
export async function loginWithGoogle() {
  const firebase = await initializeFirebase();
  if (!firebase) {
    showAuthError('Firebase가 초기화되지 않았습니다.');
    return null;
  }

  try {
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    const result = await firebase.auth.signInWithPopup(provider);
    return result.user;
  } catch (error) {
    console.error('Google 로그인 실패:', error);
    showAuthError(getErrorMessage(error));
    return null;
  }
}

/**
 * 로그아웃
 */
export async function logout() {
  const firebase = await initializeFirebase();

  try {
    if (firebase) {
      await firebase.auth.signOut();
    }

    currentUser = null;
    localStorage.removeItem('saju_user');
    localStorage.removeItem('sns_user');
    localStorage.removeItem('db_logged_user');
    notifyAuthListeners(null);
    return true;
  } catch (error) {
    console.error('로그아웃 실패:', error);
    return false;
  }
}

/**
 * 현재 사용자 가져오기
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * 인증 상태 변경 리스너 등록
 */
export function onAuthStateChanged(callback) {
  authListeners.push(callback);
  // 현재 상태로 즉시 호출
  callback(getCurrentUser());
  return () => {
    const index = authListeners.indexOf(callback);
    if (index > -1) authListeners.splice(index, 1);
  };
}

/**
 * 사용자 정보 Firestore에 저장
 */
async function saveUserToFirestore(user) {
  const firebase = await initializeFirebase();
  if (!firebase || !user) return;

  try {
    await firebase.db.collection('users').doc(user.uid).set({
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      provider: user.provider,
      lastLogin: new Date(),
      updatedAt: new Date()
    }, { merge: true });
  } catch (error) {
    console.error('사용자 정보 저장 실패:', error);
  }
}

/**
 * 리스너들에게 알림
 */
function notifyAuthListeners(user) {
  authListeners.forEach((listener) => {
    try {
      listener(user);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}

/**
 * 에러 메시지 변환
 */
function getErrorMessage(error) {
  const messages = {
    'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
    'auth/cancelled-popup-request': '로그인이 취소되었습니다.',
    'auth/network-request-failed': '네트워크 오류가 발생했습니다.',
    'auth/user-disabled': '비활성화된 계정입니다.',
    'auth/account-exists-with-different-credential': '이미 다른 방법으로 가입된 이메일입니다.'
  };
  return messages[error.code] || error.message || '로그인에 실패했습니다.';
}

/**
 * 에러 표시
 */
function showAuthError(message) {
  if (window.__showNotification) {
    window.__showNotification(message, 'error');
  } else {
    alert(message);
  }
}
