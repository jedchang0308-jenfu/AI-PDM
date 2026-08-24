"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, PackageSearch, RefreshCcw, Search, ShieldAlert } from "lucide-react";

type HomeUser = {
  display_name: string;
  role?: string;
};

type HomeState = "loading" | "ready" | "unauthorized" | "error";

const workbenches = [
  { href: "/numbering/drawings", label: "圖號工作台", icon: FileText },
  { href: "/parts", label: "料號工作台", icon: PackageSearch },
  { href: "/numbering/search", label: "編號搜尋", icon: Search }
];

export function CleanHomeWorkbench() {
  const [state, setState] = useState<HomeState>("loading");

  async function load() {
    setState("loading");
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.status === 401) {
        setState("unauthorized");
        return;
      }
      if (!response.ok) throw new Error("AUTH_READ_FAILED");
      const body = (await response.json()) as { user?: HomeUser };
      setState(body.user ? "ready" : "unauthorized");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (state === "loading") return <main className="clean-home"><p role="status">載入中…</p></main>;

  if (state === "unauthorized") {
    return (
      <main className="clean-home">
        <section className="clean-access" aria-labelledby="clean-access-title">
          <h1 id="clean-access-title">需要登入</h1>
          <Link className="primary-button" href="/login">前往登入</Link>
        </section>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="clean-home">
        <section className="clean-access" aria-labelledby="clean-error-title">
          <h1 id="clean-error-title">無法讀取工作台</h1>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            <RefreshCcw size={16} aria-hidden="true" />
            重試
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="clean-home">
      <header className="clean-home-header">
        <h1>工作台</h1>
      </header>

      <section className="clean-home-section" aria-labelledby="clean-workbench-title">
        <h2 id="clean-workbench-title">圖料資料</h2>
        <div className="clean-workbench-list">
          {workbenches.map(({ href, label, icon: Icon }) => (
            <Link className="clean-workbench-link" href={href} key={href}>
              <Icon size={20} aria-hidden="true" />
              <strong>{label}</strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
