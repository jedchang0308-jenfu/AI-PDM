-- DEV-046 Cloud SQL candidate generated from db/postgres/035_bom_draft_floating_topics.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-071: XMind-style BOM editor draft workspace and optimistic concurrency.
SET search_path = public;

ALTER TABLE public.bom_drafts
  ADD COLUMN IF NOT EXISTS editor_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.bom_draft_floating_topics (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL,
  parent_floating_topic_id TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('item', 'group')),
  item_id TEXT,
  part_number TEXT,
  revision TEXT,
  group_name TEXT,
  quantity DOUBLE PRECISION CHECK (quantity IS NULL OR quantity > 0),
  sequence_no INTEGER NOT NULL,
  root_position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  root_position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('cad_reference', 'solidworks_xls', 'manual')),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (node_type = 'item' AND part_number IS NOT NULL AND trim(part_number) <> '' AND quantity IS NOT NULL)
    OR
    (node_type = 'group' AND group_name IS NOT NULL AND trim(group_name) <> '' AND quantity IS NULL)
  ),
  FOREIGN KEY (bom_draft_id) REFERENCES public.bom_drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_floating_topic_id) REFERENCES public.bom_draft_floating_topics(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bom_draft_floating_topics_draft_parent
  ON public.bom_draft_floating_topics(bom_draft_id, parent_floating_topic_id, sequence_no);

DROP TRIGGER IF EXISTS trg_bom_draft_floating_topics_updated_at ON public.bom_draft_floating_topics;
CREATE TRIGGER trg_bom_draft_floating_topics_updated_at
BEFORE UPDATE ON public.bom_draft_floating_topics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
