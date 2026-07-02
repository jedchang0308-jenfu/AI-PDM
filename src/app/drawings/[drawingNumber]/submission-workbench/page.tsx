import { DrawingSourceSubmissionWorkbench } from "@/app/upload/page";

export default async function DrawingSubmissionWorkbenchPage({ params }: { params: Promise<{ drawingNumber: string }> }) {
  const { drawingNumber } = await params;
  return <DrawingSourceSubmissionWorkbench drawingNumber={decodeURIComponent(drawingNumber)} />;
}
