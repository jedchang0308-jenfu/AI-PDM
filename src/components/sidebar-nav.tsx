"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardCheck, Factory, LogIn, Settings, UploadCloud } from "lucide-react";

const navItems = [
  { href: "/", label: "圖面資料庫", icon: ClipboardCheck, exact: true },
  { href: "/upload", label: "檔案送審", icon: UploadCloud },
  { href: "/handoff", label: "製造交接", icon: Factory },
  { href: "/settings", label: "系統設定", icon: Settings },
  { href: "/login", label: "登入", icon: LogIn }
];

export function SidebarNav() {
  const pathname = usePathname() || "/";

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Boxes size={19} aria-hidden="true" />
        </span>
        <span>AI PDM</span>
      </div>
      <nav className="nav" aria-label="主要導覽">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link className={active ? "active" : undefined} href={item.href} aria-current={active ? "page" : undefined} key={item.href}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
