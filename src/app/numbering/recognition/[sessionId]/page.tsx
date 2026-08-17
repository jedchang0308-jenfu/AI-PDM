import { DrawingRecognitionReview } from "@/components/drawing-recognition-review";

export default async function DrawingRecognitionReviewPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sessionId } = await params;
  const query = await searchParams;
  const returnTo = typeof query.returnTo === "string" && query.returnTo.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : null;
  return <DrawingRecognitionReview sessionId={sessionId} returnTo={returnTo} />;
}
