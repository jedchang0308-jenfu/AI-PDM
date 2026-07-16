import { TransferPackageWorkbenchShell } from "@/components/transfer-package-workbench";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewTransferPackagePage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const sourceType = firstValue(params.sourceType);
  const sourceId = firstValue(params.sourceId);
  const sourceLabel = firstValue(params.sourceLabel);
  const caseType = firstValue(params.caseType) || "design_change_case";
  return <TransferPackageWorkbenchShell sourceType={sourceType} sourceId={sourceId} sourceLabel={sourceLabel} initialCaseType={caseType} />;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
