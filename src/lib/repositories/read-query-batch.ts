export const READ_QUERY_BATCH_SIZE = 400;
export const READ_QUERY_MAX_CONCURRENCY = 4;

export function chunkReadQueryInput<T>(values: readonly T[], batchSize = READ_QUERY_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("READ_QUERY_BATCH_SIZE_INVALID");
  return Array.from({ length: Math.ceil(values.length / batchSize) }, (_, index) =>
    values.slice(index * batchSize, (index + 1) * batchSize)
  );
}

export async function mapReadQueryBatches<T, R>(
  values: readonly T[],
  mapper: (batch: T[], batchIndex: number) => Promise<R>,
  options: { batchSize?: number; maxConcurrency?: number } = {}
): Promise<R[]> {
  const maxConcurrency = options.maxConcurrency ?? READ_QUERY_MAX_CONCURRENCY;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) throw new Error("READ_QUERY_MAX_CONCURRENCY_INVALID");

  const batches = chunkReadQueryInput(values, options.batchSize);
  if (batches.length === 0) return [];

  const results = new Array<R>(batches.length);
  let nextBatchIndex = 0;
  let failed = false;
  let firstError: unknown;

  const workers = Array.from({ length: Math.min(maxConcurrency, batches.length) }, async () => {
    while (!failed) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      if (batchIndex >= batches.length) return;

      try {
        results[batchIndex] = await mapper(batches[batchIndex], batchIndex);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
        return;
      }
    }
  });

  await Promise.all(workers);
  if (failed) throw firstError;
  return results;
}
