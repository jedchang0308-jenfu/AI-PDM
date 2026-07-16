import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { ExternalLargeFileRegistration, ExternalLargeFileRegistrationInput } from "@/lib/external-large-file-intake";
import { AsyncExternalLargeFileIntakeRepository } from "@/lib/repositories/external-large-file-intake-async-repository";

export async function registerExternalLargeFileObjectAsync(
  input: ExternalLargeFileRegistrationInput
): Promise<ExternalLargeFileRegistration> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncExternalLargeFileIntakeRepository(client);
  return repository.registerExternalLargeFile(input);
}
