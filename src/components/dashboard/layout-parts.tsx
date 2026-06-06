import { memo, type ReactNode, type RefObject } from "react";
import { Bell, Eye, MessageSquare, Send, Star, X } from "lucide-react";
import { NextStepState } from "@/components/next-step-state";
import type { NotificationItem, NotificationSummary, SubmissionStatus, SubmissionSummary } from "@/lib/types";

export type ChatSource = {
  type: "submission" | "metric" | "policy" | "file" | "bom" | "where_used";
  label: string;
  detail: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

type StatusLabels = Record<SubmissionStatus | "All", string>;

type DashboardComponentBoundaryProps = {
  children: ReactNode;
};

function DashboardComponentBoundary({ children }: DashboardComponentBoundaryProps) {
  return <div className="dashboard-component-boundary">{children}</div>;
}

export function FinderToolbar({ children }: DashboardComponentBoundaryProps) {
  return <DashboardComponentBoundary>{children}</DashboardComponentBoundary>;
}

type NotificationDropdownProps = {
  notificationDropdownRef: RefObject<HTMLDetailsElement | null>;
  notificationSummary: NotificationSummary;
  notifications: NotificationItem[];
  onOpenNotification: (notification: NotificationItem) => void;
};

export function NotificationDropdown({
  notificationDropdownRef,
  notificationSummary,
  notifications,
  onOpenNotification
}: NotificationDropdownProps) {
  return (
    <DashboardComponentBoundary>
      <details className="panel notification-center compact-notifications" ref={notificationDropdownRef}>
        <summary className="panel-header" aria-label="通知中心與風險提醒">
          <h2>
            <Bell size={16} aria-hidden="true" /> 通知中心
          </h2>
          <span className={notificationSummary.critical > 0 ? "notification-count critical" : "notification-count"}>
            {notificationSummary.total} 則
          </span>
        </summary>
        {notifications.length === 0 ? (
          <NextStepState
            compact
            eyebrow="通知"
            title="目前沒有待處理通知"
            body="可先回待辦中心查看已處理項目，或從圖料模組追蹤特定物件。"
            actions={[
              { href: "/numbering/tasks", label: "待辦中心", variant: "primary" },
              { href: "/numbering/search", label: "查圖料" }
            ]}
          />
        ) : (
          <div className="notification-list">
            {notifications.slice(0, 6).map((notification) => (
              <button
                className={`notification-item ${notification.severity}`}
                type="button"
                key={notification.id}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  onOpenNotification(notification);
                }}
                title="開啟對應圖面明細"
              >
                <span>{notification.title}</span>
                <strong>{notification.message}</strong>
                <small>{new Date(notification.created_at).toLocaleString()}</small>
              </button>
            ))}
          </div>
        )}
      </details>
    </DashboardComponentBoundary>
  );
}

type VirtualSubmissionTable = {
  rows: SubmissionSummary[];
  topHeight: number;
  bottomHeight: number;
  renderedCount: number;
};

type SubmissionTableProps = {
  loading: boolean;
  visibleSubmissions: SubmissionSummary[];
  virtualTable: VirtualSubmissionTable;
  selectedId: string | null;
  favoriteDrawings: Array<{ id: string }>;
  submissionTableWrapRef: RefObject<HTMLDivElement | null>;
  isSubmissionTransitionPending: boolean;
  hasMoreSubmissions: boolean;
  loadingMoreSubmissions: boolean;
  statusLabels: StatusLabels;
  formatFileAvailability: (submission: SubmissionSummary) => string;
  latestActivityAt: (submission: SubmissionSummary) => string;
  onScrollTopChange: (scrollTop: number) => void;
  onSelect: (id: string) => void;
  onToggleFavorite: (submission: SubmissionSummary) => void;
  onLoadMore: () => void;
};

type SubmissionRowProps = {
  submission: SubmissionSummary;
  selected: boolean;
  favorite: boolean;
  statusLabels: StatusLabels;
  formatFileAvailability: (submission: SubmissionSummary) => string;
  latestActivityAt: (submission: SubmissionSummary) => string;
  onSelect: (id: string) => void;
  onToggleFavorite: (submission: SubmissionSummary) => void;
};

const SubmissionRow = memo(function SubmissionRow({
  submission,
  selected,
  favorite,
  statusLabels,
  formatFileAvailability,
  latestActivityAt,
  onSelect,
  onToggleFavorite
}: SubmissionRowProps) {
  return (
    <tr key={submission.id} className={selected ? "selected-row" : undefined} aria-selected={selected} onClick={() => onSelect(submission.id)}>
      <td>
        <strong className="identity-primary">{submission.drawing_number}</strong>
      </td>
      <td>
        <span className="metadata-value">{submission.part_number}</span>
      </td>
      <td>
        <span className="metadata-value">{submission.part_name}</span>
      </td>
      <td>
        <span className="metadata-badge">Rev {submission.revision}</span>
      </td>
      <td>
        <span className={`badge ${submission.status}`}>{statusLabels[submission.status]}</span>
      </td>
      <td>
        <span className="metadata-badge">{formatFileAvailability(submission)}</span>
      </td>
      <td>
        <span className="metadata-pair">
          <span className="metadata-label">更新</span>
          <span className="metadata-value">{new Date(latestActivityAt(submission)).toLocaleString()}</span>
        </span>
      </td>
      <td>
        <button
          className={favorite ? "icon-button favorite active" : "icon-button favorite"}
          type="button"
          title="收藏圖面"
          aria-label={`收藏 ${submission.drawing_number}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(submission);
          }}
        >
          <Star size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title="開啟圖面"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(submission.id);
          }}
        >
          <Eye size={14} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
});

export function SubmissionTable({
  loading,
  visibleSubmissions,
  virtualTable,
  selectedId,
  favoriteDrawings,
  submissionTableWrapRef,
  isSubmissionTransitionPending,
  hasMoreSubmissions,
  loadingMoreSubmissions,
  statusLabels,
  formatFileAvailability,
  latestActivityAt,
  onScrollTopChange,
  onSelect,
  onToggleFavorite,
  onLoadMore
}: SubmissionTableProps) {
  return (
    <DashboardComponentBoundary>
      <section className="panel">
        <div className="panel-header">
          <h2>圖面資料</h2>
        </div>
        {loading ? (
          <>
            <div className="table-wrap">
              <SubmissionTableHeader />
            </div>
            <div className="empty">載入中...</div>
          </>
        ) : visibleSubmissions.length === 0 ? (
          <div className="empty">
            <NextStepState
              eyebrow="找不到資料"
              title="目前沒有符合條件的圖面資料"
              body="可放寬篩選條件、建立新送審，或先領號後再補圖面檔案。"
              actions={[
                { href: "/upload", label: "上傳送審", variant: "primary" },
                { href: "/numbering/request", label: "領號申請" }
              ]}
            />
          </div>
        ) : (
          <div
            className="table-wrap virtual-table-wrap"
            ref={submissionTableWrapRef}
            onScroll={(event) => onScrollTopChange(event.currentTarget.scrollTop)}
            data-rendered-rows={virtualTable.renderedCount}
            data-total-rows={visibleSubmissions.length}
            data-transition-pending={isSubmissionTransitionPending}
          >
            <table>
              <SubmissionTableColumns />
              <SubmissionTableHead />
              <tbody>
                {virtualTable.topHeight > 0 ? (
                  <tr className="virtual-spacer" aria-hidden="true">
                    <td colSpan={8} style={{ height: virtualTable.topHeight }} />
                  </tr>
                ) : null}
                {virtualTable.rows.map((submission) => (
                  <SubmissionRow
                    key={submission.id}
                    submission={submission}
                    selected={submission.id === selectedId}
                    favorite={favoriteDrawings.some((drawing) => drawing.id === submission.id)}
                    statusLabels={statusLabels}
                    formatFileAvailability={formatFileAvailability}
                    latestActivityAt={latestActivityAt}
                    onSelect={onSelect}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
                {virtualTable.bottomHeight > 0 ? (
                  <tr className="virtual-spacer" aria-hidden="true">
                    <td colSpan={8} style={{ height: virtualTable.bottomHeight }} />
                  </tr>
                ) : null}
              </tbody>
            </table>
            {hasMoreSubmissions ? (
              <div className="pagination-actions">
                <button className="secondary-button" type="button" onClick={onLoadMore} disabled={loadingMoreSubmissions}>
                  {loadingMoreSubmissions ? "載入中..." : "載入更多"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </DashboardComponentBoundary>
  );
}

function SubmissionTableHeader() {
  return (
    <table>
      <SubmissionTableColumns />
      <SubmissionTableHead />
    </table>
  );
}

function SubmissionTableColumns() {
  return (
    <colgroup>
      <col className="submission-col-drawing" />
      <col className="submission-col-part" />
      <col className="submission-col-name" />
      <col className="submission-col-revision" />
      <col className="submission-col-status" />
      <col className="submission-col-files" />
      <col className="submission-col-activity" />
      <col className="submission-col-actions" />
    </colgroup>
  );
}

function SubmissionTableHead() {
  return (
    <thead>
      <tr>
        <th>圖號</th>
        <th>料號</th>
        <th>品名</th>
        <th>版次</th>
        <th>狀態</th>
        <th>檔案</th>
        <th>最近活動</th>
        <th>動作</th>
      </tr>
    </thead>
  );
}

type SubmissionDetailPanelProps = {
  detailPanelRef: RefObject<HTMLElement | null>;
  isDetailLoading: boolean;
  selectedSummary: SubmissionSummary | null;
  statusLabels: StatusLabels;
  onClose: () => void;
  children: ReactNode;
};

export function SubmissionDetailPanel({
  detailPanelRef,
  isDetailLoading,
  selectedSummary,
  statusLabels,
  onClose,
  children
}: SubmissionDetailPanelProps) {
  return (
    <DashboardComponentBoundary>
      <aside className={isDetailLoading ? "panel detail-panel loading-detail" : "panel detail-panel"} ref={detailPanelRef} aria-busy={isDetailLoading} aria-label="圖面明細覆蓋層">
        <div className="panel-header detail-overlay-header">
          <div className="detail-title-stack">
            <h2>圖面明細</h2>
            {selectedSummary ? (
              <div className="metadata-list detail-title-meta" aria-label="目前選取圖面摘要">
                <span className="metadata-pair">
                  <span className="metadata-label">圖號</span>
                  <span className="metadata-value">{selectedSummary.drawing_number}</span>
                </span>
                <span className="metadata-badge">Rev {selectedSummary.revision}</span>
                <span className="metadata-pair">
                  <span className="metadata-label">料號</span>
                  <span className="metadata-value">{selectedSummary.part_number}</span>
                </span>
                <span className="metadata-pair">
                  <span className="metadata-label">品名</span>
                  <span className="metadata-value">{selectedSummary.part_name}</span>
                </span>
              </div>
            ) : null}
          </div>
          <div className="detail-header-actions">
            {selectedSummary ? <span className={`badge ${selectedSummary.status}`}>{statusLabels[selectedSummary.status]}</span> : null}
            <button className="icon-button detail-close-button" type="button" onClick={onClose} title="關閉明細" aria-label="關閉圖面明細">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        {isDetailLoading ? (
          <div className="detail-loading" data-testid="detail-loading">
            <span>載入圖面明細...</span>
            <div className="detail-skeleton-line" />
            <div className="detail-skeleton-line short" />
          </div>
        ) : null}
        {children}
      </aside>
    </DashboardComponentBoundary>
  );
}

type AssistantPanelProps = {
  chatMessages: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  mobileChatOpen: boolean;
  sourceTypeLabels: Record<string, string>;
  onOpenMobileChat: () => void;
  onCloseMobileChat: () => void;
  onChatInputChange: (value: string) => void;
  onSubmitChat: () => Promise<void>;
};

export function AssistantPanel({
  chatMessages,
  chatInput,
  chatLoading,
  mobileChatOpen,
  sourceTypeLabels,
  onOpenMobileChat,
  onCloseMobileChat,
  onChatInputChange,
  onSubmitChat
}: AssistantPanelProps) {
  return (
    <DashboardComponentBoundary>
      <button
        className="mobile-chat-toggle"
        type="button"
        onClick={onOpenMobileChat}
        aria-label="開啟 AI 助手"
        title="AI 助手"
      >
        <MessageSquare size={18} aria-hidden="true" />
        AI
      </button>

      <section className={`panel chat ${mobileChatOpen ? "mobile-open" : ""}`}>
        <div className="panel-header">
          <h2>
            <MessageSquare size={16} aria-hidden="true" /> AI 助手
          </h2>
          <button
            className="icon-button mobile-chat-close"
            type="button"
            onClick={onCloseMobileChat}
            aria-label="關閉 AI 助手"
            title="關閉"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="chat-messages">
          {chatMessages.map((message, index) => (
            <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
              <div>{message.content}</div>
              {message.role === "assistant" && message.sources && message.sources.length > 0 ? (
                <div className="message-sources" aria-label="資料來源">
                  <strong>來源</strong>
                  <ul>
                    {message.sources.map((source, sourceIndex) => (
                      <li key={`${source.label}-${sourceIndex}`}>
                        <span>{source.label}</span>
                        <small>
                          {sourceTypeLabels[source.type] ?? source.type} - {source.detail}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
          {chatLoading ? <div className="message assistant">思考中...</div> : null}
        </div>
        <div className="chat-form">
          <textarea
            value={chatInput}
            placeholder="輸入問題，例如：目前有哪些待審？"
            onChange={(event) => onChatInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmitChat().catch(console.error);
              }
            }}
          />
          <button className="primary-button" onClick={() => onSubmitChat()} disabled={chatLoading || !chatInput.trim()}>
            <Send size={16} aria-hidden="true" />
            送出
          </button>
        </div>
      </section>
    </DashboardComponentBoundary>
  );
}
