import { pdmPermissionFetch } from "./pdm-permission-client";
import { errorMessage, readJson } from "./pdm-workbench-response";

/** A lost acknowledgement retries the original command/version, never a fresh
 * upload. A definite version conflict may re-read and start a new command. */
export function createDrawingWorkFileUploader(workId: string, fetcher: typeof fetch = pdmPermissionFetch) {
  const attempts = new Map<string, { version: number; key: string }>();
  const base = `/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}`;
  return async (file: File, taskId: string) => {
    for (let retry = 0; retry < 3; retry++) {
      const read = await fetcher(base, { cache: "no-store" });
      const snapshot = await readJson(read) as { data?: { workId?: string; rowVersion?: number; interaction?: { canMutateContent?: boolean } }; meta?: { contractToken?: string } };
      if (!read.ok || snapshot?.data?.workId !== workId || !Number.isSafeInteger(snapshot.data.rowVersion) || !snapshot.meta?.contractToken || !snapshot.data.interaction?.canMutateContent) {
        throw new Error(errorMessage(snapshot, "目前無法上傳，請確認工作狀態與權限。"));
      }
      const attempt = attempts.get(taskId) ?? { version: snapshot.data.rowVersion!, key: crypto.randomUUID() };
      attempts.set(taskId, attempt);
      const body = new FormData(); body.set("file", file); body.set("display_name", file.name);
      const response = await fetcher(base + "/files", { method: "POST", body,
        headers: { "if-match": `"${attempt.version}"`, "idempotency-key": attempt.key, "x-pdm-workbench-contract": snapshot.meta.contractToken } });
      const result = await readJson(response);
      if (response.ok) { attempts.delete(taskId); return; }
      const code = (result as { error?: { code?: string } } | null)?.error?.code;
      if (response.status === 409 && code === "WORKBENCH_ROW_VERSION_CONFLICT" && retry < 2) { attempts.delete(taskId); continue; }
      if (response.status < 500) attempts.delete(taskId);
      throw new Error(errorMessage(result, `「${file.name}」上傳結果尚未確認，請重試確認。`));
    }
  };
}
