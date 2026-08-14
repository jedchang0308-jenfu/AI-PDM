"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  TotpMultiFactorGenerator,
  getAuth,
  getMultiFactorResolver,
  inMemoryPersistence,
  isSignInWithEmailLink,
  setPersistence,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type Auth,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type User
} from "firebase/auth";
import type { FirebaseWebConfig } from "@/lib/auth-config";

export type FirebaseTotpChallenge = {
  auth: Auth;
  resolver: MultiFactorResolver;
  hint: MultiFactorInfo;
};

export type FirebaseSignInResult =
  | { kind: "authenticated"; user: User; auth: Auth }
  | { kind: "totp_required"; challenge: FirebaseTotpChallenge };

export class FirebaseBffExchangeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "FirebaseBffExchangeError";
  }
}

function firebaseAuth(config: FirebaseWebConfig) {
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return getAuth(app);
}

function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
}

async function prepare(config: FirebaseWebConfig) {
  const auth = firebaseAuth(config);
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}

function totpChallenge(auth: Auth, error: unknown): FirebaseTotpChallenge | null {
  if (errorCode(error) !== "auth/multi-factor-auth-required") return null;
  const resolver = getMultiFactorResolver(auth, error as Parameters<typeof getMultiFactorResolver>[1]);
  const hint = resolver.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  return hint ? { auth, resolver, hint } : null;
}

async function captureTotp(auth: Auth, operation: () => Promise<{ user: User }>): Promise<FirebaseSignInResult> {
  try {
    const credential = await operation();
    return { kind: "authenticated", user: credential.user, auth };
  } catch (error) {
    const challenge = totpChallenge(auth, error);
    if (challenge) return { kind: "totp_required", challenge };
    throw error;
  }
}

export async function signInFirebasePassword(config: FirebaseWebConfig, email: string, password: string) {
  const auth = await prepare(config);
  return captureTotp(auth, () => signInWithEmailAndPassword(auth, email, password));
}

export async function signInFirebaseGoogle(config: FirebaseWebConfig) {
  const auth = await prepare(config);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return captureTotp(auth, () => signInWithPopup(auth, provider));
}

export async function completeFirebaseTotp(challenge: FirebaseTotpChallenge, code: string) {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(challenge.hint.uid, code.trim());
  const credential = await challenge.resolver.resolveSignIn(assertion);
  return { kind: "authenticated", user: credential.user, auth: challenge.auth } as const;
}

export async function completeFirebaseEmailLinkInvitation(
  config: FirebaseWebConfig,
  email: string,
  password: string,
  actionUrl: string
) {
  const auth = await prepare(config);
  if (!isSignInWithEmailLink(auth, actionUrl)) throw new Error("FIREBASE_EMAIL_LINK_INVALID");
  const credential = await signInWithEmailLink(auth, email.trim().toLowerCase(), actionUrl);
  await updatePassword(credential.user, password);
  return { kind: "authenticated", user: credential.user, auth } as const;
}

export async function exchangeFirebaseBffSession(
  user: User,
  auth: Auth,
  input: {
    loginIntentToken?: string;
  } = {}
) {
  try {
    const idToken = await user.getIdToken(true);
    const response = await fetch("/api/auth/firebase/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken, ...input })
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    if (!response.ok) {
      throw new FirebaseBffExchangeError(body.error ?? "登入交換失敗", body.code ?? "firebase_exchange_failed", response.status);
    }
    return { kind: "authenticated" } as const;
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

export function firebaseLoginErrorMessage(error: unknown) {
  if (error instanceof FirebaseBffExchangeError) return error.message;
  switch (errorCode(error)) {
    case "auth/invalid-credential":
    case "auth/invalid-email":
    case "auth/user-disabled":
      return "電子郵件或密碼不正確，或帳號目前無法登入。";
    case "auth/popup-closed-by-user":
      return "Google 登入視窗已關閉。";
    case "auth/popup-blocked":
      return "瀏覽器已阻擋 Google 登入視窗。";
    case "auth/invalid-verification-code":
    case "auth/invalid-action-code":
      return "驗證碼不正確或已失效。";
    case "auth/expired-action-code":
      return "邀請連結已失效，請聯絡系統管理員重新邀請。";
    case "auth/too-many-requests":
      return "登入嘗試過於頻繁，請稍後再試。";
    default:
      if (error instanceof Error && error.message === "FIREBASE_EMAIL_LINK_INVALID") return "邀請連結不完整或已失效。";
      return "登入未完成，請稍後再試。";
  }
}
