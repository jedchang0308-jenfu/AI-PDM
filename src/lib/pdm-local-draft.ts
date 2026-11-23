/** Small text-form recovery store. Never put files, identities' credentials or command tokens here. */
export type DraftFields = Record<string, string | boolean>;
export type LocalDraft = { schema: 1; owner: string; record: string; version: string; savedAt: number; revision: string; fields: DraftFields };
const prefix = "ai-pdm:text-draft:v1:";
const lifetime = 7 * 24 * 60 * 60 * 1000;
export function draftKey(owner: string, record: string) { return prefix + encodeURIComponent(JSON.stringify([owner, record])); }
export function readLocalDraft(storage: Storage, owner: string, record: string, now = Date.now()): LocalDraft | null {
  try {
    const raw = storage.getItem(draftKey(owner, record));
    if (!raw || raw.length > 100_000) return null;
    const d = JSON.parse(raw) as LocalDraft;
    if (d.schema !== 1 || d.owner !== owner || d.record !== record || typeof d.version !== "string"
      || typeof d.revision !== "string" || !Number.isFinite(d.savedAt) || d.savedAt > now || now - d.savedAt >= lifetime
      || !d.fields || Array.isArray(d.fields) || typeof d.fields !== "object"
      || Object.values(d.fields).some(v => typeof v !== "string" && typeof v !== "boolean")) return null;
    return d;
  } catch { return null; }
}
export function writeLocalDraft(storage: Storage, draft: LocalDraft, expectedRevision: string | null) {
  const current = readLocalDraft(storage, draft.owner, draft.record);
  if ((current?.revision ?? null) !== expectedRevision) return false;
  const value = JSON.stringify(draft);
  if (value.length > 100_000) throw new Error("DRAFT_TOO_LARGE");
  // Bound only our own recovery slots. Never clear unrelated browser storage.
  let keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => Boolean(k?.startsWith(prefix)));
  for (const key of keys) {
    try {
      const value = JSON.parse(storage.getItem(key)!);
      if (value?.schema === 1 && Number.isFinite(value.savedAt) && Date.now() - value.savedAt >= lifetime) storage.removeItem(key);
    } catch { /* leave unknown/corrupt slots untouched */ }
  }
  keys = keys.filter(key => storage.getItem(key) !== null);
  if (keys.length >= 20 && !keys.includes(draftKey(draft.owner, draft.record))) {
    throw new Error("DRAFT_LIMIT");
  }
  storage.setItem(draftKey(draft.owner, draft.record), value);
  return true;
}
export function removeLocalDraft(storage: Storage, draft: LocalDraft) {
  if (readLocalDraft(storage, draft.owner, draft.record)?.revision === draft.revision) storage.removeItem(draftKey(draft.owner, draft.record));
}
