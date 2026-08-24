/** Shared identity types retained by review/file authorization. Drawer and
 * editor payloads live in their typed canonical domain contracts. */
export type PdmEntityKey = `candidate:${string}` | `drawing:${string}` | `part:${string}` | `root:${string}`;
export type PdmDetailSurface = "drawing" | "part" | "relation";

export type DrawingPreviewState = "queued" | "running" | "ready" | "delayed" | "failed" | "unavailable" | "missing";
export type DrawingPreviewSlotModel = {
  kind: "three-d" | "two-d";
  title: string;
  fileName: string | null;
  state: DrawingPreviewState;
  stateTitle: string;
  stateText: string;
  mediaHref: string | null;
  downloadHref: string | null;
  retryCommandRef: string | null;
};
