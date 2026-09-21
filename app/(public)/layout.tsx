import { PANTALLA_PUBLICA_QUE_SE_DESPLAZA } from "@/lib/pantalla-publica";

/**
 * Las landings públicas: catálogo, planes, formularios, documentación.
 *
 * Ya declaraba su propio contenedor que se desplaza —era el único sitio de
 * fuera de `(root)` que lo hacía— con `h-screen`. Pasa a la medida compartida
 * (`lib/pantalla-publica.ts`), que es la misma cosa con `dvh` en vez de `vh`:
 * en un móvil `100vh` cuenta la barra del navegador como si no estuviera, así
 * que el final del contenido queda debajo de ella.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`dark bg-slate-900 text-white ${PANTALLA_PUBLICA_QUE_SE_DESPLAZA}`}>
      {children}
    </div>
  );
}
