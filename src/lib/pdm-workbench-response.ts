type ApiError = { error?: { code?: string; message?: string; correlationId?: string } };

export function errorMessage(body: unknown, fallback: string) {
  const api = body as ApiError;
  if (typeof (body as { message?: unknown } | null)?.message === "string" && String((body as { message: string }).message).trim()) return String((body as { message: string }).message).trim();
  if (typeof (body as { error?: unknown } | null)?.error === "string" && String((body as { error: string }).error).trim()) return String((body as { error: string }).error).trim();
  return api?.error?.message?.trim() || fallback;
}

export async function readJson(response: Response) {
  try { return await response.json() as unknown; }
  catch { return null; }
}
