"use client";

import { Archive, Inbox, Trash2, Users } from "lucide-react";
import type { TabConfig, TabCounts, TabKey } from "./chat-sidebar.types";

type ChatTabBarProps = {
  onTabChange: (tab: TabKey) => void;
  tab: TabKey;
  tabCounts: TabCounts;
};

const TAB_CONFIG: Omit<TabConfig, "count">[] = [
  { key: "all",      label: "Todos",  Icon: Inbox,   color: "#007BFF" },
  { key: "groups",   label: "Grupos", Icon: Users,   color: "#28A745" },
  { key: "archived", label: "Arch.",  Icon: Archive, color: "#6C757D" },
  { key: "deleted",  label: "Elim.",  Icon: Trash2,  color: "#DC3545" },
];

export function ChatTabBar({ onTabChange, tab, tabCounts }: ChatTabBarProps) {
  return (
    <div className="flex flex-row gap-1 justify-between overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TAB_CONFIG.map(({ key, label, Icon, color }) => {
        const count = tabCounts[key];
        const isActive = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-all"
            style={
              isActive
                ? { background: color, borderColor: color, color: "#fff" }
                : { borderColor: `${color}50`, color, background: `${color}10` }
            }
          >
            {Icon && <Icon className="h-3 w-3 shrink-0" />}
            <span>{label}</span>
            {count > 0 && (
              <span
                className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
                style={{ background: isActive ? "rgba(255,255,255,0.3)" : color }}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
