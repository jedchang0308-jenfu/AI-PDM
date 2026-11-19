import { assemblyJobRequest } from "@/lib/assembly-job-http";

export const runtime = "nodejs";
export async function GET(request: Request, context: {params: Promise<{jobId: string}>}) {
  return assemblyJobRequest(request, "content", (await context.params).jobId);
}
