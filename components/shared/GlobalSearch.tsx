"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CheckSquare,
  ChevronRight,
  CreditCard,
  FileText,
  MessageCircle,
  Package,
  PlugZap,
  Plus,
  Settings2,
  Search,
  Mic,
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
import { useSpeechDictation } from "@/hooks/useSpeechDictation";

const KIND_META: Record<GlobalSearchKind, { label: string; Icon: typeof Search; color: string }> = {
  client: { label: "Clientes", Icon: UserRound, color: "text-blue-600" },
  note: { label: "Notas", Icon: FileText, color: "text-violet-600" },
  task: { label: "Tareas", Icon: CheckSquare, color: "text-amber-600" },
  product: { label: "Productos", Icon: Package, color: "text-emerald-600" },
  conversation: { label: "Conversaciones", Icon: MessageCircle, color: "text-cyan-600" },
  workflow: { label: "Flujos", Icon: Bot, color: "text-fuchsia-600" },
};

const QUICK_LINKS = [
  { label: "Clientes", href: "/clientes", Icon: UserRound, description: "Buscar o revisar contactos" },
  { label: "Chats", href: "/chats", Icon: MessageCircle, description: "Abrir conversaciones" },
  { label: "Tareas", href: "/tareas", Icon: CheckSquare, description: "Ver pendientes" },
  { label: "Productos", href: "/products", Icon: Package, description: "Consultar catalogo" },
  { label: "Flujos", href: "/workflow", Icon: Bot, description: "Automatizaciones" },
  { label: "Notas", href: "/notas", Icon: FileText, description: "Buscar apuntes" },
];

const COMMANDS = [
  {
    label: "Crear tarea",
    description: "Registrar un pendiente o seguimiento",
    href: "/tareas",
    action: "create_task",
    Icon: CheckSquare,
    keywords: ["crear tarea", "nueva tarea", "pendiente", "seguimiento"],
  },
  {
    label: "Nuevo cliente",
    description: "Ir a clientes para crear o revisar contactos",
    href: "/clientes",
    Icon: UserRound,
    keywords: ["nuevo cliente", "crear cliente", "cliente", "contacto"],
  },
  {
    label: "Nota interna",
    description: "Crear una nota en el chat actual",
    href: "/chats",
    action: "create_note",
    Icon: FileText,
    keywords: ["nota interna", "crear nota", "apunte", "observacion"],
  },
  {
    label: "Marcar caliente",
    description: "Actualizar el lead del chat actual",
    href: "/chats",
    action: "update_lead_status",
    leadStatus: "CALIENTE",
    Icon: Plus,
    keywords: ["caliente", "lead caliente", "marcar caliente", "interesado"],
  },
  {
    label: "Conectar WhatsApp",
    description: "Abrir conexiones para crear o revisar instancia",
    href: "/connection",
    Icon: PlugZap,
    keywords: ["whatsapp", "conectar whatsapp", "conexion", "qr", "instancia"],
  },
  {
    label: "Crear flujo",
    description: "Abrir workflow para automatizaciones",
    href: "/workflow",
    Icon: Bot,
    keywords: ["crear flujo", "workflow", "automatizacion", "flujo"],
  },
  {
    label: "Configurar IA",
    description: "Revisar proveedor, modelo y API key",
    href: "/profile",
    Icon: Settings2,
    keywords: ["configurar ia", "api key", "openai", "modelo", "proveedor"],
  },
  {
    label: "Ver planes",
    description: "Abrir planes y pagos",
    href: "/planes",
    Icon: CreditCard,
    keywords: ["planes", "plan", "pago", "facturacion", "suscripcion"],
  },
  {
    label: "Abrir CRM",
    description: "Entrar al CRM de leads y seguimiento",
    href: "/crm",
    Icon: Plus,
    keywords: ["crm", "lead", "leads", "ventas"],
  },
  {
    label: "Abrir chats",
    description: "Ir a conversaciones de clientes",
    href: "/chats",
    Icon: MessageCircle,
    keywords: ["chat", "chats", "conversacion", "mensaje"],
  },
];

type SearchFilter = GlobalSearchKind | "all" | "quick";

const FILTERS: Array<{ value: SearchFilter; label: string; Icon: typeof Search; color?: string }> = [
  { value: "all", label: "Todo", Icon: Search, color: "text-muted-foreground" },
  ...Object.entries(KIND_META).map(([value, meta]) => ({
    value: value as GlobalSearchKind,
    label: meta.label,
    Icon: meta.Icon,
    color: meta.color,
  })),
  { value: "quick", label: "Accesos", Icon: ChevronRight, color: "text-slate-500" },
];

export function GlobalSearch() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dictation = useSpeechDictation();
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [activeKind, setActiveKind] = useState<SearchFilter>("all");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); setActiveKind("all"); return; }
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

  const visibleResults = useMemo(() => {
    if (activeKind === "quick") return [];
    return activeKind === "all" ? results : results.filter((item) => item.kind === activeKind);
  }, [activeKind, results]);

  const grouped = useMemo(() => {
    return visibleResults.reduce<Record<GlobalSearchKind, GlobalSearchResult[]>>((acc, item) => {
      acc[item.kind] = [...(acc[item.kind] ?? []), item];
      return acc;
    }, {} as Record<GlobalSearchKind, GlobalSearchResult[]>);
  }, [visibleResults]);

  const hasQuery = query.trim().length >= 2;
  const hasResults = visibleResults.length > 0;
  const hasAnyResults = results.length > 0;
  const showQuickLinks = !hasQuery || activeKind === "quick";
  const normalizedQuery = query.trim().toLowerCase();
  const commandMatches = useMemo(() => {
    const availableCommands = COMMANDS.filter((command) => {
      const action = "action" in command ? command.action : undefined;
      return pathname.startsWith("/chats") || !["create_note", "update_lead_status"].includes(action ?? "");
    });

    if (!hasQuery) return availableCommands.slice(0, 6);
    return availableCommands.filter((command) => {
      const haystack = [command.label, command.description, ...command.keywords].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery) || normalizedQuery.includes(command.label.toLowerCase());
    });
  }, [hasQuery, normalizedQuery, pathname]);
  const showCommands = commandMatches.length > 0 && activeKind !== "quick";
  const runCommandAction = (command: (typeof COMMANDS)[number]) => {
    const action = "action" in command ? command.action : undefined;
    if (action === "create_task" && pathname.startsWith("/chats")) {
      window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
        detail: { action: "create_task" },
      }));
      setOpen(false);
      return true;
    }

    if (action === "create_note" && pathname.startsWith("/chats")) {
      window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
        detail: { action: "create_note" },
      }));
      setOpen(false);
      return true;
    }

    if (action === "update_lead_status" && pathname.startsWith("/chats")) {
      const leadStatus = "leadStatus" in command ? command.leadStatus : undefined;
      const confirmed = window.confirm(`Quieres cambiar el estado del lead a ${leadStatus?.toLowerCase() ?? "este estado"}?`);
      if (!confirmed) return true;

      window.dispatchEvent(new CustomEvent("verzay:copilot-chat-action", {
        detail: { action: "update_lead_status", leadStatus },
      }));
      setOpen(false);
      return true;
    }

    return false;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-9 shrink-0 justify-center px-0 sm:w-64 sm:justify-start sm:px-3"
          title="Buscar clientes, chats, tareas, productos o flujos"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="ml-2 hidden flex-1 truncate text-sm text-muted-foreground sm:inline">Buscar clientes, chats...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <span>Ctrl</span><span>K</span>
          </kbd>
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
              className={cn("h-9 border-0 bg-muted/50 pl-8 shadow-none focus-visible:ring-0", dictation.supported && "pr-9")}
              autoFocus
            />
            {dictation.supported && (
              <button
                type="button"
                onClick={() => dictation.toggle(query, setQuery)}
                aria-label={dictation.listening ? "Detener dictado" : "Dictar por voz"}
                title={dictation.listening ? "Detener dictado" : "Dictar por voz"}
                className={cn(
                  "absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors",
                  dictation.listening
                    ? "animate-pulse bg-red-500 text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {FILTERS.map((filter) => {
              const Icon = filter.Icon;
              const active = activeKind === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActiveKind(filter.value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : filter.color)} />
                  <span className="truncate">{filter.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {showCommands && (
            <div className="border-b px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Comandos
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {commandMatches.map((command) => {
                  const Icon = command.Icon;
                  const itemContent = (
                    <>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-medium">{command.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{command.description}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </>
                  );

                  if ("action" in command && command.action && pathname.startsWith("/chats")) {
                    return (
                      <button
                        key={command.label}
                        type="button"
                        onClick={() => {
                          if (!runCommandAction(command)) setOpen(false);
                        }}
                        className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 transition-colors hover:bg-muted/60"
                      >
                        {itemContent}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={command.label}
                      href={command.href}
                      onClick={() => setOpen(false)}
                      className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 transition-colors hover:bg-muted/60"
                    >
                      {itemContent}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {showQuickLinks && (
            <div className="space-y-4 px-4 py-4">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium">{activeKind === "quick" ? "Accesos rapidos" : "Busca en toda la app"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeKind === "quick"
                    ? "Abre modulos frecuentes sin escribir una busqueda."
                    : "Encuentra clientes, chats, tareas, productos, notas y flujos con al menos 2 caracteres."}
                </p>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Accesos rapidos
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {QUICK_LINKS.map((item) => {
                    const Icon = item.Icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 transition-colors hover:bg-muted/60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Usa los filtros superiores para limitar los resultados por tipo.
              </p>
            </div>
          )}
          {hasQuery && activeKind !== "quick" && isPending && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          )}
          {hasQuery && activeKind !== "quick" && !isPending && !hasResults && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {hasAnyResults ? "No hay resultados en este filtro." : "No se encontraron resultados."}
            </div>
          )}
          {activeKind !== "quick" && hasResults && (
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
