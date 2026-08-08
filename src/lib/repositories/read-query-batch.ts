export const READ_QUERY_BATCH_SIZE = 400;

export function chunkReadQueryInput<T>(values: readonly T[], batchSize = READ_QUERY_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("READ_QUERY_BATCH_SIZE_INVALID");
  return Array.from({ length: Math.ceil(values.length / batchSize) }, (_, index) =>
    values.slice(index * batchSize, (index + 1) * batchSize)
  );
}
