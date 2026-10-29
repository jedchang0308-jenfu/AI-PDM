// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalPreviewProjection } from "@/lib/pdm-canonical-preview";

const mediaProbe = vi.hoisted(() => ({ requests: [] as string[], mounts: 0, unmounts: 0 }));

vi.mock("@/components/canonical-preview-media", () => ({
  CanonicalPreviewMedia: ({ media }: { media: { href: string } }) => {
    useEffect(() => {
      mediaProbe.mounts += 1;
      return () => { mediaProbe.unmounts += 1; };
    }, []);
    useEffect(() => {
      mediaProbe.requests.push(media.href);
      void fetch(media.href);
    }, [media.href]);
    return createElement("img", { src: media.href, "data-preview-media": "true" });
  }
}));

import { CanonicalPreviewThumbnail } from "@/components/canonical-pdm-preview-gallery";

const observers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  readonly observe = vi.fn((target: Element) => { this.target = target; });
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  target: Element | null = null;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit
  ) {
    observers.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback([{
      target: this.target ?? document.createElement("span"),
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0
    }], this as unknown as IntersectionObserver);
  }
}

const preview = (href = "/api/pdm/files/preview-a"): CanonicalPreviewProjection => ({
  state: "ready",
  media: { mode: "image", href, fileName: "preview.png" },
  sourceType: "custom_image",
  sourceLabel: "產品圖片",
  sourceDrawingNumber: null,
  sourceRevision: null,
  alt: "產品預覽"
});

const cleanupViews: Array<() => void> = [];

async function mountThumbnail(density: "gallery" | "inline" = "gallery", value = preview()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  let mounted = true;
  const render = async (nextPreview: CanonicalPreviewProjection) => {
    await act(async () => {
      root.render(createElement(CanonicalPreviewThumbnail, { preview: nextPreview, density }));
    });
  };
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    act(() => root.unmount());
    container.remove();
  };
  cleanupViews.push(unmount);
  await render(value);
  return { container, render, unmount };
}

beforeEach(() => {
  mediaProbe.requests.length = 0;
  mediaProbe.mounts = 0;
  mediaProbe.unmounts = 0;
  observers.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const cleanup of cleanupViews.splice(0)) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CanonicalPreviewThumbnail lazy media mounting", () => {
  it.each(["gallery", "inline"] as const)("keeps the %s placeholder until it enters the preload range", async (density) => {
    const view = await mountThumbnail(density);

    expect(view.container.querySelector("[data-preview-media]")).toBeNull();
    expect(view.container.querySelector(`.canonical-preview-thumbnail.is-${density}`)).not.toBeNull();
    expect(view.container.querySelector(".canonical-preview-placeholder.is-ready")).not.toBeNull();
    expect(view.container.querySelector("[aria-label='產品圖片，預覽已就緒']")).not.toBeNull();
    expect(mediaProbe.mounts).toBe(0);
    expect(mediaProbe.requests).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);
    expect(observers[0].options?.rootMargin).toBe("200px 0px");
  });

  it("mounts and requests the image on entry, then keeps it mounted after scrolling away", async () => {
    const view = await mountThumbnail();
    const observer = observers[0];

    await act(async () => observer.trigger(true));
    expect(view.container.querySelector("[data-preview-media]")).not.toBeNull();
    expect(mediaProbe.requests).toEqual(["/api/pdm/files/preview-a"]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mediaProbe.mounts).toBe(1);

    await act(async () => observer.trigger(false));
    expect(view.container.querySelector("[data-preview-media]")).not.toBeNull();
    expect(mediaProbe.unmounts).toBe(0);
    expect(mediaProbe.requests).toEqual(["/api/pdm/files/preview-a"]);
  });

  it("updates the loaded source href without returning to the placeholder", async () => {
    const view = await mountThumbnail();
    await act(async () => observers[0].trigger(true));

    await view.render(preview("/api/pdm/files/preview-b"));
    expect(view.container.querySelector("[data-preview-media]")).not.toBeNull();
    expect(view.container.querySelector("img[data-preview-media]")?.getAttribute("src")).toBe("/api/pdm/files/preview-b");
    expect(mediaProbe.mounts).toBe(1);
    expect(mediaProbe.requests).toEqual(["/api/pdm/files/preview-a", "/api/pdm/files/preview-b"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("loads immediately when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const view = await mountThumbnail("inline");

    expect(view.container.querySelector("[data-preview-media]")).not.toBeNull();
    expect(mediaProbe.requests).toEqual(["/api/pdm/files/preview-a"]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(observers).toHaveLength(0);
  });

  it("disconnects its observer on unmount", async () => {
    const view = await mountThumbnail();
    const observer = observers[0];

    view.unmount();

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(mediaProbe.mounts).toBe(0);
  });
});
