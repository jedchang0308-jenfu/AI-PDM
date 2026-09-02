import { BomWorkbenchDetail } from "@/components/bom-workbench-detail";

export default async function BomWorkbenchDetailPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return <BomWorkbenchDetail draftId={draftId} />;
}
