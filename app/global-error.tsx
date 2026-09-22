"use client";

import { useEffect, useState } from "react";

import {
  anotarElFallo,
  comoSeCuenta,
  comoSeLee,
  esRecuperable,
  type FalloAnotado,
} from "@/lib/fallos-del-navegador";
import { hardReload } from "@/lib/hard-reload";
import { intentarRecuperar } from "@/lib/recuperar-del-desfase";

/**
 * La ULTIMA red: lo que se pinta cuando el fallo escapa del layout raiz.
 *
 * Sin este fichero, Next pinta lo suyo —«Application error: a client-side
 * exception has occurred»— sobre una pantalla en blanco, sin un boton, sin
 * decir que hacer y sin dejar rastro de nada. Eso es lo que se veia en
 * produccion, de forma intermitente y en pantallas distintas.
 *
 * Y no bastaba con el `ErrorBoundary` que ya hay: aquel vive DENTRO de
 * `app/layout.tsx`, o sea por debajo del limite que Next monta en la raiz del
 * enrutador (`AppRouter`). Todo lo que reviente en el propio enrutador, en el
 * layout raiz o en lo que cuelgue fuera de ese boundary se le escapa por
 * arriba, y ahi hasta ahora no habia absolutamente nada.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Se pinta con estilos EN LINEA, sin importar ni un componente de la
 *    interfaz.** Esto se monta cuando ya ha fallado algo gordo, y Next lo pinta
 *    con su propio `<html>`/`<body>`: dar por hecho que la hoja de estilos de
 *    la App esta cargada es apostar la ultima red a lo mismo que se acaba de
 *    romper. Si no se ve, no sirve.
 * 2. **Anota el fallo ANTES de ofrecer el boton.** El boton recarga, y una
 *    recarga se lleva la consola por delante: lo que no se haya anotado ya, no
 *    existe.
 * 3. **La recarga automatica solo se intenta si el fallo es de los que se curan
 *    recargando** (un desfase de version tras un despliegue). Recargar sola
 *    ante un error de verdad es un bucle, y un bucle es peor que una pantalla
 *    con un boton.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [anotado, setAnotado] = useState<FalloAnotado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [recargando, setRecargando] = useState(false);

  useEffect(() => {
    const fallo = anotarElFallo("global", error);
    setAnotado(fallo);

    const leido = comoSeLee(error);
    if (esRecuperable(leido.mensaje, leido.nombre)) {
      // Un desfase de version se cura recargando. `intentarRecuperar` respeta
      // su propio tope y AVISA cuando no recarga, asi que aqui no hay ningun
      // camino callado: o recarga, o se queda esta pantalla con su boton.
      if (intentarRecuperar(`pantalla global: ${leido.nombre || leido.mensaje}`)) {
        setRecargando(true);
      }
    }
  }, [error]);

  const recargar = () => {
    setRecargando(true);
    hardReload("pantalla global de error: recarga a mano");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comoSeCuenta(anotado));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin portapapeles el detalle sigue a la vista, que es lo que importa.
    }
  };

  const leido = comoSeLee(error);

  return (
    <html lang="es">
      <body style={estilos.cuerpo}>
        <div style={estilos.tarjeta}>
          <h1 style={estilos.titulo}>No se pudo cargar la pantalla</h1>
          <p style={estilos.texto}>
            {recargando
              ? "Estamos recargando la aplicacion. Un momento…"
              : "Suele pasar justo despues de una actualizacion: tu navegador se quedo con una version anterior. Recargar lo arregla."}
          </p>

          <div style={estilos.botones}>
            <button type="button" onClick={recargar} style={estilos.principal}>
              Recargar la pagina
            </button>
            <button
              type="button"
              onClick={() => {
                // `reset` vuelve a pintar sin recargar. Sirve cuando el fallo
                // fue de una vez; si vuelve, queda el boton de recargar.
                try {
                  reset();
                } catch {
                  hardReload("pantalla global de error: reset fallido");
                }
              }}
              style={estilos.secundario}
            >
              Reintentar
            </button>
            <a href="/" style={estilos.secundario}>
              Ir al inicio
            </a>
          </div>

          {/* El detalle se ve SIN abrir las herramientas del navegador: quien
              sufre esto casi nunca las tiene abiertas, y una captura de la
              pantalla en blanco no dice nada. */}
          <div style={estilos.detalle}>
            <code style={estilos.codigo}>
              {leido.nombre}: {leido.mensaje}
              {error?.digest ? ` (digest ${error.digest})` : ""}
            </code>
            <button type="button" onClick={copiar} style={estilos.copiar}>
              {copiado ? "Copiado" : "Copiar detalle"}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

const estilos: Record<string, React.CSSProperties> = {
  cuerpo: {
    margin: 0,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "#f6f6f7",
    color: "#18181b",
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
  },
  tarjeta: {
    width: "100%",
    maxWidth: 560,
    background: "#fff",
    border: "1px solid #e4e4e7",
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,.08)",
  },
  titulo: { fontSize: 20, lineHeight: "28px", margin: "0 0 8px", fontWeight: 600 },
  texto: { fontSize: 14, lineHeight: "22px", margin: "0 0 20px", color: "#52525b" },
  botones: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  principal: {
    appearance: "none",
    border: "1px solid #4f46e5",
    background: "#4f46e5",
    color: "#fff",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  secundario: {
    appearance: "none",
    border: "1px solid #d4d4d8",
    background: "#fff",
    color: "#18181b",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  },
  detalle: { marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f0f1" },
  codigo: {
    display: "block",
    fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
    fontSize: 12,
    lineHeight: "18px",
    color: "#71717a",
    wordBreak: "break-word",
    marginBottom: 8,
  },
  copiar: {
    appearance: "none",
    border: "none",
    background: "transparent",
    color: "#4f46e5",
    fontSize: 12,
    padding: 0,
    cursor: "pointer",
  },
};
