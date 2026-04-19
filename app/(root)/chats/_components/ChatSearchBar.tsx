"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

type ChatSearchBarProps = {
  onClear: () => void;
  onChange: (value: string) => void;
  value: string;
};

export function ChatSearchBar({ onClear, onChange, value }: ChatSearchBarProps) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="shrink-0 text-sm font-bold tracking-tight text-foreground">Chats</span>
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar..."
          className="h-8 rounded-full pl-7 pr-7 text-xs"
          aria-label="Buscar chats"
        />
        {value && (
          <button
            type="button"
            aria-label="Limpiar busqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
