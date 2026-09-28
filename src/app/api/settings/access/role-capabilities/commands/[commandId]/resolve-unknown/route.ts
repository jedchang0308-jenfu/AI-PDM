export const runtime = "nodejs";

export async function POST() {
  return Response.json({ code: "ROLE_CAPABILITY_MUTATION_RETIRED", owner: "orgmaster" },
    { status: 410, headers: { "cache-control": "no-store" } });
}
