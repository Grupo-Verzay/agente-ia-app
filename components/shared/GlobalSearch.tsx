"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bot,
  CheckSquare,
  FileText,
  MessageCircle,
  Package,
  Search,
  UserRound,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  globalSearchAction,
  type GlobalSearchKind,
  type GlobalSearchResult,
} from "@/actions/global-search-actions";
import { cn } from "@/lib/utils";

const KIND_META: Record<GlobalSearchKind, { label: string; Icon: typeof Search; color: string }> = {
  client: { label: "Clientes", Icon: UserRound, color: "text-blue-600" },
  note: { label: "Notas", Icon: FileText, color: "text-violet-600" },
  task: { label: "Tareas", Icon: CheckSquare, color: "text-amber-600" },
  product: { label: "Productos", Icon: Package, color: "text-emerald-600" },
  conversation: { label: "Conversaciones", Icon: MessageCircle, color: "text-cyan-600" },
  workflow: { label: "Flujos", Icon: Bot, color: "text-fuchsia-600" },
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearchAction(trimmed);
        setResults(res.success ? res.data : []);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  const grouped = useMemo(() => {
    return results.reduce<Record<GlobalSearchKind, GlobalSearchResult[]>>((acc, item) => {
      acc[item.kind] = [...(acc[item.kind] ?? []), item];
      return acc;
    }, {} as Record<GlobalSearchKind, GlobalSearchResult[]>);
  }, [results]);

  const hasQuery = query.trim().length >= 2;
  const hasResults = results.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-9 justify-center px-0 sm:w-64 sm:justify-start sm:px-3"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="ml-2 hidden truncate text-sm text-muted-foreground sm:inline">Buscar en la app...</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="top-[12%] max-w-lg translate-y-0 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Busqueda global</DialogTitle>
        </DialogHeader>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar clientes, notas, tareas, productos, chats o flujos..."
              className="h-9 border-0 bg-muted/50 pl-8 shadow-none focus-visible:ring-0"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {!hasQuery && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Escribe al menos 2 caracteres para buscar.
            </div>
          )}
          {hasQuery && isPending && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          )}
          {hasQuery && !isPending && !hasResults && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No se encontraron resultados.
            </div>
          )}
          {hasResults && (
            <div className="py-2">
              {(Object.keys(grouped) as GlobalSearchKind[]).map((kind) => {
                const items = grouped[kind];
                if (!items?.length) return null;
                const meta = KIND_META[kind];
                return (
                  <div key={kind} className="py-1">
                    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </p>
                    {items.map((item) => {
                      const Icon = meta.Icon;
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Icon className={cn("h-4 w-4", meta.color)} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.title}</span>
                            {item.description && (
                              <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

