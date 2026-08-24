export type BomEditorViewMode = "map" | "outliner";
export type BomDropZone = "before" | "child" | "after";

export type BomEditorNodeType = "item" | "group";
export type BomEditorSource = "manual";

export type BomEditorLine = {
  id: string;
  logical_line_id?: string | null;
  bom_draft_id: string;
  parent_line_id: string | null;
  node_type: BomEditorNodeType;
  item_id: string | null;
  part_number: string | null;
  part_name?: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | null;
  sequence_no: number;
  source: BomEditorSource;
  source_priority: number;
};

export type BomEditorFloatingTopic = {
  id: string;
  logical_line_id?: string | null;
  bom_draft_id: string;
  parent_floating_topic_id: string | null;
  node_type: BomEditorNodeType;
  item_id: string | null;
  part_number: string | null;
  part_name?: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | null;
  sequence_no: number;
  root_position_x: number;
  root_position_y: number;
  source: BomEditorSource;
};

export type BomEditorSnapshot = {
  lines: BomEditorLine[];
  floatingTopics: BomEditorFloatingTopic[];
  components: BomEditorSharedComponent[];
  selectedId: string | null;
  collapsedIds: string[];
  focusBranchId: string | null;
};

export type BomEditorDraftLike = {
  id: string;
  definition_id?: string | null;
  status: string;
  identity_authority?: "canonical_part_number" | "legacy_submission_bound" | "manual_review";
  is_active?: number;
  editor_version?: number;
  lines: BomEditorLine[];
  floating_topics?: BomEditorFloatingTopic[];
  applicable_parents?: BomEditorApplicableParent[];
  components?: BomEditorSharedComponent[];
  unresolved_mappings?: Array<{ logical_line_id: string; parent_part_number_id: string }>;
  context_parent_part_number_id?: string | null;
  bom_revision?: string | null;
  parent_revision?: string | null;
  draft_name: string;
  release_snapshot_id?: string | null;
  reconfirmation_flags?: Array<{
    id: string;
    old_part_number: string;
    new_part_number: string;
    reason: string;
  }>;
  latest_review?: {
    status: string;
    change_reason: string;
    decision_reason: string | null;
    submitted_at: string;
    reviewed_at: string | null;
  } | null;
};

export type BomEditorItemCandidate = {
  id: string;
  item_id: string;
  part_number_id?: string;
  part_root_id?: string;
  part_number: string;
  part_name: string;
  revision: string;
};

export type BomEditorApplicableParent = {
  part_number_id: string;
  part_number: string;
  part_name: string;
  selection_order: number;
};

export type BomEditorSharedComponent = {
  node_id: string;
  logical_line_id: string;
  node_location: "tree" | "floating";
  component_mode: "fixed" | "by_parent";
  child_part_root_id: string;
  child_part_number_ids: string[];
  child_candidates?: Array<{ part_number_id: string; part_number: string; part_name: string; part_root_id: string }>;
  parent_selections: Array<{ parent_part_number_id: string; child_part_number_id: string }>;
};

export const BOM_EDITOR_ROOT_ID = "__bom_editor_root__";

export function cloneBomEditorSnapshot(snapshot: BomEditorSnapshot): BomEditorSnapshot {
  return {
    ...snapshot,
    lines: snapshot.lines.map((line) => ({ ...line })),
    floatingTopics: snapshot.floatingTopics.map((topic) => ({ ...topic })),
    components: snapshot.components.map((component) => ({
      ...component,
      child_part_number_ids: [...component.child_part_number_ids],
      child_candidates: component.child_candidates?.map((candidate) => ({ ...candidate })),
      parent_selections: component.parent_selections.map((selection) => ({ ...selection }))
    })),
    collapsedIds: [...snapshot.collapsedIds]
  };
}
