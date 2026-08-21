"use client";

import { useCallback, useEffect } from "react";

export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  return useCallback(() => {
    if (!dirty) return true;
    return window.confirm("目前有尚未儲存的變更，確定要離開嗎？");
  }, [dirty]);
}
