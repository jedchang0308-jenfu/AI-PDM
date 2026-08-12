"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  ClipboardCheck,
  Factory,
  FileText,
  GitPullRequestArrow,
  KeyRound,
  ListTree,
  ListPlus,
  LogIn,
  Menu,
  PackageSearch,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NUMBERING_NAV_PERMISSION_BY_PATH } from "@/lib/numbering-permission-codes";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: "approvalPending";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type ProductionSliceClientStatus = {
  configured: boolean;
  active: boolean;
  openPagePaths: string[];
  unopenedMessage: string;
};

type SidebarUser = {
  display_name: string;
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
    label: "圖料管理",
    items: [
      { href: "/numbering/search", label: "圖料模組", icon: Search },
      { href: "/numbering/drawings", label: "圖號模組", icon: FileText },
      { href: "/parts", label: "料號模組", icon: PackageSearch },
    ]
  },
  {
    label: "BOM",
    items: [
      { href: "/bom/new", label: "建立 BOM", icon: ListPlus },
      { href: "/bom/workbench", label: "BOM 工作台", icon: ListTree },
      { href: "/approvals?domain=bom", label: "BOM 審核", icon: CircleCheckBig, badge: "approvalPending" }
    ]
  },
  {
    label: "變更 / 審核",
    items: [
      { href: "/numbering/revisions", label: "圖面進版", icon: GitPullRequestArrow },
      { href: "/approvals", label: "審核工作台", icon: CircleCheckBig, badge: "approvalPending" },
      { href: "/numbering/impact", label: "製造圖影響分析", icon: ShieldAlert }
    ]
  },
  {
    label: "發行 / 交接",
    items: [
      { href: "/technical-transfer", label: "技術移轉", icon: Factory },
      { href: "/numbering/reports", label: "圖號報表", icon: FileText }
    ]
  },
  {
    label: "管理",
    items: [
      { href: "/policy", label: "管理辦法", icon: FileText },
      { href: "/privacy", label: "隱私與資料使用", icon: ShieldCheck, exact: true },
      { href: "/account/security", label: "我的帳號安全", icon: KeyRound },
      { href: "/settings/accounts", label: "帳號與權限", icon: UserCog },
      { href: "/settings", label: "系統設定", icon: Settings },
      { href: "/login", label: "登入", icon: LogIn }
    ]
  }
];

function isVisibleItem(
  item: NavItem,
  pagePermissions: Record<string, boolean> | null,
  productionSlice: ProductionSliceClientStatus | null
) {
  if (productionSlice?.configured) return true;
  const requiredPermission = NUMBERING_NAV_PERMISSION_BY_PATH[item.href];
  return !requiredPermission || !pagePermissions || pagePermissions[requiredPermission];
}

function isOpenInProductionSlice(item: NavItem, productionSlice: ProductionSliceClientStatus | null) {
  if (!productionSlice?.configured) return true;
  return productionSlice.openPagePaths.includes(item.href);
}

export function SidebarNav() {
  const pathname = usePathname() || "/";
  const publicAuthPage = pathname === "/login" || pathname.startsWith("/invite/") || pathname.startsWith("/account-recovery") || pathname.startsWith("/account-invitation/") || pathname.startsWith("/privacy");
  const [pagePermissions, setPagePermissions] = useState<Record<string, boolean> | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number | null>(null);
  const [productionSlice, setProductionSlice] = useState<ProductionSliceClientStatus | null>(null);
  const [currentUser, setCurrentUser] = useState<SidebarUser | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (publicAuthPage) {
      setPendingApprovalCount(null);
      return;
    }
    let cancelled = false;
    fetch("/api/production-slice/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ProductionSliceClientStatus | null) => {
        if (!cancelled && body?.configured) setProductionSlice(body);
      })
      .catch(() => {
        if (!cancelled) setProductionSlice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicAuthPage]);

  useEffect(() => {
    const canViewApprovals = pagePermissions?.["numbering.approvals"] === true;
    if (publicAuthPage || !canViewApprovals) {
      setPendingApprovalCount(null);
      return;
    }
    let cancelled = false;
    const loadPendingApprovalCount = () => {
      fetch("/api/approvals/inbox?status=pending&limit=100")
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { summary?: { pending?: number }; items?: unknown[] } | null) => {
          if (cancelled) return;
          const pending = typeof body?.summary?.pending === "number" ? body.summary.pending : body?.items?.length ?? 0;
          setPendingApprovalCount(pending);
        })
        .catch(() => {
          if (!cancelled) setPendingApprovalCount(null);
        });
    };
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") loadPendingApprovalCount();
    };

    loadPendingApprovalCount();
    window.addEventListener("approval-inbox-changed", loadPendingApprovalCount);
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("approval-inbox-changed", loadPendingApprovalCount);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [pagePermissions, publicAuthPage]);

  useEffect(() => {
    if (publicAuthPage) {
      setPagePermissions(null);
      return;
    }
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
  }, [publicAuthPage]);

  useEffect(() => {
    if (publicAuthPage) {
      setCurrentUser(null);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: SidebarUser } | null) => {
        if (!cancelled) setCurrentUser(body?.user?.display_name ? body.user : null);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicAuthPage]);

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
          className="sidebar-toggle sidebar-toggle-desktop"
          type="button"
          aria-label={collapsed ? "展開左側導覽" : "收合左側導覽"}
          title={collapsed ? "展開左側導覽" : "收合左側導覽"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight size={17} aria-hidden="true" /> : <ChevronLeft size={17} aria-hidden="true" />}
        </button>
        <button
          className="sidebar-toggle sidebar-toggle-mobile"
          type="button"
          aria-controls="primary-navigation"
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? "收合主導覽" : "展開主導覽"}
          title={mobileNavOpen ? "收合主導覽" : "展開主導覽"}
          onClick={() => setMobileNavOpen((value) => !value)}
        >
          {mobileNavOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </div>
      <nav id="primary-navigation" className={mobileNavOpen ? "nav mobile-open" : "nav"} aria-label="主導覽">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => isVisibleItem(item, pagePermissions, productionSlice));
          if (visibleItems.length === 0) return null;

          return (
            <div className="nav-section" key={section.label}>
              <span className="nav-section-label">{section.label}</span>
              <div className="nav-section-items">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const signedInEntry = item.href === "/login" && currentUser;
                  const label = signedInEntry ? currentUser.display_name : item.label;
                  const active = hydrated && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
                  const badgeCount = item.badge === "approvalPending" ? pendingApprovalCount : null;
                  const hasBadge = typeof badgeCount === "number" && badgeCount > 0;
                  const unopened = !isOpenInProductionSlice(item, productionSlice);
                  const targetHref = unopened ? `/production-slice-blocked?from=${encodeURIComponent(item.href)}` : item.href;
                  const itemTitle = unopened
                    ? `${label}，未開放：${productionSlice?.unopenedMessage ?? "此功能未納入本次開放。"}`
                    : signedInEntry
                      ? `${currentUser.display_name}，已登入`
                    : hasBadge
                      ? `${label}，${badgeCount} 件待審`
                      : label;
                  const className = [active ? "active" : "", unopened ? "nav-unopened" : ""].filter(Boolean).join(" ") || undefined;

                  return (
                    <Link
                      className={className}
                      href={targetHref}
                      aria-current={active ? "page" : undefined}
                      aria-disabled={unopened ? true : undefined}
                      aria-label={itemTitle}
                      title={itemTitle}
                      key={item.href}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span className="nav-link-label">{label}</span>
                      {signedInEntry ? <span className="nav-account-status">已登入</span> : null}
                      {unopened ? <span className="nav-unopened-badge">未開放</span> : null}
                      {hasBadge ? <span className="nav-badge">{badgeCount > 99 ? "99+" : badgeCount}</span> : null}
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
