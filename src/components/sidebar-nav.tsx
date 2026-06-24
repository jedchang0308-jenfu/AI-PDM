"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileText,
  FileUp,
  GitPullRequestArrow,
  ListTree,
  LogIn,
  PackageSearch,
  Search,
  Settings,
  ShieldAlert,
  UploadCloud
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NUMBERING_NAV_PERMISSION_BY_PATH } from "@/lib/numbering-permission-codes";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "工作台",
    items: [
      { href: "/", label: "工作台", icon: ClipboardCheck, exact: true },
      { href: "/numbering/tasks", label: "我的待辦", icon: Bell }
    ]
  },
  {
    label: "專案 / 圖料",
    items: [
      { href: "/numbering/search", label: "圖料模組", icon: Search },
      { href: "/numbering/drawings", label: "圖號模組", icon: FileText },
      { href: "/parts", label: "料號模組", icon: PackageSearch },
      { href: "/numbering/part-drafts", label: "料號草稿", icon: ClipboardList },
      { href: "/upload", label: "上傳送審", icon: UploadCloud },
      { href: "/numbering/request", label: "領號申請", icon: ClipboardList },
      { href: "/numbering/imports", label: "圖號總表匯入", icon: FileUp }
    ]
  },
  {
    label: "BOM",
    items: [
      { href: "/bom/workbench", label: "BOM 工作台", icon: ListTree },
      { href: "/bom/reviews", label: "BOM 審核", icon: ClipboardCheck }
    ]
  },
  {
    label: "變更 / 審核",
    items: [
      { href: "/numbering/revisions", label: "圖面進版", icon: GitPullRequestArrow },
      { href: "/numbering/dvt", label: "DVT 晉升", icon: GitPullRequestArrow },
      { href: "/numbering/approvals", label: "發行審核", icon: ClipboardCheck },
      { href: "/numbering/change-reviews", label: "變更審核", icon: ClipboardCheck },
      { href: "/numbering/impact", label: "MA 影響分析", icon: ShieldAlert }
    ]
  },
  {
    label: "發行 / 交接",
    items: [
      { href: "/handoff", label: "製造交接", icon: Factory },
      { href: "/numbering/reports", label: "圖號報表", icon: FileText }
    ]
  },
  {
    label: "管理",
    items: [
      { href: "/settings", label: "系統設定", icon: Settings },
      { href: "/login", label: "登入", icon: LogIn }
    ]
  }
];

function isVisibleItem(item: NavItem, pagePermissions: Record<string, boolean> | null) {
  const requiredPermission = NUMBERING_NAV_PERMISSION_BY_PATH[item.href];
  return !requiredPermission || !pagePermissions || pagePermissions[requiredPermission];
}

export function SidebarNav() {
  const pathname = usePathname() || "/";
  const [pagePermissions, setPagePermissions] = useState<Record<string, boolean> | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/numbering/permissions")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { pages?: Record<string, boolean> } | null) => {
        if (!cancelled && body?.pages) setPagePermissions(body.pages);
      })
      .catch(() => {
        if (!cancelled) setPagePermissions(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("ai-pdm-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    window.localStorage.setItem("ai-pdm-sidebar-collapsed", String(collapsed));
    return () => {
      document.body.classList.remove("sidebar-collapsed");
    };
  }, [collapsed]);

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="brand">
        <span className="brand-mark">
          <Boxes size={19} aria-hidden="true" />
        </span>
        <span className="brand-name">AI PDM</span>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={collapsed ? "展開左側導覽" : "收合左側導覽"}
          title={collapsed ? "展開左側導覽" : "收合左側導覽"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronLeft size={17} aria-hidden="true" />}
        </button>
      </div>
      <nav className="nav" aria-label="主導覽">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => isVisibleItem(item, pagePermissions));
          if (visibleItems.length === 0) return null;

          return (
            <div className="nav-section" key={section.label}>
              <span className="nav-section-label">{section.label}</span>
              <div className="nav-section-items">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link className={active ? "active" : undefined} href={item.href} aria-current={active ? "page" : undefined} title={item.label} key={item.href}>
                      <Icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
