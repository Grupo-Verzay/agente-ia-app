"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { activateAllSessions, deactivateAllSessions, deleteAllSessions, getSessionsByUserId, getSessionsCountByUserId, searchSessionsByUserId } from "@/actions/session-action";
import { clearAllHistory } from "@/actions/n8n-chat-historial-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";
import { UserSessionsSkeleton } from "./user-sessions-skeleton";
import { columns } from "./Columns";
import { DataTable } from "./data-table";
import { BulkActionsDropdown } from "./BulkActionsDropdown";
import { deleteSeguimientosByInstanceName } from "@/actions/seguimientos-actions";
import { Session, SessionsContentProps, SimpleTag } from "@/types/session";
import { FilterLeadsByStats, FilterSessionTypes, SessionStatsInterface } from "./FilterLeadsByStats";

const PAGE_SIZE = 20;

export function SessionsContent({ userId, allTags }: SessionsContentProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<SessionStatsInterface | null>(null);
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const observerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FilterSessionTypes>("all");

  const getKey = (pageIndex: number, previousPageData: Session[] | null) => {
    if (previousPageData && previousPageData.length < PAGE_SIZE) return null;
    return JSON.stringify({ userId, pageIndex, filter });
  };

  const { data, size, setSize, mutate, isLoading, isValidating, error } = useSWRInfinite<Session[]>(
    getKey,
    async (key: string) => {
      const { userId, pageIndex, filter } = JSON.parse(key);
      const page = parseInt(pageIndex, 10);
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
        page * PAGE_SIZE,
        PAGE_SIZE,
        sessionStatus,
        agentDisabled
      );

      if (!response.success) throw new Error(response.message);
      return response.data || [];
    },
    {
      revalidateAll: false,
      revalidateFirstPage: false,
    }
  );

  const sessions = useMemo(() => {
    if (search.trim() !== "" && searchResults !== null) {
      return searchResults;
    }
    return data ? data.flat() : [];
  }, [data, searchResults, search]);

  const hasMore = !data || (data[data.length - 1]?.length === PAGE_SIZE);

  useEffect(() => {
    async function fetchStats() {
      const res = await getSessionsCountByUserId(userId);
      if (res.success && res.data) {
        setStats(res.data);
      }
    }
    fetchStats();
  }, [userId]);

  useEffect(() => {
    if (!observerRef.current || search.trim() !== "") return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !isValidating && hasMore && sessions.length > 0) {
        setSize((prev) => prev + 1);
      }
    }, { threshold: 1.0 });

    observer.observe(observerRef.current);

    return () => observer.disconnect();
  }, [isValidating, hasMore, sessions.length, search, setSize]);

  useEffect(() => {
    const interval = setInterval(() => {
      mutate();
    }, 30000);

    return () => clearInterval(interval);
  }, [mutate]);

  const handleDeleteFromTable = (deletedId: number) => {
    mutate((currentData) => {
      if (!currentData) return currentData;
      return currentData.map(page => page.filter(session => session.id !== deletedId));
    }, false);
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
      if (res.success) {
        setSearchResults(res.data || []);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error("Error buscando sesiones:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  if (isLoading && size === 1 && !search) return <UserSessionsSkeleton />;

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

  const hasResults = sessions.length > 0;

  // if (!isLoading && !isSearching && !hasResults) {
  //   return (
  //     <div className="flex flex-col items-center justify-center mt-10 space-y-4">
  //       <Alert>
  //         <AlertCircle className="h-4 w-4" />
  //         <AlertTitle>No se encontraron resultados</AlertTitle>
  //         <AlertDescription>Intenta buscar otro nombre o número.</AlertDescription>
  //       </Alert>
  //     </div>
  //   );
  // }



  return (
    <div className="flex flex-col h-full">
      {/* Header fijo */}
      <div className="sticky top-0 z-1">
        <div className="flex justify-between items-center">
          <div className="container-stats flex flex-1 gap-4 overflow-x-auto mb-2 p-2">
            <FilterLeadsByStats
              stats={stats}
              filter={filter}
              onChangeFilter={(key) => {
                setFilter(key);
                setSize(1); // reinicia paginación
              }}
            />
          </div>

        </div>
        <div className="flex flex-1 justify-between p-2">
          <Input
            placeholder="Buscar por nombre o número..."
            value={search}
            onChange={handleSearchChange}
            className="w-full sm:max-w-sm text-xs"
          />
          <BulkActionsDropdown
            userId={userId}
            onActivateAll={activateAllSessions}
            onDeactivateAll={deactivateAllSessions}
            onDeleteAll={deleteAllSessions}
            onClearHistory={clearAllHistory}
            onClearSeguimientos={deleteSeguimientosByInstanceName}
            onSuccess={() => router.refresh()}
          />
        </div>
      </div>

      {/* Scroll interno para el content */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-1 gap-4">
          <Card className="border-border">
            <DataTable columns={columns({ onDeleteSuccess: handleDeleteFromTable, mutateSessions: mutate, allTags, onNavigateToChat: (remoteJid) => router.push(`/chats?jid=${remoteJid}`) })} data={sessions} />
          </Card>

          {isValidating && !search && (
            <div className="flex justify-center py-4">
              <Skeleton className="h-6 w-[200px]" />
            </div>
          )}

          {!search && hasResults && (
            <div ref={observerRef} className="h-10" />
          )}
        </div>
      </div>
    </div>
  );
}
