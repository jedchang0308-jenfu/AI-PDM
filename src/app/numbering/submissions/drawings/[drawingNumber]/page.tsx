import { redirect } from "next/navigation";

export default async function DrawingNumberSubmissionPage({ params }: { params: Promise<{ drawingNumber: string }> }) {
  const { drawingNumber } = await params;
  redirect(`/numbering/drawings?query=${encodeURIComponent(drawingNumber)}&legacyIntent=submission`);
}
