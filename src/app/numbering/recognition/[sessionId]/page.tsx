import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveDrawingRecognitionNavigation } from "@/lib/drawing-recognition-legacy-redirect";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";

export const dynamic = "force-dynamic";

export default async function DrawingRecognitionReviewPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sessionId } = await params;
  const query = await searchParams;
  const returnTo = typeof query.returnTo === "string" ? query.returnTo : null;
  const request = new Request(`http://localhost/numbering/recognition/${encodeURIComponent(sessionId)}`, { headers: await headers() });
  const response = await withPrincipalNumberingCompanyRead(request,
    [{ permissionKind: "action", permissionCode: "numbering.recognition.review" }],
    async (snapshot, company, verified) => {
      const navigation = await resolveDrawingRecognitionNavigation({
        snapshot, sessionId, companyId: company.companyId, actorId: verified.profile.pdmUserId,
        canReviewNonOwned: true, returnTo
      });
      return Response.json({ href: navigation?.href ?? null });
    });
  if (!response || response.status === 401) {
    redirect(`/login?returnTo=${encodeURIComponent(`/numbering/recognition/${encodeURIComponent(sessionId)}`)}`);
  }
  if (response.status === 403) redirect("/numbering/drawings");
  if (!response.ok) throw new Error("PRINCIPAL_RECOGNITION_NAVIGATION_UNAVAILABLE");
  const navigation = await response.json() as { href: string | null };
  redirect(navigation.href ?? "/numbering/drawings");
}
