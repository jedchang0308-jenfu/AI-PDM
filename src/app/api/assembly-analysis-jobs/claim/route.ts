import { assemblyJobRequest } from "@/lib/assembly-job-http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return assemblyJobRequest(request, "claim");
}
