export const STORAGE_SCHEMA_FORBIDDEN_TARGETS = [
  { name: "ProJED", ref: "knodlkxqpcqyrtgwpdst" },
  { name: "ProJED_TEST", ref: "fhisnnufoeulxqrchldf" }
];

const DEFAULT_TARGET_KIND = "postgres_disposable";
const SAFE_TARGET_MARKERS = ["disposable", "staging", "shadow", "test"];
const UNSAFE_TARGET_MARKERS = ["prod", "production", "main"];

function normalizeIdentifier(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function containsMarker(normalizedName, markers) {
  return markers.some((marker) => normalizedName.includes(marker));
}

function findForbiddenTarget(targetName, databaseUrl) {
  const normalizedName = normalizeIdentifier(targetName);
  const normalizedUrl = String(databaseUrl ?? "").toLowerCase();
  return STORAGE_SCHEMA_FORBIDDEN_TARGETS.find((target) => {
    const forbiddenName = normalizeIdentifier(target.name);
    const forbiddenRef = target.ref.toLowerCase();
    return normalizedName === forbiddenName ||
      normalizedName.includes(forbiddenRef) ||
      normalizedUrl.includes(forbiddenRef) ||
      normalizedUrl.includes(`db.${forbiddenRef}.supabase.co`);
  });
}

export function evaluateStorageSchemaTargetSafety({
  targetKind = DEFAULT_TARGET_KIND,
  targetName = "",
  databaseUrl = "",
  requireDisposableKind = false
} = {}) {
  if (requireDisposableKind && targetKind !== DEFAULT_TARGET_KIND) {
    return {
      safe: false,
      status: "unsupported_target_kind",
      reason: "only postgres_disposable targets can be used by this gate"
    };
  }

  const normalizedName = normalizeIdentifier(targetName);
  if (!normalizedName) {
    return {
      safe: false,
      status: "unsafe_target",
      reason: "target name is required"
    };
  }

  const forbidden = findForbiddenTarget(targetName, databaseUrl);
  if (forbidden) {
    return {
      safe: false,
      status: "unsafe_known_target",
      reason: `target matches forbidden Supabase project ${forbidden.name}`
    };
  }

  if (containsMarker(normalizedName, UNSAFE_TARGET_MARKERS)) {
    return {
      safe: false,
      status: "unsafe_target",
      reason: "target name looks production-like"
    };
  }

  if (!containsMarker(normalizedName, SAFE_TARGET_MARKERS)) {
    return {
      safe: false,
      status: "unsafe_target",
      reason: "target name must include disposable, staging, shadow, or test"
    };
  }

  return {
    safe: true,
    status: "safe",
    reason: "target name is explicitly non-production and not a known forbidden project"
  };
}
