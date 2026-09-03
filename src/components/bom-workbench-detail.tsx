"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BomStructuredEditor } from "@/components/bom-editor/bom-structured-editor";
import type { BomEditorDraftLike } from "@/components/bom-editor/bom-editor-types";
import type { BomWorkbenchDraftDetail, BomWorkbenchListRecord } from "@/lib/types";

type DraftResponse = {
  draft: BomWorkbenchDraftDetail;
  editorCapability?: { enabled?: boolean };
  salesKitCapability?: { enabled?: boolean };
  accessCapability?: { releasedReadOnly?: boolean };
};

export function BomWorkbenchDetail({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<BomWorkbenchDraftDetail | null>(null);
  const [record, setRecord] = useState<BomWorkbenchListRecord | null>(null);
  const [editorEnabled, setEditorEnabled] = useState(false);
  const [salesKitEnabled, setSalesKitEnabled] = useState(true);
  const [releasedReadOnly, setReleasedReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestJson = useCallback(async <T,>(url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
    });
    const body = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
    if (!response.ok) throw new Error(String(body.message ?? body.error ?? `HTTP ${response.status}`));
    return body;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const contextParentPartNumberId = new URLSearchParams(window.location.search).get("parentPartNumberId");
      const detailQuery = contextParentPartNumberId ? `?parentPartNumberId=${encodeURIComponent(contextParentPartNumberId)}` : "";
      const [detailBody, listBody] = await Promise.all([
        requestJson<DraftResponse>(`/api/bom/drafts/${encodeURIComponent(draftId)}${detailQuery}`),
        requestJson<{ drafts: BomWorkbenchListRecord[] }>(`/api/bom/drafts?surface=work_list`)
      ]);
      const nextDraft = detailBody.draft;
      setDraft(nextDraft);
      setEditorEnabled(Boolean(detailBody.editorCapability?.enabled));
      setSalesKitEnabled(detailBody.salesKitCapability?.enabled !== false);
      setReleasedReadOnly(Boolean(detailBody.accessCapability?.releasedReadOnly));
      setRecord((listBody.drafts ?? []).find((candidate) => candidate.id === draftId) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "載入 BOM 明細失敗");
    } finally {
      setLoading(false);
    }
  }, [draftId, requestJson]);

  useEffect(() => { void load(); }, [load]);

  const runLifecycle = useCallback(async (path: string, body?: Record<string, unknown>) => {
    await requestJson(`/api/bom/drafts/${encodeURIComponent(draftId)}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
    await load();
  }, [draftId, load, requestJson]);

  const clone = useCallback(async () => {
    if (!draft) return;
    if (draft.definition_id) {
      const contextPartNumberId = draft.context_parent_part_number_id ?? draft.applicable_parents?.[0]?.part_number_id;
      if (!contextPartNumberId) throw new Error("BOM_CONTEXT_PARENT_REQUIRED");
      const candidates = await requestJson<{ baseReleaseSnapshotId: string | null; suggestedBomRevision: string; selectionEtag: string; candidates: Array<{ partNumberId: string; selected: boolean }> }>(`/api/bom/applicability-candidates?contextPartNumberId=${encodeURIComponent(contextPartNumberId)}&purpose=${encodeURIComponent(draft.bom_purpose)}`);
      const created = await requestJson<{ workbenchUrl: string; draft: BomWorkbenchDraftDetail }>("/api/bom/drafts", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID(), "if-match": candidates.selectionEtag },
        body: JSON.stringify({ contextPartNumberId, bomPurpose: draft.bom_purpose, applicableParentPartNumberIds: candidates.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.partNumberId), bomRevision: candidates.suggestedBomRevision, source: "manual", baseReleaseSnapshotId: candidates.baseReleaseSnapshotId })
      });
      router.push(created.workbenchUrl);
      return;
    }
    if (!draft.owner_part_number_id) throw new Error("BOM_OWNER_REQUIRED");
    const nextRevision = nextCloneRevision(draft.bom_revision ?? draft.parent_revision);
    const created = await requestJson<{ draft: BomWorkbenchDraftDetail }>("/api/bom/drafts", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ ownerPartNumberId: draft.owner_part_number_id, bomRevision: nextRevision, source: "manual", draftName: `${record?.parent_part_number ?? draft.draft_name} BOM Rev ${nextRevision}` })
    });
    const idMap = new Map(draft.lines.map((line) => [line.id, crypto.randomUUID()]));
    const floatingIdMap = new Map((draft.floating_topics ?? []).map((topic) => [topic.id, crypto.randomUUID()]));
    const patched = await requestJson<{ draft: BomWorkbenchDraftDetail }>(`/api/bom/drafts/${encodeURIComponent(created.draft.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        reason: `Clone from ${draft.id}`,
        expectedEditorVersion: created.draft.editor_version,
        lines: draft.lines.map((line) => ({ id: idMap.get(line.id), logicalLineId: line.logical_line_id, parentLineId: line.parent_line_id ? idMap.get(line.parent_line_id) ?? null : null, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity, sequenceNo: line.sequence_no })),
        floatingTopics: (draft.floating_topics ?? []).map((topic) => ({ id: floatingIdMap.get(topic.id), logicalLineId: topic.logical_line_id, parentFloatingTopicId: topic.parent_floating_topic_id ? floatingIdMap.get(topic.parent_floating_topic_id) ?? null : null, nodeType: topic.node_type, partNumber: topic.part_number, revision: topic.revision, groupName: topic.group_name, quantity: topic.quantity, sequenceNo: topic.sequence_no, rootPositionX: topic.root_position_x, rootPositionY: topic.root_position_y }))
      })
    });
    router.push(`/bom/workbench/${encodeURIComponent(patched.draft.id)}`);
  }, [draft, record?.parent_part_number, requestJson, router]);

  const editorDraft = useMemo(() => draft as unknown as BomEditorDraftLike, [draft]);
  if (loading && !draft) return <main className="bom-workbench-page"><div className="empty">正在載入 BOM 明細...</div></main>;
  if (error && !draft) return <main className="bom-workbench-page"><div className="bom-workbench-alert error" role="alert">{error}</div></main>;
  if (!draft) return null;
  const salesKitReadOnly = draft.bom_purpose === "sales_kit" && !salesKitEnabled;

  return (
    <main className="bom-workbench-page bom-workbench-detail-page">
      <BomStructuredEditor
        draft={editorDraft}
        rootPartNumber={record?.parent_part_number ?? draft.draft_name}
        rootPartName={record?.parent_part_name ?? ""}
        editorEnabled={editorEnabled && !salesKitReadOnly}
        releasedReadOnly={releasedReadOnly}
        readOnlyMessage={salesKitReadOnly ? "非製造 BOM 功能目前關閉；此版本僅供檢視。" : undefined}
        onReload={() => void load()}
        onSaved={(nextDraft) => setDraft(nextDraft as unknown as BomWorkbenchDraftDetail)}
        onSubmitReview={salesKitReadOnly ? undefined : (reason) => runLifecycle("submit-review", { changeReason: reason })}
        onReconfirmReplacementFlags={salesKitReadOnly ? undefined : () => runLifecycle("reconfirm-replacements", { note: "BOM owner confirmed replaced-part usage before review" })}
        onRequestObsolete={salesKitReadOnly ? undefined : (reason) => runLifecycle("obsolete-request", { reason })}
        onClone={salesKitReadOnly ? undefined : clone}
        onDelete={salesKitReadOnly ? undefined : async () => { await runLifecycle("delete", { reason: "BOM Workbench UI delete" }); router.replace("/bom/workbench"); }}
        onRestore={salesKitReadOnly ? undefined : () => runLifecycle("restore", { reason: "BOM Workbench UI restore" })}
        onSetActive={salesKitReadOnly ? undefined : () => runLifecycle("active")}
      />
    </main>
  );
}

function nextCloneRevision(value: string | null | undefined) {
  const match = String(value ?? "0").match(/^(.*?)(\d+)$/);
  if (!match) return "1";
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}
