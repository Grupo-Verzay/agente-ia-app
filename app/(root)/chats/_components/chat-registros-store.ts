// La UNICA fuente de los numeros de «Registros del lead».
//
// De aqui leen los tres: el contador del icono, el globo y -por el snapshot que
// se deriva a este mismo sitio- el panel «Ver y gestionar». Antes el contador
// tiraba de un cache de SOLO EL TOTAL y las filas del globo de otra cosa, asi
// que al cambiar de chat el icono decia 13 y el globo «Sin registros aun»: dos
// fuentes para lo mismo, y una de ellas sin respaldo.
//
// Dos niveles, y los dos importan:
//
//  - Un `Map` de modulo: sobrevive a cambiar de chat y volver, que es justo
//    donde se veia el fallo. No se limpia nunca dentro de la sesion.
//  - `localStorage`: sobrevive ademas a recargar la pagina, para que el globo
//    tenga algo que ensenar antes de que llegue la sesion.
//
// Se guarda el RESUMEN ENTERO, no el total. Eso es lo que garantiza que el
// numero y las filas no puedan discrepar: salen del mismo objeto.

import type { ResumenDeRegistros } from "@/lib/registros-del-lead";

const PREFIJO = "chat-registros:";
/** Cota de llaves en `localStorage`. Cada entrada es un objeto minusculo. */
const MAX_LLAVES = 300;

const enMemoria = new Map<number, ResumenDeRegistros>();

function esResumen(v: unknown): v is ResumenDeRegistros {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<ResumenDeRegistros>;
  return (
    typeof r.porTipo === "object" &&
    r.porTipo !== null &&
    typeof r.seguimientos === "number" &&
    typeof r.recordatorios === "number" &&
    typeof r.citas === "number" &&
    typeof r.followUpsIa === "number"
  );
}

/** Lo ultimo que se sabe de esta sesion, o `null` si no se sabe nada. */
export function leerResumen(sessionId: number): ResumenDeRegistros | null {
  const dentro = enMemoria.get(sessionId);
  if (dentro) return dentro;
  try {
    const crudo = localStorage.getItem(PREFIJO + sessionId);
    if (!crudo) return null;
    const leido = JSON.parse(crudo) as { resumen?: unknown };
    if (!esResumen(leido?.resumen)) return null;
    enMemoria.set(sessionId, leido.resumen);
    return leido.resumen;
  } catch {
    // Sin `localStorage` -ventana privada, datos bloqueados- se vive igual: el
    // globo espera a la sesion, que es lo que hacia antes de existir el cache.
    return null;
  }
}

export function guardarResumen(sessionId: number, resumen: ResumenDeRegistros): void {
  enMemoria.set(sessionId, resumen);
  try {
    localStorage.setItem(
      PREFIJO + sessionId,
      JSON.stringify({ resumen, ts: Date.now() }),
    );
    podar(false);
  } catch {
    // Cuota llena: se poda y se reintenta UNA vez.
    try {
      podar(true);
      localStorage.setItem(PREFIJO + sessionId, JSON.stringify({ resumen, ts: Date.now() }));
    } catch {
      // El `Map` de arriba ya lo tiene: dentro de esta sesion sigue funcionando.
    }
  }
}

/** Poda las mas antiguas. Solo toca llaves con nuestro prefijo. */
function podar(forzar: boolean): void {
  try {
    const entradas: { llave: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIJO)) continue;
      let ts = 0;
      try {
        ts = Number((JSON.parse(localStorage.getItem(k) ?? "{}") as { ts?: number }).ts) || 0;
      } catch {
        // Una entrada ilegible es justo la que conviene tirar primero: ts = 0.
      }
      entradas.push({ llave: k, ts });
    }
    if (!forzar && entradas.length <= MAX_LLAVES) return;
    const objetivo = Math.floor(MAX_LLAVES * 0.75);
    entradas.sort((a, b) => a.ts - b.ts);
    const cuantas = forzar
      ? Math.max(entradas.length - objetivo, Math.ceil(entradas.length / 2))
      : entradas.length - objetivo;
    for (let i = 0; i < cuantas && i < entradas.length; i += 1) {
      localStorage.removeItem(entradas[i].llave);
    }
  } catch {
    // best-effort
  }
}
