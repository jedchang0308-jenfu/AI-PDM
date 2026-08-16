# DEV-074 R33 QC summary

Status: failed and sealed; clean restart required

Mandatory clean rerun from A01 after `DEV074-R32-P1-028` was fixed and target-retested through the rendered approval UI. A–F and G02–G04 passed. G05 exposed `DEV074-R33-P1-029`: unified entity detail chose the first child under a root instead of the relation for the active drawing/part target (M03 showed P01; P06 showed M01). The run stopped and returned to RD.

RD fixed target-aware relation projection and QC target-retested it through the rendered UI: M03 now shows P03, and P06 now shows M06. R33 remains failed and sealed; acceptance requires a clean R34 restart from A01.
