export type NumberingDraftRootSummary = {
  rootCode: string;
  partNumber?: string | null;
  drawingNumber?: string | null;
  primaryDrawingNumber?: string | null;
};

function draftCompletenessScore(draft: NumberingDraftRootSummary) {
  return (draft.partNumber ? 1 : 0) + (draft.drawingNumber ?? draft.primaryDrawingNumber ? 1 : 0);
}

export function dedupeNumberingDraftsByRoot<TDraft extends NumberingDraftRootSummary>(drafts: readonly TDraft[]) {
  const byRoot = new Map<string, TDraft>();
  for (const draft of drafts) {
    const current = byRoot.get(draft.rootCode);
    if (!current) {
      byRoot.set(draft.rootCode, draft);
      continue;
    }
    if (draftCompletenessScore(draft) > draftCompletenessScore(current)) {
      byRoot.set(draft.rootCode, draft);
    }
  }
  return Array.from(byRoot.values());
}
