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
import { FilterSessionTypes } from "../../sessions/_components/FilterLeadsByStats";

type MainCrmProps = {
  userId: string;
  allTags: SimpleTag[];
};

const PAGE_SIZE = 50;

export const MainCrm = ({ userId, allTags }: MainCrmProps) => {
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<FilterSessionTypes>("all");

  /**
   * La llave de cada pagina es un ARRAY, no un texto.
   *
   * Antes era `${userId}-${estado}-${pagina}` y luego se partia por guiones.
   * Pero el `userId` es un UUID, que lleva cuatro guiones, asi que las
   * posiciones 2 y 3 caian DENTRO del UUID: el estado salia como un trozo
   * hexadecimal cualquiera (y por tanto "sin filtro") y la pagina como
   * `parseInt` del tercer bloque, que en un UUID v4 empieza siempre por `4`.
   *
   * O sea: todo el mundo veia SIEMPRE la pagina 4 -salto de 200 filas- y el
   * filtro no hacia nada. Con menos de 200 sesiones el CRM salia vacio; con
   * mas, el scroll infinito repetia el mismo bloque una y otra vez.
   *
   * SWR acepta arrays como llave y se los pasa tal cual al cargador: no hay
   * nada que partir ni que pueda partirse mal.
   */
  type LlaveDePagina = readonly ["crm-sesiones", string, boolean | undefined, number];

  const getKey = (
    pageIndex: number,
    previousPageData: SessionWithRegistrosAndTags[] | null
  ): LlaveDePagina | null => {
    if (previousPageData && previousPageData.length < PAGE_SIZE) return null;

    const estado =
      filter === "all" ? undefined : filter === "activeSession" ? true : false;

    return ["crm-sesiones", userId, estado, pageIndex] as const;
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
    async ([, cuenta, estado, pagina]: LlaveDePagina) => {
      const res = await getSessionsByUserIdToCRM(
        cuenta,
        pagina * PAGE_SIZE,
        PAGE_SIZE,
        estado
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
          />
        </div>
      )}
    </div>
  );
};
