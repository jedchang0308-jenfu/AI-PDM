/** Shell-owned, bounded memory only. Every reuse reauthorizes through the
 * consumer's own URL; a hash is never sufficient authority to return bytes. */
export function createPdmProtectedPdfCache(fetcher: typeof fetch = (...args) => fetch(...args), maxBytes = 128 * 1024 * 1024) {
  type Entry = { blob: Blob; headers: Headers; at: number };
  const entries = new Map<string, Entry>();
  const flights = new Map<string, Promise<Entry | Response>>();
  const controllers = new Set<AbortController>();
  let generation = 0;
  const cachedResponse = (entry: Entry) => new Response(entry.blob, { status: 200, headers: entry.headers });
  function clear() {
    generation++;
    entries.clear(); flights.clear();
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }
  async function read(url: string, hash: string, signal?: AbortSignal): Promise<Response> {
    if (!/^[a-f0-9]{64}$/iu.test(hash)) return fetcher(url, { cache: "no-store", credentials: "same-origin", signal });
    const key = hash.toLowerCase(), version = generation;
    const assertCurrent = () => { if (version !== generation || signal?.aborted) throw new DOMException("PDF read invalidated", "AbortError"); };
    assertCurrent();
    const request = async (conditional: boolean, shared = false) => {
      const controller = new AbortController(); controllers.add(controller);
      const abort = () => controller.abort();
      if (!shared) signal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await fetcher(url, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
          headers: conditional ? { "if-none-match": `"${key}"` } : undefined });
        if (response.status === 401 || response.status === 403) clear();
        return response;
      } finally { controllers.delete(controller); signal?.removeEventListener("abort", abort); }
    };
    const remember = async (response: Response): Promise<Entry | Response> => {
      if (!response.ok || response.status !== 200 || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/pdf"
        || response.headers.get("content-hash")?.toLowerCase() !== key) return response;
      const blob = await response.blob();
      if (version !== generation) throw new DOMException("PDF read invalidated", "AbortError");
      const entry = { blob, headers: new Headers(response.headers), at: Date.now() };
      if (blob.size > 0 && blob.size <= maxBytes) {
        entries.delete(key);
        while ([...entries.values()].reduce((sum, item) => sum + item.blob.size, 0) + blob.size > maxBytes) entries.delete(entries.keys().next().value!);
        entries.set(key, entry);
      }
      return entry;
    };
    let entry = entries.get(key);
    if (entry && Date.now() - entry.at > 120_000) { entries.delete(key); entry = undefined; }
    const flight = flights.get(key);
    if (!entry && flight) {
      const result = await flight;
      assertCurrent();
      // A second consumer may have a different permission boundary. It must
      // receive its own 304 before using a completed/in-flight shared body.
      if (!(result instanceof Response)) entry = result;
    }
    if (entry) {
      const response = await request(true);
      assertCurrent();
      if (response.status === 304 && response.headers.get("content-hash")?.toLowerCase() === key) return cachedResponse(entry);
      const result = await remember(response); assertCurrent();
      return result instanceof Response ? result : cachedResponse(result);
    }
    const pending = request(false, true).then(remember);
    flights.set(key, pending);
    try {
      const result = await pending; assertCurrent();
      return result instanceof Response ? result : cachedResponse(result);
    } finally { if (flights.get(key) === pending) flights.delete(key); }
  }
  return { read, clear };
}
export type PdmProtectedPdfCache = ReturnType<typeof createPdmProtectedPdfCache>;
