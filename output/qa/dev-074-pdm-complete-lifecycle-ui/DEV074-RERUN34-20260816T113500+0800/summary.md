# DEV-074 R34 QC summary

Status: failed and sealed; clean restart required

R34 passed A01-C08 and D01-D08. D09 exposed `DEV074-R34-P1-030`: after withdrawal, re-selecting the identical retained 2D/3D files succeeded visibly but returned two HTTP 409 responses and two browser console errors in a positive journey.

RD changed same-revision reuse to verify SHA-256, size, revision, role and filename. An exact match now returns HTTP 200 with the existing controlled attachment; a same-name file with changed bytes remains a conflict. QC target-retested the rendered UI in a fresh browser context: both identical files returned 200, stayed visible under revision 0.5, and console errors were zero.

R34 remains failed and sealed. Final acceptance requires a clean R35 restart from A01.
