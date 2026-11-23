"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchCurrentPdmUser } from "@/lib/pdm-current-user-client";
import { subscribePdmPermissionInvalidation } from "@/lib/pdm-permission-client";
import { readLocalDraft, writeLocalDraft, removeLocalDraft, type DraftFields, type LocalDraft } from "@/lib/pdm-local-draft";

/** Explicit recovery only; all authoritative data/version/token still comes from a fresh server read. */
export function usePdmLocalDraft({ record, version, fields, savedFields, labels = {}, dirty, enabled = true, apply, reset }: {
  record: string; version: string; fields: DraftFields; dirty: boolean; enabled?: boolean;
  savedFields?: DraftFields;
  labels?: Record<string, string>;
  apply: (fields: DraftFields) => void; reset: () => void;
}) {
  const [owner, setOwner] = useState<string | null>(null);
  const [pending, setPending] = useState<LocalDraft | null>(null);
  const [notice, setNotice] = useState("");
  const [invalidated, setInvalidated] = useState(false);
  const valid = useRef(true);
  const slot = useRef<{ record: string; owner: string; version: string; draft: LocalDraft | null } | null>(null);
  const callbacks = useRef({ apply, reset });
  const activeVersion = useRef(version);
  useLayoutEffect(() => { callbacks.current = { apply, reset }; activeVersion.current = version; });
  const isCurrent = useCallback(() => valid.current, []);
  useEffect(() => {
    const unsubscribe = subscribePdmPermissionInvalidation(() => {
      valid.current = false; setOwner(null); slot.current = null; setPending(null); setInvalidated(true);
      setNotice("身分或權限已變更，請重新開啟表單。"); callbacks.current.reset();
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!enabled || owner || invalidated) return;
    let active = true;
    void fetchCurrentPdmUser().then(async response => {
      if (!response.ok) { if (active) setNotice("目前無法確認本機草稿身分。"); return; }
      const body = await response.json();
      const principal = body.session?.principalId, company = body.session?.companyId, user = body.user?.id;
      if (active && valid.current && typeof principal === "string" && typeof company === "string" && typeof user === "string") setOwner(JSON.stringify([principal, company, user]));
    }).catch(() => { if (active) setNotice("目前無法確認本機草稿身分。"); });
    return () => { active = false; };
  }, [enabled, owner, invalidated]);
  const serialized = JSON.stringify(fields);
  const savedSerialized = savedFields ? JSON.stringify(savedFields) : null;
  useEffect(() => {
    if (!enabled || invalidated) return;
    if (!owner) { if (dirty) setNotice("正在確認草稿身分，請稍候再離開。"); return; }
    let storage: Storage;
    try { storage = window.localStorage; } catch { setNotice("無法保留本機草稿，請先儲存或複製文字。"); return; }
    if (slot.current?.record !== record || slot.current.owner !== owner || slot.current.version !== version) {
      let draft = readLocalDraft(storage, owner, record);
      if (draft && savedSerialized === JSON.stringify(draft.fields)) {
        try { removeLocalDraft(storage, draft); } catch { /* safe to keep a redundant copy */ }
        draft = null;
      }
      slot.current = { owner, record, version, draft };
      setPending(draft);
      if (draft) return; // Do not overwrite a recoverable draft with freshly loaded server fields.
    }
    if (pending) return;
    if (!dirty && savedSerialized && slot.current.draft && savedSerialized === JSON.stringify(slot.current.draft.fields)) {
      try { removeLocalDraft(storage, slot.current.draft); } catch { /* retain a redundant copy */ }
      slot.current.draft = null; setNotice("");
    }
    if (!dirty) return;
    const fields = JSON.parse(serialized) as DraftFields;
    const draft: LocalDraft = { schema: 1, owner, record, version, fields, savedAt: Date.now(), revision: crypto.randomUUID() };
    try {
      if (!writeLocalDraft(storage, draft, slot.current.draft?.revision ?? null)) {
        setPending(readLocalDraft(storage, owner, record));
        setNotice("另一個分頁已更新本機草稿，請先核對。"); return;
      }
      slot.current.draft = draft;
      setNotice("已保留本機草稿，尚未儲存至伺服器。");
    } catch { setNotice("無法保留本機草稿，請先儲存或複製文字。"); }
  }, [enabled, owner, invalidated, record, version, serialized, savedSerialized, dirty, pending]);
  function discard() {
    if (pending) try { removeLocalDraft(window.localStorage, pending); } catch { /* unavailable storage */ }
    if (slot.current) slot.current.draft = null;
    setPending(null); setNotice("");
  }
  return {
    invalidated,
    isCurrent,
    clear() {
      const draft = slot.current?.draft;
      if (draft) try { removeLocalDraft(window.localStorage, draft); } catch { /* server success remains authoritative */ }
      if (slot.current) slot.current.draft = null;
      setPending(null); setNotice("");
    },
    feedback: !enabled && !invalidated ? null : pending && pending.owner === owner && pending.record === record ? <div role="status" className="dev079-workspace-notice">
      <span>{pending.version === version ? "發現未儲存的本機草稿。" : "伺服器版本已變更，本機草稿僅供比對。"}</span>
      {pending.version === version ? <button type="button" className="secondary-button" onClick={() => {
        // Recheck at the click, not merely at render time.
        if (!owner || invalidated || pending.owner !== owner || pending.record !== record || pending.version !== activeVersion.current) return;
        try {
          const latest = readLocalDraft(window.localStorage, owner, record);
          if (latest?.revision !== pending.revision) { setPending(latest); setNotice("本機草稿已由另一個分頁變更，請重新核對。"); return; }
        } catch { setNotice("無法讀取本機草稿。"); return; }
        callbacks.current.apply(pending.fields); setPending(null); setNotice("已恢復本機草稿，尚未儲存至伺服器。");
      }}>恢復草稿</button> : <details><summary>檢視本機文字</summary><pre style={{ whiteSpace: "pre-wrap" }}>{Object.entries(pending.fields).map(([k, v]) => `${labels[k] ?? k}: ${v}`).join("\n")}</pre></details>}
      <button type="button" className="secondary-button" onClick={discard}>捨棄草稿</button>
    </div> : notice ? <p role="status">{notice}</p> : null,
  };
}
