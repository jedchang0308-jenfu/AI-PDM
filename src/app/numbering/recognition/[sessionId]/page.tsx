import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserAsync } from "@/lib/auth-async";
import { resolveLegacyDrawingRecognitionNavigation } from "@/lib/drawing-recognition-legacy-redirect";

export const dynamic = "force-dynamic";

export default async function DrawingRecognitionReviewPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sessionId } = await params;
  const query = await searchParams;
  const returnTo = typeof query.returnTo === "string" ? query.returnTo : null;
  const request = new Request("http://localhost/numbering/recognition/legacy", { headers: await headers() });
  const user = await getSessionUserAsync(request);
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/numbering/recognition/${encodeURIComponent(sessionId)}`)}`);
  const navigation = await resolveLegacyDrawingRecognitionNavigation({
    sessionId,
    companyId: user.company_id,
    actorId: user.id,
    role: user.role,
    returnTo
  });
  redirect(navigation?.href ?? "/numbering/drawings");
}
