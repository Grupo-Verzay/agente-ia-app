'use client';

import { Workflow } from "@prisma/client";
import type { CurrentUser } from '@/lib/auth';
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreateAutoReplies } from "./CreateAutoReplies";
import { SortableAutoRepliesList } from "./SortableAutoRepliesList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckSquare, GitBranch, InboxIcon, MessageSquareText, MessagesSquare, Search } from "lucide-react";
import { PastillasDeMetricas } from "@/components/shared/PastillasDeMetricas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getQuickReplyCategoryLabel,
  normalizeQuickReplyCategory,
  QUICK_REPLY_CATEGORIES,
} from "@/lib/quick-reply-categories";
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas, useSeleccionMultiple } from '@/components/shared/AccionesMasivas';
import { eliminarRespuestasRapidasAction } from '@/actions/borrado-en-bloque-actions';
import type { RespuestaRapida } from '@/actions/rr-actions';
import {
  hayFiltroPuesto,
  losNumerosPorTipo,
  pasaLaBusqueda,
  pasaLosFiltros,
  porQueNoSePuedeOrdenar,
  SIN_FILTROS,
  TODAS_LAS_CATEGORIAS,
  type FiltroDeTipo,
} from "@/lib/respuestas-rapidas";
import { COLOR_DE_TODAS, COLOR_DEL_TIPO } from "./colores-de-las-respuestas";

interface Props {
  user: CurrentUser;
  Workflows: Workflow[];
  autoReplies: RespuestaRapida[];
}

/**
 * Respuestas rápidas (`/auto-replies`).
 *
 * # La barra, como la de las demás pantallas de lista
 *
 * - **Las pastillas FILTRAN.** Eran cuatro cifras sueltas —Total, Texto simple,
 *   Ejecutan flujo y Categorías— y ninguna hacía nada al pulsarla, que es justo
 *   lo que la regla de la barra prohíbe: *si una cifra no filtra, se borra*.
 *   Las tres primeras son ya el filtro de tipo; la de «Categorías» contaba
 *   cuántas categorías había, que no se puede filtrar, y en su sitio va el
 *   desplegable que SÍ filtra por categoría.
 * - **El botón azul dice «Nuevo»**, como en las otras veintiocho pantallas.
 * - **El `⋯` de las acciones masivas** borra las marcadas de una vez.
 *
 * # Y la lista no se reordena con un filtro puesto
 *
 * Se veía un trozo y se guardaba ese trozo numerado desde cero: las respuestas
 * escondidas perdían su sitio y saltaban al quitar el filtro. Ahora el asa lo
 * dice (`porQueNoSePuedeOrdenar`).
 */
export const MainAutoReplies = ({ user, Workflows, autoReplies = [] }: Props) => {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<FiltroDeTipo>(SIN_FILTROS.tipo);
  const [categoria, setCategoria] = useState<string>(SIN_FILTROS.categoria);
  const [creando, setCreando] = useState(false);

  const filtros = { tipo, categoria, busqueda: search };
  const numeros = useMemo(() => losNumerosPorTipo(autoReplies), [autoReplies]);
  const porCategoria = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const reply of autoReplies) {
      const c = normalizeQuickReplyCategory(reply.category);
      cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    }
    return cuenta;
  }, [autoReplies]);

  const filteredAutoReplies = useMemo(() => {
    return autoReplies.filter(reply => {
      const categoriaDeLaFila = normalizeQuickReplyCategory(reply.category);
      if (!pasaLosFiltros(reply, { tipo, categoria }, categoriaDeLaFila)) return false;
      const workflowName = Workflows.find(workflow => workflow.id === reply.workflowId)?.name ?? "";
      return pasaLaBusqueda(reply, search, workflowName, getQuickReplyCategoryLabel(reply.category));
    });
  }, [Workflows, autoReplies, search, tipo, categoria]);

  // Solo se marcan las que se pueden borrar: una casilla en una respuesta que
  // quien mira no puede tocar es ofrecerle marcar filas para nada.
  const seleccion = useSeleccionMultiple(
    filteredAutoReplies.filter((r) => r.editable !== false).map((r) => String(r.id)),
  );
  const marcados = useMemo(() => new Set(seleccion.seleccionados), [seleccion.seleccionados]);

  if (!autoReplies) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Algo salió mal. Por favor intenta más tarde.</AlertDescription>
      </Alert>
    );
  }

  const quitarFiltros = () => {
    setSearch(SIN_FILTROS.busqueda);
    setTipo(SIN_FILTROS.tipo);
    setCategoria(SIN_FILTROS.categoria);
  };

  const borrarLasMarcadas = async (ids: string[]) => {
    const resumen = await eliminarRespuestasRapidasAction(ids.map(Number));
    if (!resumen.success) toast.error(resumen.message);
    return { fallaron: resumen.fallaron };
  };

  // Pulsar la pastilla puesta la quita: vuelve a «todas».
  const alternarTipo = (t: FiltroDeTipo) => setTipo((antes) => (antes === t ? "todas" : t));

  return (
    <div className="flex h-full flex-col gap-2" data-pantalla="respuestas-rapidas">
      <CreateAutoReplies user={user} Workflows={Workflows} open={creando} setOpen={setCreando} />

      <BarraDeAcciones
        className="p-1"
        buscador={
          <div className="relative w-56 shrink-0 sm:w-64" data-zona="buscador">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar respuesta..."
              aria-label="Buscar respuesta"
              className="pl-8 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        }
        filtros={
          <div className="flex items-center gap-1" data-zona="filtros">
            {/* Son el filtro de tipo, y la única forma de llegar a él: por eso
                salen también en el teléfono (`enElTelefono`). */}
            <PastillasDeMetricas
              enElTelefono
              metricas={[
                { clave: 'todas', icono: <MessagesSquare />, etiqueta: 'Todas', valor: numeros.todas, color: COLOR_DE_TODAS, ayuda: 'Todas las respuestas rápidas', alPulsar: () => setTipo('todas'), activa: tipo === 'todas' },
                { clave: 'texto', icono: <MessageSquareText />, etiqueta: 'Texto simple', valor: numeros.texto, color: COLOR_DEL_TIPO.texto, ayuda: 'Las que envían un mensaje de texto', alPulsar: () => alternarTipo('texto'), activa: tipo === 'texto' },
                { clave: 'flujo', icono: <GitBranch />, etiqueta: 'Ejecutan flujo', valor: numeros.flujo, color: COLOR_DEL_TIPO.flujo, ayuda: 'Las que activan un flujo automatizado', alPulsar: () => alternarTipo('flujo'), activa: tipo === 'flujo' },
              ]}
            />
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger
                data-zona="filtro-de-categoria"
                aria-label="Filtrar por categoría"
                className={
                  "h-9 w-auto min-w-[9.5rem] gap-2 text-sm " +
                  (categoria !== TODAS_LAS_CATEGORIAS ? "border-blue-500 text-blue-700 dark:text-blue-300" : "")
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_LAS_CATEGORIAS}>Todas las categorías</SelectItem>
                {QUICK_REPLY_CATEGORIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label} ({porCategoria.get(item.value) ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        crear={<BotonDeCrear onClick={() => setCreando(true)}>Nuevo</BotonDeCrear>}
        acciones={
          <AccionesMasivas
            seleccionados={seleccion.seleccionados}
            queSon="respuestas"
            onEliminar={borrarLasMarcadas}
            extras={[
              {
                clave: 'marcar-todas',
                etiqueta: seleccion.estanTodos ? 'Desmarcar todas' : 'Marcar todas las que se ven',
                icono: <CheckSquare className="h-4 w-4" />,
                onSelect: seleccion.alternarTodos,
                sinSeleccion: true,
              },
            ]}
            onTerminar={() => { seleccion.limpiar(); router.refresh(); }}
          />
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-2">
          {filteredAutoReplies.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10" data-zona="lista-vacia">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
                <InboxIcon size={40} className="stroke-primary" />
              </div>
              <div className="flex flex-col gap-1 text-center">
                <p className="font-bold">
                  {autoReplies.length === 0 ? "Todavía no hay respuestas rápidas" : "No se encontraron respuestas"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {autoReplies.length === 0
                    ? "Crea la primera y úsala en tus chats escribiendo «/» y su atajo."
                    : "Prueba con otro término o quita los filtros."}
                </p>
              </div>
              {autoReplies.length === 0 ? (
                <Button onClick={() => setCreando(true)}>Crea tu primera respuesta rápida</Button>
              ) : (
                <Button variant="outline" onClick={quitarFiltros}>Quitar filtros</Button>
              )}
            </div>
          ) : (
            <SortableAutoRepliesList
              autoReplies={filteredAutoReplies}
              workflows={Workflows}
              cuentaId={user.effectiveId}
              bloqueo={porQueNoSePuedeOrdenar(filtros)}
              marcados={marcados}
              onMarcar={seleccion.alternar}
            />
          )}
        </div>
      </div>
      {hayFiltroPuesto(filtros) && filteredAutoReplies.length > 0 && (
        <p className="shrink-0 px-1 text-xs text-muted-foreground" data-zona="aviso-de-filtro">
          {filteredAutoReplies.length} de {autoReplies.length} · Quita los filtros para reordenar.
        </p>
      )}
    </div>
  );
};
