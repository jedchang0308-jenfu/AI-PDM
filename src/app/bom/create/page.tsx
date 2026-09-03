import { BomCreatePage } from "@/components/bom-create-page";
import { parseBomCreateNavigation } from "@/lib/bom-create-navigation";

type BomCreatePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: BomCreatePageProps) {
  const params = await searchParams;
  const navigation = parseBomCreateNavigation(params ?? {});
  return <BomCreatePage initialNavigation={navigation} />;
}
