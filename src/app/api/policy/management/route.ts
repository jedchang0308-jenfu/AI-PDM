import path from "node:path";
import { readFile, stat, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";

export const runtime = "nodejs";

const POLICY_SOURCE_PATH = ".ai-doc/reference/pdm-management-policy-draft.md";
const policyFilePath = path.join(process.cwd(), ".ai-doc", "reference", "pdm-management-policy-draft.md");

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  try {
    const [content, metadata] = await Promise.all([
      readFile(policyFilePath, "utf8"),
      stat(policyFilePath)
    ]);

    return NextResponse.json({
      content,
      sourcePath: POLICY_SOURCE_PATH,
      canEdit: auth.authorizationRoleCode === "pdm_admin" || auth.authorizationRoleCode === "system_admin",
      userRole: auth.user.role,
      updatedAt: metadata.mtime.toISOString()
    });
  } catch (error) {
    console.error("POLICY_READ_FAILED", error);
    return NextResponse.json(
      {
        error: "POLICY_READ_FAILED",
        message: "管理辦法讀取失敗，請重新整理或通知系統管理員。"
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  let body: { content?: unknown };
  try {
    body = (await request.json()) as { content?: unknown };
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_JSON",
        message: "管理辦法未儲存：請送出有效的 JSON 內容。"
      },
      { status: 400 }
    );
  }

  if (typeof body.content !== "string" || body.content.trim().length < 100) {
    return NextResponse.json(
      {
        error: "INVALID_POLICY_CONTENT",
        message: "管理辦法未儲存：內容太短或格式不正確。"
      },
      { status: 400 }
    );
  }

  if (body.content.length > 200_000) {
    return NextResponse.json(
      {
        error: "POLICY_CONTENT_TOO_LARGE",
        message: "管理辦法未儲存：內容超過目前系統限制。"
      },
      { status: 413 }
    );
  }

  try {
    const normalized = body.content.endsWith("\n") ? body.content : `${body.content}\n`;
    await writeFile(policyFilePath, normalized, "utf8");
    const metadata = await stat(policyFilePath);

    return NextResponse.json({
      content: normalized,
      sourcePath: POLICY_SOURCE_PATH,
      canEdit: true,
      userRole: auth.user.role,
      updatedAt: metadata.mtime.toISOString()
    });
  } catch (error) {
    console.error("POLICY_WRITE_FAILED", error);
    return NextResponse.json(
      {
        error: "POLICY_WRITE_FAILED",
        message: "管理辦法未儲存：寫入失敗，請確認伺服器檔案權限或通知系統管理員。"
      },
      { status: 500 }
    );
  }
}
