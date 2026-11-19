import { describe,expect,it } from "vitest";
import { uploadAssemblyPackage } from "./assembly-package-upload-client";

describe("one file selection uploads and finalizes a package",()=>{
  it("resumes at the confirmed offset after a lost chunk reply and reads back an accepted finalize",async()=>{
    const file=new File(["012345678"],"assembly.zip");
    const bytes:number[]=[];
    const calls:string[]=[];
    let accepted=false,first=true;
    const fetcher:typeof fetch=async(input,init)=>{
      const url=String(input);
      const method=init?.method??"GET";
      calls.push(method+" "+url);
      const summary=()=>Response.json({data:{packageId:"package-1",fileName:file.name,
        nextOffset:bytes.length,chunkBytes:4,status:accepted?"queued":"uploading"}});
      if (url==="/packages" && method==="POST") return summary();
      if (url==="/packages/package-1" && method==="GET") return summary();
      if (url.endsWith("/content")) {
        const blob=init!.body as Blob;
        expect(new Headers(init!.headers).get("content-range")).toBe(`bytes ${bytes.length}-${bytes.length+blob.size-1}/9`);
        bytes.push(...new Uint8Array(await blob.arrayBuffer()));
        if(first) {first=false;throw new TypeError("lost acknowledgement");}
        return Response.json({nextOffset:bytes.length});
      }
      if(url.endsWith("/finalize")){accepted=true;throw new TypeError("connection closed after accept");}
      throw new Error("unexpected call");
    };
    expect(await uploadAssemblyPackage("/packages",file,null,{fetcher})).toBe("package-1");
    expect(Buffer.from(bytes).toString()).toBe("012345678");
    expect(calls.filter(c=>c==="POST /packages")).toHaveLength(1);
    expect(calls.filter(c=>c.endsWith("/finalize"))).toHaveLength(1);
  });
  it("stops immediately on revoked access",async()=>{
    let calls=0;
    const fetcher:typeof fetch=async()=>{calls++;return Response.json({error:{message:"權限不足"}},{status:403});};
    await expect(uploadAssemblyPackage("/packages",new File(["x"],"a.zip"),null,{fetcher})).rejects.toThrow("權限不足");
    expect(calls).toBe(1);
  });
});
