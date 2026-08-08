export type ClipboardCopyMethod = "clipboard-api" | "legacy-command";

function copyWithLegacyCommand(text: string) {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.width = "2px";
  textarea.style.height = "2px";
  textarea.style.padding = "0";
  textarea.style.border = "0";
  textarea.style.opacity = "0.01";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand("copy");
  } finally {
    textarea.remove();
    activeElement?.focus({ preventScroll: true });
  }
}

export async function copyTextToClipboardBestEffort(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    copyWithLegacyCommand(text);
  }
}

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyMethod> {
  if (!text) throw new Error("CLIPBOARD_TEXT_REQUIRED");

  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return "clipboard-api";
    } catch {
      // Browsers can deny the async API even after a direct user gesture.
    }
  }

  const legacyCommandAccepted = copyWithLegacyCommand(text);
  if (legacyCommandAccepted) return "legacy-command";

  if (typeof navigator.clipboard?.readText === "function") {
    try {
      if (await navigator.clipboard.readText() === text) return "legacy-command";
    } catch {
      // Continue to the explicit failure state when clipboard readback is unavailable.
    }
  }

  throw new Error("CLIPBOARD_COPY_REJECTED");
}
