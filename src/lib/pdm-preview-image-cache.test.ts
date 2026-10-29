import { describe, expect, it } from "vitest";
import { createPdmPreviewImageCache } from "./pdm-preview-image-cache";

function imageBlob(size = 3, type = "image/png") {
  return new Blob([new Uint8Array(size)], { type });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function getImage(
  cache: ReturnType<typeof createPdmPreviewImageCache>,
  key: string,
  loader: (signal: AbortSignal) => Promise<Blob>,
) {
  const lease = cache.acquire(key, loader);
  try {
    return await lease.promise;
  } finally {
    lease.release();
  }
}

async function flushQueuedAbort() {
  await new Promise<void>(resolve => queueMicrotask(resolve));
}

describe("app-owned PDM preview image cache", () => {
  it("expires entries at the default 120 second TTL", async () => {
    let now = 0;
    let loads = 0;
    const blob = imageBlob();
    const cache = createPdmPreviewImageCache({ now: () => now });
    const loader = async () => {
      loads += 1;
      return blob;
    };

    await getImage(cache, "/preview?binding=A", loader);
    now = 119_999;
    expect(await getImage(cache, "/preview?binding=A", loader)).toBe(blob);
    expect(loads).toBe(1);

    now = 120_000;
    await getImage(cache, "/preview?binding=A", loader);
    expect(loads).toBe(2);
  });

  it("uses LRU eviction while keeping total cached bytes within the configured bound", async () => {
    const cache = createPdmPreviewImageCache({ maxBytes: 6 });
    const loads = new Map<string, number>();
    const loaderFor = (key: string) => async () => {
      loads.set(key, (loads.get(key) ?? 0) + 1);
      return imageBlob(3);
    };

    await getImage(cache, "A", loaderFor("A"));
    await getImage(cache, "B", loaderFor("B"));
    await getImage(cache, "A", loaderFor("A")); // Promote A above B.
    await getImage(cache, "C", loaderFor("C")); // Evict B, the least recently used.
    await getImage(cache, "B", loaderFor("B"));
    await getImage(cache, "C", loaderFor("C"));
    await getImage(cache, "A", loaderFor("A"));

    expect(loads).toEqual(new Map([["A", 2], ["B", 2], ["C", 1]]));
  });

  it("coalesces requests and keeps the shared flight alive while one consumer remains", async () => {
    const result = deferred<Blob>();
    const started = deferred<AbortSignal>();
    let loads = 0;
    const cache = createPdmPreviewImageCache();
    const loader = (signal: AbortSignal) => {
      loads += 1;
      started.resolve(signal);
      return result.promise;
    };

    const first = cache.acquire("/preview?file=1&binding=A", loader);
    const second = cache.acquire("/preview?file=1&binding=A", loader);
    const firstOutcome = first.promise.catch(error => error);
    const secondOutcome = second.promise.catch(error => error);
    const signal = await started.promise;

    expect(loads).toBe(1);
    first.release();
    await flushQueuedAbort();
    expect(signal.aborted).toBe(false);

    second.release();
    await flushQueuedAbort();
    expect(signal.aborted).toBe(true);
    expect((await firstOutcome).name).toBe("AbortError");
    expect((await secondOutcome).name).toBe("AbortError");
  });

  it("delays final-release abort so an immediate StrictMode reacquire can reuse the flight", async () => {
    const result = deferred<Blob>();
    const started = deferred<AbortSignal>();
    let loads = 0;
    const cache = createPdmPreviewImageCache();
    const loader = (signal: AbortSignal) => {
      loads += 1;
      started.resolve(signal);
      return result.promise;
    };

    const first = cache.acquire("/preview?file=2&binding=B", loader);
    const firstOutcome = first.promise.catch(error => error);
    const signal = await started.promise;
    first.release();

    const remounted = cache.acquire("/preview?file=2&binding=B", loader);
    expect(remounted.promise).toBe(first.promise);
    await flushQueuedAbort();
    expect(signal.aborted).toBe(false);
    expect(loads).toBe(1);

    const blob = imageBlob();
    result.resolve(blob);
    await expect(remounted.promise).resolves.toBe(blob);
    expect(await firstOutcome).toBe(blob);
    remounted.release();
  });

  it("rejects a cached lease when clear runs before its promise is consumed", async () => {
    const cache = createPdmPreviewImageCache();
    const blob = imageBlob();
    await getImage(cache, "cached", async () => blob);

    let fallbackLoads = 0;
    const cachedLease = cache.acquire("cached", async () => {
      fallbackLoads += 1;
      return imageBlob(4);
    });
    const outcome = cachedLease.promise.catch(error => error);
    cache.clear();

    expect((await outcome).name).toBe("AbortError");
    expect(fallbackLoads).toBe(0);
  });

  it("does not invoke a deferred loader after clear or after every lease is released", async () => {
    for (const cancel of ["clear", "release"] as const) {
      const cache = createPdmPreviewImageCache();
      let loads = 0;
      const lease = cache.acquire(cancel, async () => {
        loads += 1;
        return imageBlob();
      });
      const outcome = lease.promise.catch(error => error);

      if (cancel === "clear") cache.clear();
      else lease.release();

      await flushQueuedAbort();
      expect((await outcome).name, cancel).toBe("AbortError");
      expect(loads, cancel).toBe(0);
    }
  });

  it("evicts only the named cached image without notifying or cancelling another flight", async () => {
    const cache = createPdmPreviewImageCache();
    const cachedBlob = imageBlob(3, "image/png");
    const otherBlob = imageBlob(2, "image/gif");
    let badImageLoads = 0;
    let notifications = 0;
    const unsubscribe = cache.subscribe(() => { notifications += 1; });

    await getImage(cache, "bad-image", async () => {
      badImageLoads += 1;
      return cachedBlob;
    });
    await getImage(cache, "other-image", async () => otherBlob);

    const activeResult = deferred<Blob>();
    const activeStarted = deferred<boolean>();
    const active = cache.acquire("active-flight", () => {
      activeStarted.resolve(true);
      return activeResult.promise;
    });
    const activeOutcome = active.promise;
    await activeStarted.promise;

    cache.evict("bad-image");
    activeResult.resolve(otherBlob);
    await expect(activeOutcome).resolves.toBe(otherBlob);
    active.release();

    const replacementBlob = imageBlob(4, "image/webp");
    expect(await getImage(cache, "bad-image", async () => {
      badImageLoads += 1;
      return replacementBlob;
    })).toBe(replacementBlob);
    expect(await getImage(cache, "other-image", async () => imageBlob(5))).toBe(otherBlob);
    expect(badImageLoads).toBe(2);
    expect(notifications).toBe(0);

    unsubscribe();
  });

  it("clear aborts and rejects old leases, notifies subscribers, and fences late responses", async () => {
    const oldResult = deferred<Blob>();
    const oldStarted = deferred<AbortSignal>();
    const cache = createPdmPreviewImageCache();
    let notifications = 0;
    let freshLoads = 0;
    const unsubscribe = cache.subscribe(() => { notifications += 1; });

    const oldLease = cache.acquire("/preview?file=3&binding=C", signal => {
      oldStarted.resolve(signal);
      return oldResult.promise; // Deliberately ignores abort and resolves late.
    });
    const oldOutcome = oldLease.promise.catch(error => error);
    const oldSignal = await oldStarted.promise;

    cache.clear();
    expect(oldSignal.aborted).toBe(true);
    expect(notifications).toBe(1);
    expect((await oldOutcome).name).toBe("AbortError");

    const freshBlob = imageBlob(4, "image/webp");
    await getImage(cache, "/preview?file=3&binding=C", async () => {
      freshLoads += 1;
      return freshBlob;
    });
    oldResult.resolve(imageBlob(5, "image/gif"));
    await Promise.resolve();
    await Promise.resolve();

    expect(await getImage(cache, "/preview?file=3&binding=C", async () => {
      freshLoads += 1;
      return imageBlob(6, "image/jpeg");
    })).toBe(freshBlob);
    expect(freshLoads).toBe(1);

    unsubscribe();
    cache.clear();
    expect(notifications).toBe(1);
  });

  it("does not cache PDF, empty, oversized, or failed results", async () => {
    const cache = createPdmPreviewImageCache({ maxBytes: 4 });
    const nonCacheable = [
      ["pdf", imageBlob(2, "application/pdf")],
      ["empty", imageBlob(0, "image/png")],
      ["oversized", imageBlob(5, "image/png")],
    ] as const;

    for (const [key, blob] of nonCacheable) {
      let loads = 0;
      const loader = async () => {
        loads += 1;
        return blob;
      };
      await getImage(cache, key, loader);
      await getImage(cache, key, loader);
      expect(loads, key).toBe(2);
    }

    let failureLoads = 0;
    const failure = new Error("image request failed");
    await expect(getImage(cache, "failure", async () => {
      failureLoads += 1;
      throw failure;
    })).rejects.toBe(failure);
    const recoveredBlob = imageBlob(2);
    await getImage(cache, "failure", async () => {
      failureLoads += 1;
      return recoveredBlob;
    });
    expect(failureLoads).toBe(2);
  });
});
