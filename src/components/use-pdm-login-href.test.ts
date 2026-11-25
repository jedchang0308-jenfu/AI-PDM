import {describe,it,expect} from "vitest";
import {pdmLoginHref} from "./use-pdm-login-href";
describe("native login destination",()=>{
  it("preserves the original path, query and fragment",()=>{
    const href=pdmLoginHref("/numbering/drawings","?dev015=return-check","#selected");
    expect(new URL(href,"http://localhost").searchParams.get("returnTo")).toBe("/numbering/drawings?dev015=return-check#selected");
  });
  it.each(["//external.example/","/login","/api/auth/me","/bad\\path","/bad\u0000path","/"+"x".repeat(1024)])("keeps unsafe or recursive destination %s at local login",path=>{
    expect(pdmLoginHref(path)).toBe("/login");
  });
});
