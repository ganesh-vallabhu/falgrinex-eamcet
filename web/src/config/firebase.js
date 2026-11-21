import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const DEFAULT_FB_CONFIG = {
  apiKey: 'AIzaSyAxLPkg7bFvDjvV6gs246g9elE_sl8N3b0',
  authDomain: 'eamcet-ace.firebaseapp.com',
  projectId: 'eamcet-ace',
  storageBucket: 'eamcet-ace.firebasestorage.app',
  messagingSenderId: '551124054269',
  appId: '1:551124054269:web:f47ae0d2228ab1a4760e94',
  measurementId: 'G-RW0B1KEQT4',
};

function savedConfig() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem('eamcet_fb_config') || 'null');
    return parsed?.apiKey ? parsed : {};
  } catch {
    return {};
  }
}

function envConfig() {
  const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
  const result = {};
  for (const key of keys) {
    const value = import.meta.env[`VITE_FIREBASE_${key.toUpperCase()}`];
    if (value) result[key] = value;
  }
  return result;
}

export const firebaseConfig = { ...DEFAULT_FB_CONFIG, ...envConfig(), ...savedConfig() };

export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}

export function resetSavedConfig() {
  try {
    globalThis.localStorage?.removeItem('eamcet_fb_config');
  } catch {
    return;
  }
}

export function persistConfig(config) {
  try {
    globalThis.localStorage?.setItem('eamcet_fb_config', JSON.stringify(config));
  } catch {
    return;
  }
}
