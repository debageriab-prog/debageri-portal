"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  permissionTreeFor,
  togglePermission,
  type PermissionKey,
  type PermissionNode,
  type ProfileAudience,
} from "@/domain/access/permissions";
import type { MessageKey } from "@/lib/localization/messages";

const tips: Partial<Record<PermissionKey, MessageKey>> = {
  "finance.ledger.export": "permissionTip_export",
  "time.reports.export": "permissionTip_timeExport",
  "my.time.export": "permissionTip_timeExport",
};

export const permissionLabel = (key: PermissionKey) =>
  `permission_${key.replaceAll(".", "_")}` as MessageKey;

export const permissionGroupLabel = (id: string) =>
  `permissionGroup_${id}` as MessageKey;

const flatten = (nodes: PermissionNode[]): PermissionKey[] =>
  nodes.flatMap((node) => [node.key, ...flatten(node.children ?? [])]);

function GroupCheckbox({
  label,
  keys,
  selected,
  onChange,
}: {
  label: string;
  keys: PermissionKey[];
  selected: readonly PermissionKey[];
  onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const count = keys.filter((key) => selected.includes(key)).length;
  useEffect(() => {
    if (input.current)
      input.current.indeterminate = count > 0 && count < keys.length;
  }, [count, keys.length]);
  return (
    <label className="checkbox-row">
      <input
        ref={input}
        type="checkbox"
        checked={count === keys.length}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>{label}</strong>
      </span>
    </label>
  );
}

export function PermissionTree({
  audience,
  selected,
  onChange,
}: {
  audience: ProfileAudience;
  selected: readonly PermissionKey[];
  onChange: (next: PermissionKey[]) => void;
}) {
  const { t } = useLocale();

  function renderNodes(nodes: PermissionNode[]) {
    return nodes.map((node) => (
      <div key={node.key}>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={selected.includes(node.key)}
            onChange={(event) =>
              onChange(
                togglePermission(
                  selected,
                  node.key,
                  event.target.checked,
                  audience,
                ),
              )
            }
          />
          <span>{t(permissionLabel(node.key))}</span>
          {tips[node.key] && <InfoTip text={t(tips[node.key]!)} />}
        </label>
        {node.children?.length ? (
          <div className="access-children">{renderNodes(node.children)}</div>
        ) : null}
      </div>
    ));
  }

  return (
    <div className="editor-access-groups">
      {permissionTreeFor(audience).map((group) => {
        const keys = flatten(group.nodes);
        return (
          <fieldset className="access-section" key={group.id}>
            <legend>{t(permissionGroupLabel(group.id))}</legend>
            <GroupCheckbox
              label={t("selectAll")}
              keys={keys}
              selected={selected}
              onChange={(checked) =>
                onChange(
                  checked
                    ? Array.from(new Set([...selected, ...keys]))
                    : selected.filter((key) => !keys.includes(key)),
                )
              }
            />
            <div className="access-children">{renderNodes(group.nodes)}</div>
          </fieldset>
        );
      })}
    </div>
  );
}

/** Read-only view of what a profile grants, for the employee editor. */
export function PermissionSummary({
  audience,
  permissions,
}: {
  audience: ProfileAudience;
  permissions: readonly PermissionKey[];
}) {
  const { t } = useLocale();
  const groups = permissionTreeFor(audience)
    .map((group) => ({
      id: group.id,
      keys: flatten(group.nodes).filter((key) => permissions.includes(key)),
    }))
    .filter((group) => group.keys.length > 0);
  if (!groups.length)
    return <p className="muted">{t("accessProfileGrantsNothing")}</p>;
  return (
    <div className="permission-summary">
      {groups.map((group) => (
        <div key={group.id}>
          <strong>{t(permissionGroupLabel(group.id))}</strong>
          <ul>
            {group.keys.map((key) => (
              <li key={key}>{t(permissionLabel(key))}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
