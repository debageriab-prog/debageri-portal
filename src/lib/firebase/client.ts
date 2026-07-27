"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getToken,
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

let emulatorsConnected = false;
let appCheck: AppCheck | null = null;

function getAppCheck(app: ReturnType<typeof initializeApp>) {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY;
  if (!siteKey || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true")
    return null;
  appCheck ??= initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheck;
}

export function getFirebaseClient() {
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  getAppCheck(app);
  const auth = getAuth(getApp(app.name));
  const db = getFirestore(app);
  if (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
    !emulatorsConnected
  ) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8180);
    emulatorsConnected = true;
  }
  return { app, auth, db };
}

export async function appCheckFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const { app } = getFirebaseClient();
  const provider = getAppCheck(app);
  if (!provider) return fetch(input, init);
  const token = await getToken(provider);
  const headers = new Headers(init.headers);
  headers.set("X-Firebase-AppCheck", token.token);
  return fetch(input, { ...init, headers });
}
