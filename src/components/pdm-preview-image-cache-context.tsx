"use client";

import { createContext, useContext } from "react";
import type { PdmPreviewImageCache, createPdmPreviewImageDenials } from "@/lib/pdm-preview-image-cache";

// Only the current app shell owns protected image bytes. Other surfaces keep
// their existing uncached reads rather than acquiring a global/user-shared cache.
export const PdmPreviewImageCacheContext = createContext<{
  cache: PdmPreviewImageCache;
  enabled: boolean;
  deniedHrefs: ReturnType<typeof createPdmPreviewImageDenials>;
} | null>(null);

export function usePdmPreviewImageCache() {
  return useContext(PdmPreviewImageCacheContext);
}
