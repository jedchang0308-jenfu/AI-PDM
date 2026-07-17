import { NumberStateLegacyRoute } from "@/components/number-state-legacy-route";

export default function UploadCompatibilityLayout({ children }: { children: React.ReactNode }) {
  void children;
  return (
    <NumberStateLegacyRoute
      title="上傳送審已改由物件進入"
      message="請先選擇圖號或料號，再從該物件的工作台處理檔案與送審。"
      destination="/numbering/search?legacyIntent=upload"
      destinationLabel="選擇圖料號"
      strategy="upload"
      statusScope="uploadSubmission"
    />
  );
}
