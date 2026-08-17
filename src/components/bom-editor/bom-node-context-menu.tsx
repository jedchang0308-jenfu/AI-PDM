"use client";

import { useEffect, useRef } from "react";

type ContextMenuProps = {
  x: number;
  y: number;
  mutable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onEdit: () => void;
  onTopic: () => void;
  onSubtopic: () => void;
  onParentTopic: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDeleteOnly: () => void;
  onDeleteBranch: () => void;
};

export function BomNodeContextMenu(props: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const close = () => props.onClose();
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [props]);

  return (
    <div
      ref={ref}
      className="xmind-bom-context-menu"
      role="menu"
      tabIndex={-1}
      style={{ left: props.x, top: props.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onClose();
      }}
    >
      <MenuItem label="編輯" shortcut="Space" disabled={!props.mutable} onClick={props.onEdit} />
      <MenuItem label="主題" shortcut="Enter" disabled={!props.mutable} onClick={props.onTopic} />
      <MenuItem label="子主題" shortcut="Tab" disabled={!props.mutable} onClick={props.onSubtopic} />
      <MenuItem label="父主題" shortcut="Ctrl+Enter" disabled={!props.mutable} onClick={props.onParentTopic} />
      <div className="xmind-bom-menu-separator" role="separator" />
      <MenuItem label="向上移動" shortcut="Alt+↑" disabled={!props.mutable || !props.canMoveUp} onClick={props.onMoveUp} />
      <MenuItem label="向下移動" shortcut="Alt+↓" disabled={!props.mutable || !props.canMoveDown} onClick={props.onMoveDown} />
      <div className="xmind-bom-menu-separator" role="separator" />
      <MenuItem label="僅刪除主題" shortcut="Ctrl+Delete" disabled={!props.mutable} onClick={props.onDeleteOnly} />
      <MenuItem label="刪除分支" shortcut="Delete" danger disabled={!props.mutable} onClick={props.onDeleteBranch} />
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  disabled,
  danger,
  onClick
}: {
  label: string;
  shortcut: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={danger ? "danger" : ""}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClick();
      }}
    >
      <span>{label}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}
