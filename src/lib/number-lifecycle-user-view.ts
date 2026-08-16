import type { NumberLifecycleProjectionV2 } from "@/lib/number-lifecycle-simplification";

export type { NumberLifecycleProjectionV2 } from "@/lib/number-lifecycle-simplification";

function userProjection(
  stage: NumberLifecycleProjectionV2["stage"],
  reasonCode: NumberLifecycleProjectionV2["reasonCode"],
  primaryAction: NumberLifecycleProjectionV2["primaryAction"],
  exceptionKind: NumberLifecycleProjectionV2["exceptionKind"] = "none"
): NumberLifecycleProjectionV2 {
  return { stage, reasonCode, primaryAction, exceptionKind };
}

export function isNumberLifecycleAdoptionHiddenFromUser(input: NumberLifecycleProjectionV2) {
  if (["official_controlled", "history_only"].includes(input.stage)) return false;
  return input.exceptionKind === "legacy"
    || (input.exceptionKind === "recovery" && input.reasonCode === "inconsistent");
}

export function projectNumberLifecycleUserView(input: NumberLifecycleProjectionV2): NumberLifecycleProjectionV2 {
  if (!isNumberLifecycleAdoptionHiddenFromUser(input)) return input;
  return userProjection("drawing_preparation", "new_or_legacy_active", "complete_first_drawing");
}
