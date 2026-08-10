export type MetadataFieldAliases<TField extends string> = Record<TField, readonly string[]>;

export function normalizeMetadataKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()[\]{}]/gu, "")
    .replace(/[\s_-]+/gu, "");
}

export function flattenMetadataObject(input: Record<string, unknown>, prefix = "") {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(output, flattenMetadataObject(value as Record<string, unknown>, nextKey));
    } else {
      output[nextKey] = value;
    }
  }
  return output;
}

export function pickAliasedMetadataFields<TField extends string>(
  values: Record<string, unknown>,
  aliases: MetadataFieldAliases<TField>
): Partial<Record<TField, string>> {
  const result: Partial<Record<TField, string>> = {};

  for (const [rawKey, rawValue] of Object.entries(values)) {
    const value = String(rawValue ?? "").trim();
    if (!value) continue;

    const normalized = normalizeMetadataKey(rawKey);
    const field = (Object.keys(aliases) as TField[]).find((candidate) =>
      aliases[candidate].some((alias) => {
        const normalizedAlias = normalizeMetadataKey(alias);
        return normalizedAlias === normalized || normalized.endsWith(`.${normalizedAlias}`);
      })
    );

    if (field && !result[field]) result[field] = value;
  }

  return result;
}
