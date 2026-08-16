ALTER TABLE review_confirmation_events
  DROP CONSTRAINT IF EXISTS review_confirmation_events_action_check;

ALTER TABLE review_confirmation_events
  ADD CONSTRAINT review_confirmation_events_action_check CHECK (
    action IN (
      'confirm_bom_no_revision',
      'confirm_original_part_reuse',
      'return_for_replacement_part',
      'request_more_information',
      'approve_replacement_part_and_drawing_release'
    )
  );
