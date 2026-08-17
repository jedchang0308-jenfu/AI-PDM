"use client";

import {
  Braces,
  ChevronDown,
  CirclePlus,
  Focus,
  GitBranch,
  ListTree,
  MoreHorizontal,
  PanelRight,
  Redo2,
  Save,
  Undo2
} from "lucide-react";

type ToolbarProps = {
  mutable: boolean;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  inspectorOpen: boolean;
  focused: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTopic: () => void;
  onSubtopic: () => void;
  onInsert: () => void;
  onToggleFold: () => void;
  onToggleFocus: () => void;
  onSave: () => void;
  onToggleInspector: () => void;
  onToggleMore: () => void;
};

export function XmindBomToolbar(props: ToolbarProps) {
  return (
    <div className="xmind-bom-toolbar" role="toolbar" aria-label="BOM 編輯工具列">
      <ToolbarButton label="復原" shortcut="Ctrl+Z" icon={<Undo2 />} disabled={!props.canUndo || props.saving} onClick={props.onUndo} />
      <ToolbarButton label="重做" shortcut="Ctrl+Shift+Z" icon={<Redo2 />} disabled={!props.canRedo || props.saving} onClick={props.onRedo} />
      <ToolbarButton label="主題" shortcut="Enter" icon={<CirclePlus />} disabled={!props.mutable || props.saving} onClick={props.onTopic} />
      <ToolbarButton label="子主題" shortcut="Tab" icon={<GitBranch />} disabled={!props.mutable || props.saving} onClick={props.onSubtopic} />
      <ToolbarButton label="插入" icon={<Braces />} disabled={!props.mutable || props.saving} onClick={props.onInsert} trailing={<ChevronDown />} />
      <ToolbarButton label="摺疊" shortcut="Ctrl+/" icon={<ListTree />} disabled={props.saving} onClick={props.onToggleFold} />
      <ToolbarButton label="專注" shortcut="Ctrl+;" icon={<Focus />} pressed={props.focused} disabled={props.saving} onClick={props.onToggleFocus} />
      <span className="xmind-bom-toolbar-spacer" aria-hidden="true" />
      <ToolbarButton label={props.saving ? "儲存中" : props.dirty ? "儲存" : "已儲存"} shortcut="Ctrl+S" icon={<Save />} primary={props.dirty} disabled={!props.dirty || props.saving} onClick={props.onSave} />
      <ToolbarButton label="詳細資料" icon={<PanelRight />} pressed={props.inspectorOpen} onClick={props.onToggleInspector} />
      <ToolbarButton label="更多" icon={<MoreHorizontal />} onClick={props.onToggleMore} />
    </div>
  );
}

function ToolbarButton({
  label,
  shortcut,
  icon,
  trailing,
  disabled,
  pressed,
  primary,
  onClick
}: {
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`xmind-bom-toolbar-button${primary ? " primary" : ""}`}
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      <span className="xmind-bom-toolbar-icon" aria-hidden="true">{icon}</span>
      <span className="xmind-bom-toolbar-label">{label}</span>
      {trailing ? <span className="xmind-bom-toolbar-trailing" aria-hidden="true">{trailing}</span> : null}
    </button>
  );
}
