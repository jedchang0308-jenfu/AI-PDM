// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedDrawingUpload } from "@/lib/drawing-upload-archive";
const mocked = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/drawing-upload-archive", () => ({ prepareDrawingUpload: mocked.prepare }));
vi.mock("@/lib/assembly-package-upload-client", () => ({ uploadAssemblyPackage: mocked.upload }));
vi.mock("@/lib/pdm-permission-client", () => ({ pdmPermissionFetch: mocked.fetch }));
import { DrawingWorkspaceUpload } from "./drawing-workspace-upload";
let host: HTMLDivElement, root: Root, plan: PreparedDrawingUpload;
const begin = vi.fn(), complete = vi.fn(), uploadFile = vi.fn(), pending = vi.fn(), packageBusy = vi.fn();
const item = (path: string) => ({ path, file: new File([path], path) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  begin.mockResolvedValue(undefined); complete.mockResolvedValue(undefined); uploadFile.mockResolvedValue(undefined); mocked.upload.mockResolvedValue("package");
  plan = { archive: new File(["archive"], "A0054.zip"), files: [], drawingChoices: [], partChoices: [], fileCount: 4 };
  mocked.prepare.mockImplementation(async () => plan);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(downloadHref: string | null = null) {
  await act(async () => root.render(<DrawingWorkspaceUpload base="/packages" code="A0054-M01" compact={false} activePackageId="active-original"
    downloadHref={downloadHref} onBegin={begin} onComplete={complete} onUploadFile={uploadFile} onPendingChange={pending} onPackageBusy={packageBusy} />));
}
async function choose(label = "加入本版檔案", files = [new File(["input"], "A0054.zip")]) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
function button(text: string) { return [...host.querySelectorAll("button")].find(node => node.textContent === text)!; }
describe("unified drawing upload", () => {
  it("has one entry, supports a directory chooser, and uploads immediately after selection", async () => {
    await render(); expect(host.textContent).not.toContain("上傳組立包"); expect(host.textContent).not.toContain("上傳所選檔案");
    expect(host.querySelector('input[webkitdirectory]')).not.toBeNull(); expect(host.querySelector<HTMLInputElement>('input[aria-label="加入本版檔案"]')!.multiple).toBe(true);
    await choose(); expect(begin).toHaveBeenCalledOnce(); expect(mocked.upload).toHaveBeenCalledOnce(); expect(complete).toHaveBeenCalledOnce();
    expect(mocked.upload.mock.calls[0][2]).toBe("active-original"); expect(pending).toHaveBeenLastCalledWith(false);
  });
  it("keeps folder-relative paths rather than flattening to filenames", async () => {
    const file = new File(["cad"], "主件.SLDASM"); Object.defineProperty(file, "webkitRelativePath", { value: "資料夾/主件.SLDASM" });
    await render(); await choose("加入整個資料夾", [file]);
    expect(mocked.prepare.mock.calls[0][0][0].path).toBe("資料夾/主件.SLDASM");
  });
  it("asks only an ambiguous main-file choice and continues automatically when selected", async () => {
    plan.drawingChoices = [item("one.SLDDRW"), item("two.SLDDRW")];
    await render(); await choose(); expect(begin).not.toHaveBeenCalled(); expect(mocked.upload).not.toHaveBeenCalled();
    const select = host.querySelector("select")!;
    await act(async () => { select.value = "two.SLDDRW"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(mocked.upload).toHaveBeenCalledOnce(); expect(uploadFile).toHaveBeenCalledTimes(1); expect(uploadFile.mock.calls[0][0].name).toBe("two.SLDDRW");
  });
  it("retries only a failed ordinary file while preserving accepted archive and other files", async () => {
    plan.files = [item("one.pdf"), item("two.pdf")];
    uploadFile.mockImplementation(async (file: File) => { if (file.name === "two.pdf") throw new Error("connection failed"); });
    await render(); await choose(); expect(mocked.upload).toHaveBeenCalledOnce(); expect(uploadFile).toHaveBeenCalledTimes(2);
    uploadFile.mockResolvedValue(undefined);
    await act(async () => button("重試未完成項目").click());
    expect(mocked.upload).toHaveBeenCalledOnce(); expect(uploadFile).toHaveBeenCalledTimes(3); expect(uploadFile.mock.calls[2][0].name).toBe("two.pdf");
    expect(pending).toHaveBeenLastCalledWith(false);
  });
  it("keeps archive identity and bytes stable for a transfer retry", async () => {
    mocked.upload.mockRejectedValueOnce(new Error("transfer interrupted"));
    await render(); await choose(); await act(async () => button("重試未完成項目").click());
    expect(mocked.upload).toHaveBeenCalledTimes(2);
    expect(mocked.upload.mock.calls[0][1]).toBe(mocked.upload.mock.calls[1][1]);
    expect(mocked.upload.mock.calls[0][3].idempotencyKey).toBe(mocked.upload.mock.calls[1][3].idempotencyKey);
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it("does not write when supplement source download is denied", async () => {
    mocked.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    await render("/current/download"); await choose("加入本版檔案", [new File(["cad"], "part.SLDPRT")]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("下載權限"); expect(begin).not.toHaveBeenCalled(); expect(mocked.upload).not.toHaveBeenCalled();
  });
  it("shows an invalid folder path in the entry without starting an upload", async () => {
    const file = new File(["cad"], "main.SLDASM"); Object.defineProperty(file, "webkitRelativePath", { value: "folder/../main.SLDASM" });
    await render(); await choose("加入整個資料夾", [file]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("檔案路徑無法使用");
    expect(begin).not.toHaveBeenCalled(); expect(mocked.upload).not.toHaveBeenCalled();
  });
});
