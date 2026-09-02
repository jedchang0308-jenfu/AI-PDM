"use client";

/** Client-safe command identity helper used by the matrix controller.  A key
 * is stable for one frozen body + expected row version and is regenerated only
 * when the logical command changes. */
export function matrixCommandFingerprint(input: { partId: string; phase: "create" | "update" | "submit"; expectedRowVersion: number; body: unknown }) {
  return `${input.partId}:${input.phase}:${input.expectedRowVersion}:${JSON.stringify(input.body)}`;
}
