-- DEV-046 Cloud SQL candidate generated from db/postgres/050_drawing_recognition_part_owner_invariant.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-079 CAPA: accepted Part-domain recognition rows must have one valid
-- same-company owner belonging to the exact Drawing work.

CREATE TABLE IF NOT EXISTS public.drawing_recognition_owner_reconciliations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('sqlite', 'postgres')),
  plan_hash TEXT NOT NULL,
  target_fingerprint_before TEXT NOT NULL,
  target_fingerprint_after TEXT NOT NULL,
  request_fingerprint_before TEXT NOT NULL,
  request_fingerprint_after TEXT NOT NULL,
  manifest_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.dev079_reject_reconciliation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'drawing_recognition_owner_reconciliations_append_only';
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_recognition_owner_reconciliations_no_mutation ON public.drawing_recognition_owner_reconciliations;
CREATE TRIGGER trg_drawing_recognition_owner_reconciliations_no_mutation
BEFORE UPDATE OR DELETE ON public.drawing_recognition_owner_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.dev079_reject_reconciliation_mutation();

CREATE OR REPLACE FUNCTION public.dev079_enforce_recognition_part_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.proposed_owner_type = 'part_number'
     AND NEW.review_state IN ('accepted', 'corrected', 'mapped')
     AND btrim(coalesce(NEW.proposed_value, '')) <> ''
     AND (
       btrim(coalesce(NEW.proposed_owner_id, '')) = ''
       OR NOT (
         EXISTS (
           SELECT 1
           FROM public.drawing_recognition_sessions session
           JOIN public.drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
           JOIN public.drawing_part_links link ON link.drawing_number_id = drawing.formal_drawing_number_id
           JOIN public.part_numbers part ON part.id = link.part_number_id AND part.company_id = session.company_id
           WHERE session.id = NEW.session_id AND session.company_id = NEW.company_id
             AND part.id = NEW.proposed_owner_id
             AND part.record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
         )
         OR EXISTS (
           SELECT 1
           FROM public.drawing_recognition_sessions session
           JOIN public.drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
           JOIN public.numbering_draft_parts draft ON draft.id = NEW.proposed_owner_id
             AND draft.workspace_id = drawing.workspace_id AND draft.company_id = session.company_id
           JOIN public.number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
             AND reservation.company_id = session.company_id AND reservation.reservation_state = 'active'
           WHERE session.id = NEW.session_id AND session.company_id = NEW.company_id
         )
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RECOGNITION_PART_OWNER_INVARIANT';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drawing_recognition_part_owner ON public.drawing_recognition_candidates;
CREATE TRIGGER trg_drawing_recognition_part_owner
BEFORE INSERT OR UPDATE ON public.drawing_recognition_candidates
FOR EACH ROW EXECUTE FUNCTION public.dev079_enforce_recognition_part_owner();
