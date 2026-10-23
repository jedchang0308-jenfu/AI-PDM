import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {DrawingRecognitionError} from "@/lib/drawing-recognition-contract";

const mocks=vi.hoisted(()=>({access:vi.fn(),latest:vi.fn(),projection:vi.fn(),handoff:vi.fn(),database:vi.fn(),contract:vi.fn()}));
vi.mock("@/lib/platform-command-context",()=>({requireNumberingPlatformCommandAsync:mocks.access}));
vi.mock("@/lib/drawing-recognition",()=>({getLatestDrawingRecognitionForDrawing:mocks.latest,getDrawingRecognitionProjection:mocks.projection}));
vi.mock("@/lib/drawing-recognition-part-work-handoff",()=>({getDrawingRecognitionPartWorkHandoffProjection:mocks.handoff}));
vi.mock("@/lib/db-async-provider",()=>({getAsyncDatabaseClient:mocks.database}));
vi.mock("@/lib/pdm-workbench-authority-control",()=>({issueCanonicalWorkbenchContract:mocks.contract}));
vi.mock("@/lib/number-state-flow-feature",()=>({drawingRecognitionClientStatus:()=>({enabled:true})}));

import {GET as latest} from "@/app/api/numbering/drawings/[drawingNumber]/recognition-session/route";
import {GET as projection} from "@/app/api/numbering/recognition-sessions/[sessionId]/route";

const sensitive="SELECT secret_column FROM private_table; session=PRIVATE_SESSION; missing-key=PRIVATE_KEY; stack=PRIVATE_STACK";
const safeMessage="辨識服務暫時無法處理此要求。";
const domain=()=>Object.assign(new DrawingRecognitionError("RECOGNITION_READER_UNAVAILABLE",safeMessage,503,true),{
  cause:new Error(sensitive),sql:sensitive,session:sensitive
});
const routes=[
  {name:"latest Drawing recognition",reader:mocks.latest,invoke:()=>latest(new Request("https://ai-pdm.test/api/numbering/drawings/DW-001/recognition-session"),
    {params:Promise.resolve({drawingNumber:"DW-001"})})},
  {name:"recognition session projection",reader:mocks.projection,invoke:()=>projection(new Request("https://ai-pdm.test/api/numbering/recognition-sessions/session-one"),
    {params:Promise.resolve({sessionId:"session-one"})})}
];

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({company:{companyId:"company-one"},actor:{pdmUserId:"profile-one",principalId:"principal-one",roles:["rd"]}});
  vi.spyOn(console,"error").mockImplementation(()=>{});
});
afterEach(()=>vi.restoreAllMocks());

describe("recognition GET error envelopes",()=>{
  for(const route of routes){
    it.each(["domain503","unknown500"] as const)(`${route.name}: %s is private, safe and read-only`,async kind=>{
      route.reader.mockRejectedValueOnce(kind==="domain503"?domain():new Error(sensitive));
      const response=await route.invoke();
      const body=await response.json();
      expect(response.status).toBe(kind==="domain503"?503:500);
      expect(body).toEqual({error:{code:kind==="domain503"?"RECOGNITION_READER_UNAVAILABLE":"RECOGNITION_INTERNAL_ERROR",message:safeMessage,retryable:true}});
      expect(JSON.stringify(body)).not.toMatch(/SELECT|private_table|PRIVATE_SESSION|PRIVATE_KEY|PRIVATE_STACK|missing-key|stack|sql|cause/u);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(mocks.access).toHaveBeenCalledWith(expect.any(Request),{action:"numbering.recognition.review"});
      expect(route.reader).toHaveBeenCalledWith(expect.objectContaining({companyId:"company-one",actorId:"profile-one",principalId:"principal-one",roles:["rd"]}));
      expect(mocks.handoff).not.toHaveBeenCalled();expect(mocks.database).not.toHaveBeenCalled();expect(mocks.contract).not.toHaveBeenCalled();
    });
    it.each([401,403])(`${route.name}: preserves an authentication or permission rejection (%s)`,async status=>{
      mocks.access.mockResolvedValueOnce({response:Response.json({error:status===401?"unauthorized":"permission_not_granted"},{status,headers:{"cache-control":"private, no-store"}})});
      const response=await route.invoke();expect(response.status).toBe(status);expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(route.reader).not.toHaveBeenCalled();expect(mocks.handoff).not.toHaveBeenCalled();
    });
  }
  it("retains the existing successful latest-read envelope",async()=>{
    mocks.latest.mockResolvedValueOnce(null);
    const response=await routes[0].invoke();expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({session:null,feature:{enabled:true}});
  });
});
