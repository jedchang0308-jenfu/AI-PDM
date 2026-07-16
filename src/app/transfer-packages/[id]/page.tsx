import { TransferPackageWorkbenchShell } from "@/components/transfer-package-workbench";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TransferPackagePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParams;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  return (
    <TransferPackageWorkbenchShell
      packageId={id}
      initialSection={firstValue(query.section)}
      initialBlocker={firstValue(query.blocker)}
    />
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
