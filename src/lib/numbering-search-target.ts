export type NumberingSearchDetailTarget =
  | { entityType: "part_root"; rootCode: string }
  | { entityType: "drawing_number"; rootCode: string; drawingNumber: string }
  | { entityType: "part_number"; rootCode: string; partNumber: string };

type NumberingSearchTargetInput =
  | { entityType: "part_root"; rootCode: string }
  | { entityType: "drawing_number"; rootCode: string; drawingNumber: string }
  | { entityType: "part_number"; rootCode: string; partNumber: string };

type SearchShortcutTargetDescriptor = {
  tagName: string;
  role?: string | null;
  isContentEditable?: boolean;
};

function requiredCode(value: string, field: string) {
  const code = value.trim();
  if (!code) throw new Error(`${field} is required`);
  return code;
}

export function resolveNumberingSearchDetailTarget(input: NumberingSearchTargetInput): NumberingSearchDetailTarget {
  const rootCode = requiredCode(input.rootCode, "rootCode");
  if (input.entityType === "drawing_number") {
    return { entityType: "drawing_number", rootCode, drawingNumber: requiredCode(input.drawingNumber, "drawingNumber") };
  }
  if (input.entityType === "part_number") {
    return { entityType: "part_number", rootCode, partNumber: requiredCode(input.partNumber, "partNumber") };
  }
  return { entityType: "part_root", rootCode };
}

export function shouldDeferNumberingSearchShortcut(target: SearchShortcutTargetDescriptor) {
  if (target.isContentEditable) return true;
  const tagName = target.tagName.trim().toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tagName)) return true;
  const role = target.role?.trim().toLowerCase();
  return role === "button" || role === "link";
}
