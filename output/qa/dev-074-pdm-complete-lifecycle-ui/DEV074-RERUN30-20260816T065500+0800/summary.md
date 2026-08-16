# DEV-074 R30 QC summary

Status: failed at E07; RD repair and targeted rendered-UI retest passed.

R30 stopped with 39 Pass, 1 Fail, 18 Not Run. Defect `DEV074-R30-P1-026` prevented Manufacturing and Procurement from reading Released BOMs. The targeted UI retest passed after permission-boundary repair, but R30 remains failed and cannot be converted into a clean run. R31 is the mandatory full 58-path rerun from A01.
