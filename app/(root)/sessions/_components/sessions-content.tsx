"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { activateAllSessions, cleanupJunkSessions, deactivateAllSessions, deleteAllSessions, getSessionsByUserId, getSessionsCountByUserId, searchSessionsByUserId } from "@/actions/session-action";
import { clearAllHistory } from "@/actions/n8n-chat-historial-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download } from "lucide-react";
import { UserSessionsSkeleton } from "./user-sessions-skeleton";
import { columns } from "./Columns";
import { DataTable } from "./data-table";
import { BulkActionsDropdown } from "./BulkActionsDropdown";
import { deleteSeguimientosByInstanceName } from "@/actions/seguimientos-actions";
import { Session, SessionsContentProps } from "@/types/session";
import { FilterLeadsByStats, FilterSessionTypes, SessionStatsInterface } from "./FilterLeadsByStats";
import { CreateContactDialog } from "./CreateContactDialog";
import { getSessionsForExport } from "@/actions/export-actions";
import { toast } from "sonner";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { formatContactDisplayName } from "@/lib/contact-display-name";

const PAGE_SIZE = 20;

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SessionsContent({ userId, allTags }: SessionsContentProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<SessionStatsInterface | null>(null);
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [filter, setFilter] = useState<FilterSessionTypes>("all");
  const [isExporting, setIsExporting] = useState(false);

  const { data: pageData = [], mutate, isLoading, isValidating, error } = useSWR<Session[]>(
    search.trim() ? null : JSON.stringify({ userId, currentPage, filter }),
    async (key: string) => {
      const { userId, currentPage, filter } = JSON.parse(key);
      const sessionStatus =
        filter === "activeSession" ? true :
          filter === "inactiveSession" ? false :
            undefined;
      const agentDisabled =
        filter === "activeAgent" ? false :
          filter === "inactiveAgent" ? true :
            undefined;

      const response = await getSessionsByUserId(
        userId,
        currentPage * PAGE_SIZE,
        PAGE_SIZE,
        sessionStatus,
        agentDisabled
      );

      if (!response.success) throw new Error(response.message);
      return response.data || [];
    },
    { revalidateOnFocus: false }
  );

  const sessions = useMemo(() => {
    if (search.trim() !== "" && searchResults !== null) return searchResults;
    return pageData;
  }, [pageData, searchResults, search]);

  const totalCount = useMemo(() => {
    if (!stats) return 0;
    switch (filter) {
      case "activeSession": return stats.activeSession;
      case "inactiveSession": return stats.inactiveSession;
      case "activeAgent": return stats.activeAgent;
      case "inactiveAgent": return stats.inactiveAgent;
      default: return stats.total;
    }
  }, [stats, filter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    async function fetchStats() {
      const res = await getSessionsCountByUserId(userId);
      if (res.success && res.data) setStats(res.data);
    }
    fetchStats();
  }, [userId]);

  useEffect(() => {
    const interval = setInterval(() => { mutate(); }, 30000);
    return () => clearInterval(interval);
  }, [mutate]);

  const handleDeleteFromTable = (deletedId: number) => {
    mutate((current) => current?.filter((s) => s.id !== deletedId), false);
    setStats((prev) => prev ? { ...prev, total: Math.max(0, prev.total - 1) } : prev);
  };

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (value.trim().length === 0) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const res = await searchSessionsByUserId(userId, value);
      setSearchResults(res.success ? res.data || [] : []);
    } catch (err) {
      console.error("Error buscando sesiones:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  if (isLoading && currentPage === 0 && !search) return <UserSessionsSkeleton />;

  if (error) {
    return (
      <div className="flex justify-center mt-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isInSearchMode = search.trim() !== "";
  const showingCount = sessions.length;
  const totalDisplay = isInSearchMode ? showingCount : totalCount;
  const showingFrom = currentPage * PAGE_SIZE + 1;
  const showingTo = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="flex flex-col h-full min-h-0 gap-2 overflow-hidden">
      {/* Header fijo */}
      <div className="sticky top-0 z-1">
        <div className="flex justify-between items-center">
          <div className="container-stats mb-2 hidden flex-1 sm:flex sm:gap-4 sm:overflow-x-auto">
            <FilterLeadsByStats
              stats={stats}
              filter={filter}
              onChangeFilter={(key) => {
                setFilter(key);
                setCurrentPage(0);
              }}
            />
          </div>
        </div>
        <ModuleToolbar className="shrink-0">
          <div className="relative w-full sm:w-72">
            <Input
              placeholder="Buscar por nombre o número..."
              value={search}
              onChange={handleSearchChange}
              className="w-full text-xs"
            />
          </div>
          <div className="toolbar-collapse flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
              onClick={async () => {
                setIsExporting(true);
                try {
                  const res = await getSessionsForExport();
                  if (!res.success) { toast.error(res.message); return; }
                  const headers = ["ID", "Nombre", "Teléfono", "Lead Status", "Conversación", "Agente IA", "Asesor", "Etiquetas", "Fecha creación"];
                  const rows = res.rows.map((r) => [
                    String(r.id), formatContactDisplayName(r.nombre, "Lead"), r.telefono, r.leadStatus,
                    r.estadoConversacion, r.agenteIA, r.asesor, r.etiquetas, r.fechaCreacion,
                  ]);
                  downloadCsv(`contactos_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
                  toast.success(`${res.rows.length} contactos exportados.`);
                } finally {
                  setIsExporting(false);
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Exportando..." : "Exportar CSV"}
            </Button>
            <CreateContactDialog userId={userId} onSuccess={() => mutate()} />
            <BulkActionsDropdown
              userId={userId}
              onActivateAll={activateAllSessions}
              onDeactivateAll={deactivateAllSessions}
              onDeleteAll={deleteAllSessions}
              onClearHistory={clearAllHistory}
              onClearSeguimientos={deleteSeguimientosByInstanceName}
              onCleanupJunk={cleanupJunkSessions}
              onSuccess={() => { mutate(); router.refresh(); }}
            />
          </div>
        </ModuleToolbar>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col border-border overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <DataTable
            columns={columns({
              onDeleteSuccess: handleDeleteFromTable,
              mutateSessions: mutate,
              allTags,
              onNavigateToChat: (remoteJid) => router.push(`/chats?jid=${remoteJid}`)
            })}
            data={sessions}
          />
          {isValidating && (
            <div className="flex justify-center py-4">
              <Skeleton className="h-6 w-[200px]" />
            </div>
          )}
        </div>

        {/* Footer de paginación */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {showingCount === 0
              ? "Sin resultados"
              : isInSearchMode
                ? <>Mostrando <b>{showingCount}</b> de <b>{totalDisplay}</b> resultados</>
                : <>Mostrando <b>{totalCount > 0 ? `${showingFrom}–${showingTo}` : "0"}</b> de <b>{totalCount}</b> resultados</>
            }
          </div>
          {!isInSearchMode && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(0)} disabled={currentPage === 0 || isValidating}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0 || isValidating}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-2 text-xs">
                Página <b>{currentPage + 1}</b> / <b>{totalPages}</b>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1 || isValidating}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1 || isValidating}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
