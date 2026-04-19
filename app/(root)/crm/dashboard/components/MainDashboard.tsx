"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import useSWRInfinite from "swr/infinite";

import { CrmDashboard } from "./CrmDashboard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getCrmDashboardStatsByUserId,
  getRegistrosByUserId,
  RegistrosFilters,
  updateRegistroDetalle,
  updateRegistroEstado
} from "@/actions/registro-action";
import { LoadingProgress } from "@/components/shared/LoadingProgress";
import { RegistroWithSession, TipoRegistro } from "@/types/session";
import { toast } from "sonner";
import { ESTADOS_POR_TIPO } from "@/types/registro";

export type MainDashboardProps = {
  userId: string;
};
export type DashboardStats = {
  totalRegistros: number;
  leadsConMovimientos: number;
  countsByTipo: Record<TipoRegistro, number>;
  chartDataByDay: { fecha: string; cantidad: number }[];
  crmFollowUps: {
    total: number;
    active: number;
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    cancelled: number;
    skipped: number;
  };
};

const PAGE_SIZE = 50;

type CrmPageKeyPayload = {
  resource: "crm-registros";
  userId: string;
  activeTab: "TODOS" | TipoRegistro;
  filters: RegistrosFilters;
  pageIndex: number;
};

export const MainDashboard = ({
  userId,
}: MainDashboardProps) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"TODOS" | TipoRegistro>("TODOS");
  const [filters, setFilters] = useState<RegistrosFilters>({});
  const [isPending, startTransition] = useTransition();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scrollRootEl, setScrollRootEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const ioRef = useRef<IntersectionObserver | null>(null);

  const getKey = (pageIndex: number, previousPageData: RegistroWithSession[] | null) => {
    if (previousPageData && previousPageData.length < PAGE_SIZE) return null;
    const payload: CrmPageKeyPayload = {
      resource: "crm-registros",
      userId,
      activeTab,
      filters,
      pageIndex,
    };

    return JSON.stringify(payload);
  };

  const { data, size, setSize, mutate, isLoading, isValidating, error } =
    useSWRInfinite<RegistroWithSession[]>(
      getKey,
      async (key: string) => {
        const payload = JSON.parse(key) as CrmPageKeyPayload;
        const tipo = payload.activeTab === "TODOS" ? undefined : payload.activeTab;

        const res = await getRegistrosByUserId(
          payload.userId,
          payload.pageIndex * PAGE_SIZE,
          PAGE_SIZE,
          tipo,
          payload.filters
        );

        if (!res.success) throw new Error(res.message || "No se pudieron cargar los registros");
        return res.data || [];
      },
      { revalidateAll: false, revalidateFirstPage: false }
    );

  const registros = useMemo(() => (data ? data.flat() : []), [data]);
  const hasMore = !data || (data[data.length - 1]?.length === PAGE_SIZE);
  const isLoadingMore = isValidating && size > 1;

  const handleScrollRootReady = useCallback((el: HTMLDivElement | null) => {
    setScrollRootEl(el);
  }, []);

  const refreshStats = useCallback(async () => {
    const res = await getCrmDashboardStatsByUserId(userId);
    if (res.success) setStats(res.data);
  }, [userId]);


  // libera lock al terminar
  useEffect(() => {
    if (!isValidating) loadingMoreRef.current = false;
  }, [isValidating]);

  // ÚNICO observer (aquí)
  useEffect(() => {
    const rootEl = scrollRootEl;
    const targetEl = sentinelRef.current;

    if (!rootEl || !targetEl) return;
    if (!data) return;
    if (!hasMore) return;

    ioRef.current?.disconnect();

    ioRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        const hasOverflow = rootEl.scrollHeight > rootEl.clientHeight;
        if (!hasOverflow) return;

        if (loadingMoreRef.current) return;
        if (isValidating) return;
        if (!hasMore) return;

        loadingMoreRef.current = true;
        setSize((prev) => prev + 1);
      },
      {
        root: rootEl,
        threshold: 0,
        rootMargin: "120px 0px",
      }
    );

    ioRef.current.observe(targetEl);

    return () => {
      ioRef.current?.disconnect();
      ioRef.current = null;
    };
  }, [scrollRootEl, data, hasMore, isValidating, setSize]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const handleChangeEstado = (registroId: number, nuevoEstado: string) => {
    startTransition(async () => {
      const res = await updateRegistroEstado(registroId, nuevoEstado);
      if (!res?.success) return;

      await mutate();
      await refreshStats(); // mantiene métricas perfectas
    });
  };

  const handleTabChange = useCallback((tab: "TODOS" | TipoRegistro) => {
    loadingMoreRef.current = false;
    setActiveTab(tab);
    setFilters((current) => {
      const next = { ...current };

      if (tab !== "TODOS") {
        const validEstados = ESTADOS_POR_TIPO[tab];
        if (next.estado && !validEstados.includes(next.estado)) {
          delete next.estado;
        }
      }

      if (tab !== "TODOS" && tab !== "REPORTE" && next.leadOnly) {
        delete next.leadOnly;
      }

      return next;
    });
    setSize(1);
  }, [setSize]);

  const handleChangeDetalle = useCallback(
    async (registroId: number, nuevoDetalle: string) => {
      const res = await updateRegistroDetalle(registroId, nuevoDetalle);
      if (!res?.success) {
        toast.error(res?.message ?? "No se pudo actualizar el detalle");
        return false;
      }

      await mutate();
      router.refresh();
      return true;
    },
    [mutate, router]
  );

  const handleFiltersChange = useCallback((next: RegistrosFilters) => {
    loadingMoreRef.current = false;
    setFilters(next);
    setSize(1);
  }, [setSize]);

  const handleRecordsChanged = useCallback(async () => {
    await mutate();
    await refreshStats();
  }, [mutate, refreshStats]);

  const handleFollowUpChanged = useCallback(async () => {
    await handleRecordsChanged();
  }, [handleRecordsChanged]);

  if (isLoading && size === 1) {
    return (
      <LoadingProgress
        fullscreen
        label="Cargando registros"
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
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      <CrmDashboard
        stats={stats}
        userId={userId}
        activeTab={activeTab}
        onActiveTabChange={handleTabChange}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        registros={registros}
        onChangeEstado={handleChangeEstado}
        onChangeDetalle={handleChangeDetalle}
        onFollowUpChanged={handleFollowUpChanged}
        onRecordsChanged={handleRecordsChanged}
        isUpdatingRegistros={isPending}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        sentinelRef={sentinelRef}
        onScrollRootReady={handleScrollRootReady}
      />
    </div>
  );
};
