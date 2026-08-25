import { isDevMode } from '@angular/core';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

// Standard Firebase Web SDK config. These values identify the Firebase
// project to the browser and are not privileged secrets - see .env.example
// and scripts/generate-environment.mjs for where they come from. Real
// authorization happens server-side via Firestore Security Rules, never
// via anything in this file.
const firebaseConfig: FirebaseOptions = { ...environment.firebase };

export const firebaseConfigIsPresent = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

// No real Firebase project configured in .env.local? Fall back to the
// local emulators (see firebase.json) instead of crashing on an empty API
// key. A "demo-" project id disables the emulators' production-safety
// checks, so no real project needs to exist.
const useEmulators = isDevMode() && !firebaseConfigIsPresent;
if (useEmulators) {
  firebaseConfig.apiKey = 'demo-api-key';
  firebaseConfig.projectId = 'demo-avl-stake-tools';
  firebaseConfig.authDomain = 'localhost';
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  // Dev-only escape hatch: the app uses signInWithPopup (Google) in
  // production, which cannot be driven from automation tools. When the
  // emulator is in use, expose email/password sign-in on window so a
  // walkthrough can sign in without a popup. No-op outside dev mode.
  if (typeof window !== 'undefined') {
    (window as unknown as { __devSignIn?: unknown }).__devSignIn = (
      email: string,
      password: string,
    ) => signInWithEmailAndPassword(auth, email, password);
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters(
  // Optional Workspace/domain hint - purely a UX nicety on the Google
  // consent screen, NOT an authorization boundary. Do not rely on this for
  // security; Firestore rules + the `users` collection are the boundary.
  environment.googleAuthHd ? { hd: environment.googleAuthHd } : {},
);
