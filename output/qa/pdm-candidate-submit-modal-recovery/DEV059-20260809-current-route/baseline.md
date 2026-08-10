# DEV-059 baseline

The user screenshot showed the candidate bundle confirmation modal visually present but not dismissible. The drawer already contained A0006.SLDPRT and A0006-M01.SLDDRW with finalized evidence; this was not a missing-file state.

The dynamic reproduction showed that the entity drawer's document-level outside-click `pointerdown` handler intercepted the modal interaction before the React delegated click handler.
