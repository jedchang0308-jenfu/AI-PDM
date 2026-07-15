import { TechnicalTransferWorkspace } from "@/components/technical-transfer-workspace";

export default async function TechnicalTransferPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requested = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const initialTab = requested === "review" || requested === "published" ? requested : "prepared";
  return <TechnicalTransferWorkspace initialTab={initialTab} />;
}
