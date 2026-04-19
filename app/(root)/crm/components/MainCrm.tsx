// app/(dashboard)/crm/components/MainCrm.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { LoadingProgress } from "@/components/shared/LoadingProgress";
import { LeadsManagement } from "./LeadsManagement";
import { getSessionsByUserIdToCRM } from "@/actions/session-action";
import { SessionWithRegistrosAndTags, SimpleTag } from "@/types/session";
import { FilterSessionTypes } from "../../sessions/_components";

type MainCrmProps = {
  userId: string;
  allTags: SimpleTag[];
};

const PAGE_SIZE = 50;

export const MainCrm = ({ userId, allTags }: MainCrmProps) => {
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<FilterSessionTypes>("all");

  const getKey = (
    pageIndex: number,
    previousPageData: SessionWithRegistrosAndTags[] | null
  ) => {
    if (previousPageData && previousPageData.length < PAGE_SIZE) return null;

    const statusKey =
      filter === "all" ? "all" : filter === "activeSession" ? "true" : "false";

    return `${userId}-${statusKey}-${pageIndex}`;
  };

  const {
    data,
    size,
    setSize,
    isLoading,
    isValidating,
    error,
    mutate
  } = useSWRInfinite<SessionWithRegistrosAndTags[]>(
    getKey,
    async (key: string) => {
      const [, statusStr, pageIndex] = key.split("-");
      const page = parseInt(pageIndex, 10) || 0;

      const statusParam =
        statusStr === "true" ? true : statusStr === "false" ? false : undefined;

      const res = await getSessionsByUserIdToCRM(
        userId,
        page * PAGE_SIZE,
        PAGE_SIZE,
        statusParam
      );

      if (!res.success) {
        throw new Error(res.message || "No se pudieron cargar las sesiones");
      }

      return res.data || [];
    },
    {
      revalidateAll: false,
      revalidateFirstPage: false,
    }
  );

  const sessions = useMemo(
    () => (data ? data.flat() : []),
    [data]
  );

  const hasMore =
    !data || (data[data.length - 1]?.length === PAGE_SIZE);

  // Infinite scroll
  useEffect(() => {
    if (!observerRef.current) return;
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isValidating && hasMore) {
          setSize((prev) => prev + 1);
        }
      },
      { threshold: 1.0 }
    );

    observer.observe(observerRef.current);

    return () => observer.disconnect();
  }, [hasMore, isValidating, setSize]);

  if (isLoading && size === 1) {
    return (
      <LoadingProgress
        fullscreen
        label="Cargando leads"
        description="Esto suele tardar solo unos segundos..."
      />
    );
  }

  if (error) {
    return (
      <div className="mt-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {(error as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <LeadsManagement
        sessions={sessions}
        userId={userId}
        filter={filter}
        onChangeFilter={(key) => {
          setFilter(key);
          setSize(1); // reinicia la paginación al cambiar de filtro
        }}
        mutateSessions={mutate}
        allTags={allTags}
      />

      {/* Sentinel para infinite scroll */}
      {hasMore && <div ref={observerRef} className="h-10" />}

      {isValidating && (
        <div className="mt-2">
          <LoadingProgress
            fullscreen={false}
            label="Cargando más leads..."
            description="Esto suele tardar solo unos segundos..."
          />
        </div>
      )}
    </div>
  );
};
