/**
 * 사용자 데이터 서비스
 * 사주 명식 저장, 인물위키 기록, 방명록 관리
 */

import { initializeFirebase, isFirebaseConfigured } from './firebase-config.js';
import { getCurrentUser } from './auth-service.js';

/**
 * ================================
 * 사주 명식 저장 관련
 * ================================
 */

/**
 * 사주 명식 저장
 */
export async function saveSajuData(sajuData) {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const firebase = await initializeFirebase();
  if (!firebase) {
    // Firebase 미설정시 로컬 스토리지 사용
    return saveToLocalStorage('saju_data', sajuData, user.uid);
  }

  try {
    const docRef = await firebase.db
      .collection('users')
      .doc(user.uid)
      .collection('savedSaju')
      .add({
        ...sajuData,
        createdAt: new Date(),
        updatedAt: new Date()
      });

    return docRef.id;
  } catch (error) {
    console.error('사주 저장 실패:', error);
    throw error;
  }
}

/**
 * 저장된 사주 목록 가져오기
 */
export async function getSavedSajuList() {
  const user = getCurrentUser();
  if (!user) return [];

  const firebase = await initializeFirebase();
  if (!firebase) {
    return getFromLocalStorage('saju_data', user.uid);
  }

  try {
    const snapshot = await firebase.db
      .collection('users')
      .doc(user.uid)
      .collection('savedSaju')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('사주 목록 로드 실패:', error);
    return [];
  }
}

/**
 * 저장된 사주 삭제
 */
export async function deleteSavedSaju(sajuId) {
  const user = getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const firebase = await initializeFirebase();
  if (!firebase) {
    return deleteFromLocalStorage('saju_data', sajuId, user.uid);
  }

  try {
    await firebase.db
      .collection('users')
      .doc(user.uid)
      .collection('savedSaju')
      .doc(sajuId)
      .delete();

    return true;
  } catch (error) {
    console.error('사주 삭제 실패:', error);
    throw error;
  }
}

/**
 * ================================
 * 인물위키 관련
 * ================================
 */

/**
 * 인물 추가 (작성자 기록 포함)
 */
export async function addPerson(personData) {
  const user = getCurrentUser();

  const firebase = await initializeFirebase();
  if (!firebase) {
    // Firebase 미설정시 기존 방식 사용
    return null;
  }

  try {
    const docRef = await firebase.db.collection('persons').add({
      ...personData,
      createdBy: user ? {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email
      } : { uid: 'anonymous', displayName: '익명' },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 활동 로그 기록
    if (user) {
      await logActivity('person_add', {
        personId: docRef.id,
        personName: personData.name
      });
    }

    return docRef.id;
  } catch (error) {
    console.error('인물 추가 실패:', error);
    throw error;
  }
}

/**
 * 인물 수정 (수정자 기록 포함)
 */
export async function updatePerson(personId, personData) {
  const user = getCurrentUser();

  const firebase = await initializeFirebase();
  if (!firebase) return null;

  try {
    await firebase.db.collection('persons').doc(personId).update({
      ...personData,
      updatedBy: user ? {
        uid: user.uid,
        displayName: user.displayName
      } : { uid: 'anonymous', displayName: '익명' },
      updatedAt: new Date()
    });

    // 활동 로그 기록
    if (user) {
      await logActivity('person_edit', {
        personId,
        personName: personData.name
      });
    }

    return true;
  } catch (error) {
    console.error('인물 수정 실패:', error);
    throw error;
  }
}

/**
 * ================================
 * 방명록 관련
 * ================================
 */

/**
 * 방명록 글 작성
 */
export async function addGuestbookEntry(content) {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const firebase = await initializeFirebase();
  if (!firebase) {
    // Firebase 미설정시 로컬 스토리지
    return saveGuestbookLocal(content, user);
  }

  try {
    const docRef = await firebase.db.collection('guestbook').add({
      content,
      author: {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: user.provider
      },
      createdAt: new Date(),
      likes: 0,
      reports: 0
    });

    return docRef.id;
  } catch (error) {
    console.error('방명록 작성 실패:', error);
    throw error;
  }
}

/**
 * 방명록 목록 가져오기
 */
export async function getGuestbookEntries(limit = 50) {
  const firebase = await initializeFirebase();
  if (!firebase) {
    return getGuestbookLocal();
  }

  try {
    const snapshot = await firebase.db
      .collection('guestbook')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }));
  } catch (error) {
    console.error('방명록 로드 실패:', error);
    return [];
  }
}

/**
 * 방명록 글 삭제 (본인만 가능)
 */
export async function deleteGuestbookEntry(entryId) {
  const user = getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const firebase = await initializeFirebase();
  if (!firebase) return false;

  try {
    const doc = await firebase.db.collection('guestbook').doc(entryId).get();
    if (!doc.exists) throw new Error('글을 찾을 수 없습니다.');

    const data = doc.data();
    if (data.author?.uid !== user.uid) {
      throw new Error('본인의 글만 삭제할 수 있습니다.');
    }

    await firebase.db.collection('guestbook').doc(entryId).delete();
    return true;
  } catch (error) {
    console.error('방명록 삭제 실패:', error);
    throw error;
  }
}

/**
 * ================================
 * 활동 로그
 * ================================
 */

/**
 * 활동 로그 기록
 */
async function logActivity(action, details) {
  const user = getCurrentUser();
  if (!user) return;

  const firebase = await initializeFirebase();
  if (!firebase) return;

  try {
    await firebase.db.collection('activityLogs').add({
      userId: user.uid,
      userDisplayName: user.displayName,
      userEmail: user.email,
      action,
      details,
      timestamp: new Date(),
      userAgent: navigator.userAgent
    });
  } catch (error) {
    console.error('활동 로그 기록 실패:', error);
  }
}

/**
 * ================================
 * 로컬 스토리지 폴백
 * ================================
 */

function saveToLocalStorage(key, data, userId) {
  const storageKey = `${key}_${userId}`;
  const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const newItem = {
    id: Date.now().toString(),
    ...data,
    createdAt: new Date().toISOString()
  };
  existing.unshift(newItem);
  localStorage.setItem(storageKey, JSON.stringify(existing.slice(0, 100))); // 최대 100개
  return newItem.id;
}

function getFromLocalStorage(key, userId) {
  const storageKey = `${key}_${userId}`;
  return JSON.parse(localStorage.getItem(storageKey) || '[]');
}

function deleteFromLocalStorage(key, itemId, userId) {
  const storageKey = `${key}_${userId}`;
  const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const filtered = existing.filter((item) => item.id !== itemId);
  localStorage.setItem(storageKey, JSON.stringify(filtered));
  return true;
}

function saveGuestbookLocal(content, user) {
  const existing = JSON.parse(localStorage.getItem('guestbook_entries') || '[]');
  const newEntry = {
    id: Date.now().toString(),
    content,
    author: {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL
    },
    createdAt: new Date().toISOString()
  };
  existing.unshift(newEntry);
  localStorage.setItem('guestbook_entries', JSON.stringify(existing.slice(0, 200)));
  return newEntry.id;
}

function getGuestbookLocal() {
  return JSON.parse(localStorage.getItem('guestbook_entries') || '[]');
}
