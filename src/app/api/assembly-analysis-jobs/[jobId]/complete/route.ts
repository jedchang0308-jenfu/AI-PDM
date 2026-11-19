import { assemblyJobRequest } from "@/lib/assembly-job-http";

export const runtime = "nodejs";
export async function POST(request: Request, context: {params: Promise<{jobId: string}>}) {
  return assemblyJobRequest(request, "complete", (await context.params).jobId);
}
