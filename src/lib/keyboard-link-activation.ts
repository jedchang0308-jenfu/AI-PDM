export type LinkActivationKeyboardInput = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export function shouldActivateLinkFromKeyboard(input: LinkActivationKeyboardInput) {
  return input.key === "Enter" && !input.altKey && !input.ctrlKey && !input.metaKey && !input.shiftKey;
}
