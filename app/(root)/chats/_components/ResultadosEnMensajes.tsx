"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  lasIdentidadesDelResultado,
  seBuscaEnLosMensajes,
  type ResultadoDeBusqueda,
} from "@/lib/busqueda-en-mensajes";
import { formatTimeFromEpoch } from "./chat-sidebar.utils";
import type { SidebarContact } from "./chat-sidebar.types";

/**
 * «En mensajes»: lo que el buscador de la columna encuentra DENTRO de las
 * conversaciones —palabras, frases, fechas o cualquier dato escrito—, debajo de
 * los chats que casan por nombre o número. Las reglas viven en
 * `lib/busqueda-en-mensajes.ts`; la consulta, en `/api/chats/buscar`.
 *
 * Se pide al dejar de teclear (`ESPERA_AL_TECLEAR_MS`), y una respuesta que
 * llega tarde —de lo que se escribia antes— se tira: si no, los resultados de
 * «fact» pintarian encima de los de «factura».
 */

export const ESPERA_AL_TECLEAR_MS = 350;

type Estado = { q: string; cargando: boolean; resultados: ResultadoDeBusqueda[]; error: string | null };

/** El chat cargado que es la misma conversacion (misma linea y alguna identidad en comun). */
export function elChatDelResultado(
  r: ResultadoDeBusqueda,
  contactos: SidebarContact[],
): SidebarContact | undefined {
  const ids = new Set(lasIdentidadesDelResultado(r));
  return contactos.find(
    (c) =>
      (!c.instanceName || c.instanceName === r.instanceName) &&
      (ids.has(c.id) || (c.identidades ?? []).some((i) => ids.has(i))),
  );
}

function elNumeroDelJid(jid: string): string {
  if (!/@(s\.whatsapp\.net|c\.us)$/.test(jid)) return "";
  const d = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return d ? `+${d}` : "";
}

export default function ResultadosEnMensajes({
  q,
  lineas,
  contactos,
  alElegir,
}: {
  q: string;
  lineas: string[];
  contactos: SidebarContact[];
  alElegir: (jid: string, instanceName: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ q: "", cargando: false, resultados: [], error: null });
  const turno = useRef(0);
  const llaveDeLineas = lineas.join("|");
  const texto = q.trim();
  const busca = seBuscaEnLosMensajes(texto);

  useEffect(() => {
    if (!busca || !llaveDeLineas) {
      turno.current += 1;
      setEstado({ q: "", cargando: false, resultados: [], error: null });
      return;
    }
    const mio = ++turno.current;
    setEstado((e) => ({ ...e, cargando: true }));
    const ctrl = new AbortController();
    const reloj = setTimeout(async () => {
      try {
        const res = await fetch("/api/chats/buscar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: texto,
            instanceNames: llaveDeLineas.split("|"),
            tzOffset: new Date().getTimezoneOffset(),
          }),
          signal: ctrl.signal,
        });
        const json = await res.json().catch(() => null);
        if (mio !== turno.current) return;
        if (!res.ok || !json?.success) {
          console.warn("[chats] la busqueda en mensajes fallo", { status: res.status, message: json?.message });
          setEstado({ q: texto, cargando: false, resultados: [], error: json?.message || "No se pudo buscar en los mensajes." });
          return;
        }
        setEstado({ q: texto, cargando: false, resultados: json.resultados ?? [], error: null });
      } catch (error) {
        if ((error as Error)?.name === "AbortError" || mio !== turno.current) return;
        console.warn("[chats] la busqueda en mensajes no llego", error);
        setEstado({ q: texto, cargando: false, resultados: [], error: "No se pudo buscar en los mensajes." });
      }
    }, ESPERA_AL_TECLEAR_MS);
    return () => {
      clearTimeout(reloj);
      ctrl.abort();
    };
  }, [busca, texto, llaveDeLineas]);

  const filas = useMemo(
    () =>
      estado.resultados
        .map((r) => ({ r, chat: elChatDelResultado(r, contactos) }))
        // Un chat eliminado no sale en ninguna parte.
        .filter(({ chat }) => !chat?.isDeleted),
    [estado.resultados, contactos],
  );

  if (!busca) return null;

  return (
    <section data-resultados-en-mensajes className="mt-2 border-t border-border pt-2">
      <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MessageSquareText className="h-3.5 w-3.5" />
        En mensajes
        {estado.cargando && <Loader2 className="h-3 w-3 animate-spin" aria-label="Buscando" />}
      </div>
      {estado.error ? (
        <p className="px-2 py-2 text-xs text-destructive">{estado.error}</p>
      ) : !estado.cargando && estado.q === texto && filas.length === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">Ningún mensaje contiene «{texto}».</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {filas.map(({ r, chat }) => {
            const nombre = chat?.name || r.pushName || elNumeroDelJid(r.remoteJidAlt || r.remoteJid) || r.remoteJid.split("@")[0];
            return (
              <li key={`${r.instanceName}::${r.remoteJid}`}>
                <button
                  type="button"
                  data-resultado-en-mensajes
                  onClick={() => alElegir(chat?.id ?? r.remoteJid, r.instanceName)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nombre}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatTimeFromEpoch(r.messageTimestamp)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {r.fromMe ? "Tú: " : ""}
                    {r.extracto}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
