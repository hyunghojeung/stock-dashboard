/**
 * KIS API 크레덴셜 암호화 모듈
 * Web Crypto API (AES-GCM 256bit) 사용
 *
 * - 브라우저 내장 Web Crypto API 사용 (외부 의존성 없음)
 * - AES-GCM: 인증된 암호화 (무결성 + 기밀성)
 * - 디바이스별 고유 키 자동 생성 (localStorage에 저장)
 * - app_key, app_secret, access_token 등 민감 필드만 암호화
 */

const CRYPTO_KEY_STORAGE = "__kis_dk__";
const SENSITIVE_FIELDS = ["app_key", "app_secret", "access_token"];

// 디바이스 키 생성/로드 (AES-GCM 256bit)
async function getOrCreateDeviceKey() {
  try {
    const stored = localStorage.getItem(CRYPTO_KEY_STORAGE);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    }
    // 새 키 생성
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exported = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(CRYPTO_KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(exported))));
    return key;
  } catch (e) {
    console.warn("[KIS Crypto] Device key error:", e.message);
    return null;
  }
}

// AES-GCM 암호화
async function encryptValue(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  // iv + ciphertext를 base64로 결합
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// AES-GCM 복호화
async function decryptValue(key, encrypted) {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/**
 * 크레덴셜 암호화 후 저장용 객체 반환
 * 민감 필드만 암호화, 나머지(is_virtual, account_no 앞부분 등)는 평문
 */
export async function encryptCredentials(creds) {
  const key = await getOrCreateDeviceKey();
  if (!key) return creds; // fallback: 암호화 실패 시 평문

  const encrypted = { ...creds, __encrypted__: true };
  for (const field of SENSITIVE_FIELDS) {
    if (creds[field]) {
      encrypted[field] = await encryptValue(key, creds[field]);
    }
  }
  // account_no도 암호화
  if (creds.account_no) {
    encrypted.account_no = await encryptValue(key, creds.account_no);
  }
  return encrypted;
}

/**
 * 암호화된 크레덴셜을 복호화
 */
export async function decryptCredentials(stored) {
  if (!stored || !stored.__encrypted__) return stored; // 평문 데이터 호환

  const key = await getOrCreateDeviceKey();
  if (!key) return {}; // 키 없으면 복호화 불가

  try {
    const decrypted = { ...stored };
    delete decrypted.__encrypted__;
    for (const field of SENSITIVE_FIELDS) {
      if (stored[field]) {
        decrypted[field] = await decryptValue(key, stored[field]);
      }
    }
    if (stored.account_no) {
      decrypted.account_no = await decryptValue(key, stored.account_no);
    }
    return decrypted;
  } catch (e) {
    console.warn("[KIS Crypto] Decryption failed:", e.message);
    return {};
  }
}
