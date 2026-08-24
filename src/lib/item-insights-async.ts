import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  AsyncItemInsightRepository,
  type ListItemInsightInput
} from "@/lib/repositories/item-insight-async-repository";

export async function listItemRevisionHistoryAsync(input: ListItemInsightInput) {
  return new AsyncItemInsightRepository(getAsyncDatabaseClient()).listItemRevisionHistory(input);
}
