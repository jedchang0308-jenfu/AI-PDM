"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_DRAWER_WIDTH = 500;
const MIN_DRAWER_WIDTH = 380;
const MAX_DRAWER_WIDTH_RATIO = 0.72;

type UseRememberedDrawerWidthOptions = {
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidthRatio?: number;
};

type PdmDetailDrawerProps = {
  open: boolean;
  width: number;
  ariaLabel: string;
  resizeLabel?: string;
  resizeTitle?: string;
  onClose: () => void;
  onStartResize: (clientX: number) => void;
  children: ReactNode;
  className?: string;
};

function clampDrawerWidth(width: number, viewportWidth: number, minWidth: number, maxWidthRatio: number) {
  const maxWidth = Math.max(minWidth, Math.floor(viewportWidth * maxWidthRatio));
  return Math.min(Math.max(width, minWidth), maxWidth);
}

export function useRememberedDrawerWidth({
  storageKey,
  defaultWidth = DEFAULT_DRAWER_WIDTH,
  minWidth = MIN_DRAWER_WIDTH,
  maxWidthRatio = MAX_DRAWER_WIDTH_RATIO
}: UseRememberedDrawerWidthOptions) {
  const [drawerWidth, setDrawerWidth] = useState(defaultWidth);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(storageKey);
    const parsedWidth = storedWidth ? Number.parseInt(storedWidth, 10) : Number.NaN;
    if (!Number.isFinite(parsedWidth)) return;
    const nextWidth = clampDrawerWidth(parsedWidth, window.innerWidth, minWidth, maxWidthRatio);
    setDrawerWidth(nextWidth);
    window.localStorage.setItem(storageKey, String(nextWidth));
  }, [defaultWidth, maxWidthRatio, minWidth, storageKey]);

  const resizeDrawer = useCallback(
    (clientX: number) => {
      const nextWidth = clampDrawerWidth(window.innerWidth - clientX, window.innerWidth, minWidth, maxWidthRatio);
      setDrawerWidth(nextWidth);
      window.localStorage.setItem(storageKey, String(nextWidth));
    },
    [maxWidthRatio, minWidth, storageKey]
  );

  useEffect(() => {
    function handleWindowResize() {
      setDrawerWidth((currentWidth) => {
        const nextWidth = clampDrawerWidth(currentWidth, window.innerWidth, minWidth, maxWidthRatio);
        window.localStorage.setItem(storageKey, String(nextWidth));
        return nextWidth;
      });
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [maxWidthRatio, minWidth, storageKey]);

  const startDrawerResize = useCallback(
    (clientX: number) => {
      function handlePointerMove(event: PointerEvent) {
        resizeDrawer(event.clientX);
      }

      function stopResizing() {
        document.body.classList.remove("pdm-drawer-resizing");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
      }

      resizeDrawer(clientX);
      document.body.classList.add("pdm-drawer-resizing");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing, { once: true });
      window.addEventListener("pointercancel", stopResizing, { once: true });
    },
    [resizeDrawer]
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove("pdm-drawer-resizing");
    };
  }, []);

  return { drawerWidth, startDrawerResize };
}

export function PdmDetailDrawer({
  open,
  width,
  ariaLabel,
  resizeLabel = "調整明細欄寬度",
  resizeTitle = "拖拉調整明細欄寬度",
  onClose,
  onStartResize,
  children,
  className
}: PdmDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  if (!open) return null;

  const drawerStyle = { "--pdm-detail-drawer-width": `${width}px` } as CSSProperties;

  return (
    <div className="pdm-detail-drawer-backdrop" role="presentation">
      <aside className={className ? `pdm-detail-drawer ${className}` : "pdm-detail-drawer"} aria-label={ariaLabel} role="dialog" style={drawerStyle}>
        <button
          className="pdm-detail-drawer-resize-handle"
          type="button"
          aria-label={resizeLabel}
          title={resizeTitle}
          onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            onStartResize(event.clientX);
          }}
        />
        {children}
      </aside>
    </div>
  );
}
