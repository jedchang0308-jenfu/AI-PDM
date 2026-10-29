const DEFAULT_TTL_MS = 120_000;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const CACHEABLE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type PdmPreviewImageCacheOptions = {
  now?: () => number;
  ttlMs?: number;
  maxBytes?: number;
};

type CachedImage = {
  blob: Blob;
  expiresAt: number;
  size: number;
};

type ImageFlight = {
  key: string;
  generation: number;
  controller: AbortController;
  promise: Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
  consumers: number;
  settled: boolean;
  invalidated: boolean;
};

function abortError(message: string) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function isCacheableImage(blob: Blob, maxBytes: number) {
  if (blob.size <= 0 || blob.size > maxBytes) return false;
  const mimeType = blob.type.trim().toLowerCase().split(";", 1)[0];
  return CACHEABLE_IMAGE_TYPES.has(mimeType);
}

/**
 * Creates an app-owned in-memory cache for preview image bytes.
 * Callers should use the complete preview href as the key so file, context,
 * binding, and derivative identity stay distinct.
 */
export function createPdmPreviewImageCache(options: PdmPreviewImageCacheOptions = {}) {
  const now = options.now ?? Date.now;
  const ttlMs = Number.isFinite(options.ttlMs)
    ? Math.max(0, options.ttlMs!)
    : DEFAULT_TTL_MS;
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(0, Math.floor(options.maxBytes!))
    : DEFAULT_MAX_BYTES;

  let generation = 0;
  let cachedBytes = 0;
  const cached = new Map<string, CachedImage>();
  const flights = new Map<string, ImageFlight>();
  const listeners = new Set<() => void>();

  function removeCached(key: string) {
    const entry = cached.get(key);
    if (!entry) return;
    cached.delete(key);
    cachedBytes -= entry.size;
  }

  function readCached(key: string) {
    const entry = cached.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      removeCached(key);
      return null;
    }

    // Map insertion order is the LRU order, oldest first.
    cached.delete(key);
    cached.set(key, entry);
    return entry.blob;
  }

  function writeCached(key: string, blob: Blob) {
    if (ttlMs <= 0 || !isCacheableImage(blob, maxBytes)) return;

    removeCached(key);
    const entry = { blob, expiresAt: now() + ttlMs, size: blob.size };
    cached.set(key, entry);
    cachedBytes += entry.size;

    while (cachedBytes > maxBytes) {
      const oldestKey = cached.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      removeCached(oldestKey);
    }
  }

  function isCurrent(flight: ImageFlight) {
    return !flight.invalidated
      && !flight.settled
      && generation === flight.generation
      && flights.get(flight.key) === flight;
  }

  function cancelFlight(flight: ImageFlight, reason: string) {
    if (flight.settled) return;
    flight.invalidated = true;
    if (flights.get(flight.key) === flight) flights.delete(flight.key);
    flight.controller.abort();
    flight.settled = true;
    flight.reject(abortError(reason));
  }

  function startFlight(key: string, loader: (signal: AbortSignal) => Promise<Blob>) {
    let resolve!: (blob: Blob) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Blob>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const flight: ImageFlight = {
      key,
      generation,
      controller: new AbortController(),
      promise,
      resolve,
      reject,
      consumers: 0,
      settled: false,
      invalidated: false,
    };
    flights.set(key, flight);

    // Deferring the loader invocation normalizes synchronous throws and lets
    // acquire/clear/release settle before any request starts.
    void Promise.resolve()
      .then(() => {
        if (!isCurrent(flight) || flight.consumers === 0) {
          if (!flight.settled) cancelFlight(flight, "Preview image request has no active consumers");
          throw abortError("Preview image request is no longer current");
        }
        return loader(flight.controller.signal);
      })
      .then(
        blob => {
          if (!isCurrent(flight)) {
            if (!flight.settled) cancelFlight(flight, "Preview image request is no longer current");
            return;
          }
          flight.settled = true;
          flights.delete(key);
          writeCached(key, blob);
          flight.resolve(blob);
        },
        error => {
          if (!isCurrent(flight)) {
            if (!flight.settled) cancelFlight(flight, "Preview image request is no longer current");
            return;
          }
          flight.settled = true;
          flights.delete(key);
          flight.reject(error);
        },
      );

    return flight;
  }

  return {
    acquire(key: string, loader: (signal: AbortSignal) => Promise<Blob>) {
      const cachedBlob = readCached(key);
      if (cachedBlob) {
        const acquiredGeneration = generation;
        return {
          promise: Promise.resolve().then(() => {
            if (generation !== acquiredGeneration) {
              throw abortError("Preview image cache was cleared");
            }
            return cachedBlob;
          }),
          release: () => {},
        };
      }

      let flight = flights.get(key);
      if (!flight || flight.invalidated || flight.settled) {
        flight = startFlight(key, loader);
      }
      flight.consumers += 1;

      let released = false;
      return {
        promise: flight.promise,
        release() {
          if (released) return;
          released = true;
          flight!.consumers = Math.max(0, flight!.consumers - 1);
          if (flight!.consumers !== 0 || flight!.settled) return;

          // React StrictMode may immediately reacquire the same resource during
          // its development-only effect cleanup/setup cycle.
          queueMicrotask(() => {
            if (flight!.consumers === 0 && isCurrent(flight!)) {
              cancelFlight(flight!, "Preview image request has no active consumers");
            }
          });
        },
      };
    },

    evict(key: string) {
      removeCached(key);
    },

    clear() {
      generation += 1;
      cached.clear();
      cachedBytes = 0;

      const activeFlights = [...flights.values()];
      flights.clear();
      for (const flight of activeFlights) {
        cancelFlight(flight, "Preview image cache was cleared");
      }

      for (const listener of [...listeners]) listener();
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type PdmPreviewImageCache = ReturnType<typeof createPdmPreviewImageCache>;

/** A denial stops automatic read replay until a permission/account change or explicit retry. */
export function createPdmPreviewImageDenials() {
  const hrefs = new Set<string>();
  return {
    has: (href: string) => hrefs.has(href),
    add: (href: string) => { hrefs.add(href); },
    delete: (href: string) => { hrefs.delete(href); },
    clear: () => { hrefs.clear(); },
  };
}
