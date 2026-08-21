export function retiredWorkbenchCommandResponse() {
  return Response.json(
    {
      error: {
        code: "WORKBENCH_COMMAND_CONTRACT_RETIRED",
        message: "這個舊工作資料入口已停用，請回到目前工作臺重新操作。"
      }
    },
    {
      status: 410,
      headers: {
        "cache-control": "private, no-store",
        "x-pdm-workbench-authority": "canonical_only"
      }
    }
  );
}
