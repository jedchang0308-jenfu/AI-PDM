# DEV-125 OpenSWX provider retirement

DEV-125 removed every OpenSWX worker declaration from this Terraform root.
The fixed backend and provider constraint remain temporarily so an exact saved
plan can delete the twelve state-owned OpenSWX resources.

Apply is allowed only after all of the following are true:

- the OpenSWX scheduler is paused and the Job has no active execution;
- the production cleanup receipt reports zero remaining active rows;
- the Job deletion-protection readback is false;
- the saved plan contains exactly twelve delete actions and no other action.

After provider readback proves the state and resources are absent, this
transitional root is removed. Do not add a replacement worker here.
