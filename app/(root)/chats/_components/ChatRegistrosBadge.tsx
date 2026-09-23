"use client";

import dynamic from "next/dynamic";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { TipoRegistro } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

import { loadRegistrosSnapshot } from "./chat-registros-cache";
import { guardarResumen, leerResumen } from "./chat-registros-store";
import { RESUMEN_VACIO, type ResumenDeRegistros } from "@/lib/registros-del-lead";
import type { SimpleTag } from "@/types/session";
import { usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";
import { cn } from "@/lib/utils";

const TIPOS: TipoRegistro[] = ["SOLICITUD", "PEDIDO", "RECLAMO", "PAGO", "RESERVA", "PRODUCTO", "REPORTE"];

const TIPO_LABELS: Record<TipoRegistro, string> = {
  REPORTE: "Reportes",
  SOLICITUD: "Solicitudes",
  PEDIDO: "Pedidos",
  RECLAMO: "Reclamos",
  PAGO: "Pagos",
  RESERVA: "Reservas",
  PRODUCTO: "Productos",
};

// El panel de registros arrastra las tablas y tarjetas del CRM, que son con
// diferencia lo más pesado de esta pantalla. Se carga solo cuando el usuario lo
// abre: hasta entonces no se descarga, y la bandeja no paga su peso.
const ChatRegistrosSheet = dynamic(
  () => import("./ChatRegistrosSheet").then((m) => m.ChatRegistrosSheet),
  { ssr: false },
);

export function ChatRegistrosBadge({
  sessionId,
  sessionPushName,
  whatsapp,
  userId,
  remoteJid,
  instanceId,
  flujos,
  leadStatus,
  leadScore,
  leadScoreReason,
  tags,
  sessionSeguimientos,
  registrosResumen,
  onSessionRefresh,
}: {
  sessionId: number;
  sessionPushName?: string | null;
  whatsapp: string;
  userId: string;
  remoteJid: string;
  instanceId: string | null;
  flujos?: string | null;
  leadStatus?: string | null;
  leadScore?: number | null;
  leadScoreReason?: string | null;
  tags?: SimpleTag[];
  sessionSeguimientos?: string | null;
  /** Ya contado, y llega CON la sesion del chat. El globo no pide nada. */
  registrosResumen?: ResumenDeRegistros;
  /** Vuelve a pedir la sesion, que es quien trae los numeros del globo. */
  onSessionRefresh?: () => Promise<void> | void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Uno de los seis paneles de la fila de iconos de la cabecera.
  const panel = usePanelFlotante("cabecera", "popover");

  /**
   * UNA fuente para el numero y para las filas.
   *
   * Antes el contador caia a un cache de solo el total cuando la sesion no
   * traia el resumen, y las filas no tenian respaldo ninguno: al cambiar de
   * chat el icono decia 13 y el globo «Sin registros aun». Dos fuentes para lo
   * mismo, y solo una con red.
   *
   * Ahora sale todo del store, que guarda el resumen ENTERO y sobrevive a
   * cambiar de chat y volver.
   */
  const [resumenEnPantalla, setResumenEnPantalla] = useState<ResumenDeRegistros | null>(null);

  useEffect(() => {
    setResumenEnPantalla(leerResumen(sessionId));
  }, [sessionId]);

  // Cuando la sesion trae los numeros, entran al store y a la pantalla.
  useEffect(() => {
    if (!registrosResumen) return;
    guardarResumen(sessionId, registrosResumen);
    setResumenEnPantalla(registrosResumen);
  }, [registrosResumen, sessionId]);

  // Y cuando el detalle se carga o se refresca, el store ya lo tiene: se relee.
  const releerDelStore = useCallback(() => {
    setResumenEnPantalla(leerResumen(sessionId));
  }, [sessionId]);

  /**
   * Calienta el panel «Ver y gestionar», y NO el globo.
   *
   * El globo ya no espera a nadie: sus numeros vienen con la sesion. Pero el
   * panel sigue necesitando el detalle -las filas, no los contadores-, y eso
   * son seis acciones de servidor que Next encola de una en una.
   *
   * Por eso se disparan al ABRIR EL GLOBO y no al abrir el chat: para cuando
   * alguien pulsa «Ver y gestionar» ya estan, el panel abre instantaneo como
   * hasta ahora, y el arranque de la conversacion no paga seis turnos de cola
   * por algo que la mayoria de las veces nadie mira.
   */
  const calentarElPanel = useCallback(() => {
    void loadRegistrosSnapshot(sessionId, userId, remoteJid)
      .then(releerDelStore)
      .catch(() => undefined);
  }, [sessionId, userId, remoteJid, releerDelStore]);

  const resumen = resumenEnPantalla ?? RESUMEN_VACIO;
  const countByTipo = TIPOS.reduce((acc, tipo) => {
    acc[tipo] = resumen.porTipo[tipo] ?? 0;
    return acc;
  }, {} as Record<TipoRegistro, number>);

  const registrosTotal = TIPOS.reduce((n, tipo) => n + countByTipo[tipo], 0);
  const seguimientosCount = resumen.seguimientos;
  const recordatoriosCount = resumen.recordatorios;
  const citasCount = resumen.citas;
  const followUpsCount = resumen.followUpsIa;
  const grandTotal = registrosTotal + seguimientosCount + recordatoriosCount + citasCount + followUpsCount;

  // El numero sale del MISMO objeto que las filas. Si no se sabe nada todavia,
  // no hay numero y no hay filas: coherente, en vez de un 13 sobre un globo
  // vacio.
  const displayTotal = grandTotal;

  const notasIaCount = (sessionSeguimientos ?? "")
    .split("\n")
    .filter((line) => /^\[.+?\]\s.+$/.test(line)).length;

  const registrosRows = TIPOS.filter((t) => countByTipo[t] > 0).map((tipo) => ({
    label: TIPO_LABELS[tipo],
    count: countByTipo[tipo],
  }));

  const agendaRows = [
    { label: "Seguimientos", count: seguimientosCount },
    { label: "Recordatorios", count: recordatoriosCount },
    { label: "Citas", count: citasCount },
    { label: "Follow-ups IA", count: followUpsCount },
  ].filter((r) => r.count > 0);

  const allRows = [...registrosRows, ...agendaRows];

  return (
    <>
      <Popover
        onOpenChange={(abierto) => {
          panel.alAbrir(abierto);
          if (abierto) calentarElPanel();
        }}
      >
        <PopoverTrigger asChild ref={panel.disparador}>
          <button
            type="button"
            title="Registros del lead"
            className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-teal-300 bg-teal-100 text-teal-800 hover:bg-teal-200 focus:outline-none transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {displayTotal > 0 && (
              <span className="absolute top-0 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold leading-none text-white">
                {displayTotal > 99 ? "99+" : displayTotal}
              </span>
            )}
            {notasIaCount > 0 && (
              <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-fuchsia-500 ring-1 ring-white" />
            )}
          </button>
        </PopoverTrigger>

        {/* Pegado al filo derecho del área de conversación y a la misma altura
            que los otros cinco paneles de la fila de iconos: iba
            `align="center"`, o sea centrado sobre su propio icono, así que
            saltaba de sitio al pasar de un icono al de al lado. */}
        <PopoverContent {...panel.props} className={cn("w-52 space-y-2", RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
          <p className="text-xs font-semibold">Registros del lead</p>

          {allRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin registros aún.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {allRows.map((row) => (
                <>
                  <span key={`${row.label}-label`} className="text-muted-foreground">{row.label}</span>
                  <span key={`${row.label}-count`} className="font-medium">{row.count}</span>
                </>
              ))}
            </div>
          )}

          <Separator />

          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => setSheetOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            {grandTotal === 0 ? "Agregar registro" : "Ver y gestionar"}
          </Button>
        </PopoverContent>
      </Popover>

      <ChatRegistrosSheet
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) {
            // Al cerrar, el detalle pudo cambiar: se rehace el cache del panel
            // Y se vuelve a pedir la sesion, que es de donde salen los numeros
            // del globo. Sin lo segundo, anadir un registro y cerrar dejaba el
            // contador viejo hasta el siguiente refresco.
            void loadRegistrosSnapshot(sessionId, userId, remoteJid, { force: true })
              .then(releerDelStore)
              .catch(() => undefined);
            void onSessionRefresh?.();
          }
        }}
        sessionId={sessionId}
        sessionPushName={sessionPushName}
        whatsapp={whatsapp}
        userId={userId}
        remoteJid={remoteJid}
        instanceId={instanceId}
        flujos={flujos}
        leadStatus={leadStatus}
        leadScore={leadScore}
        leadScoreReason={leadScoreReason}
        tags={tags}
        sessionSeguimientos={sessionSeguimientos}
      />
    </>
  );
}
