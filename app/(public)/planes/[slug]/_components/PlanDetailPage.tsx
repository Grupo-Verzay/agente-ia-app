"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Play,
  PlayCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { elDibujoDelRecuadro } from "@/components/shared/DibujoDelRecuadro";
import { GuiaDesplegada } from "@/components/guia/GuiaDesplegada";
import { cn } from "@/lib/utils";
import {
  conReproduccionAutomatica,
  type BloqueDeLaPagina,
  type BotonDelPlan,
  type FuncionQueSeEnsena,
  type PreguntaDelPlan,
  type TutorialDeLaFuncion,
} from "@/lib/pagina-de-plan";
import { ANCHO_DE_LA_LANDING } from "@/lib/ancho-de-la-landing";
import type { PaginaDelPlan } from "@/lib/pagina-de-plan.server";
import { estaEnUnMarco, recordarLaAsistencia } from "@/lib/enlaces-de-planes";

/**
 * La página pública de un plan. Arranca DIRECTO con el video —el nombre, el
 * tipo de asistencia, la descripción y el precio ya los dijo la tarjeta de la
 * landing de la que se viene— y después, en el orden que el panel de Planes
 * haya arrastrado (`pagina.orden`; el de fábrica es este):
 *
 *   1. el video de ESE plan (enlace o archivo subido), si tiene;
 *   2. para quién es, con un caso típico de negocio;
 *   3. el resumen de capacidad: los recuadros que el panel haya puesto a ESE
 *      plan, con su icono y su dato (un recuadro sin dato no sale, nunca un
 *      «No incluido»);
 *   4. qué incluye: NACE PLEGADO bajo un solo encabezado («Qué incluye este
 *      plan», con cuántas funciones trae), para que se decida si abrirlo o
 *      seguir bajando. Dentro, UNA tarjeta por función encendida, en una sola
 *      columna y en el orden del editor de funciones; cada una es un
 *      desplegable, como las preguntas, que al abrirse enseña ahí mismo su
 *      descripción y el video de su tutorial. Si el tutorial es una guía de
 *      la plataforma, «Ver la guía paso a paso» la DESPLIEGA ahí mismo, debajo
 *      del video (que se compacta para dejarle sitio): nada saca a nadie de la
 *      página ni abre otra pestaña;
 *   5. las preguntas frecuentes de ese plan, si tiene;
 *   6. el cierre: SIN título, solo el precio en blanco destacado y debajo el
 *      botón verde «Comenzar con el plan <nombre>» (`elTextoDelBotonDelPlan`),
 *      UNA sola vez, con la línea discreta al plan inmediato superior.
 *
 * En la barra fija no hay botón: se decide después de leer lo que trae el plan.
 *
 * **Todos los bloques y la barra miden lo mismo: el ancho de la landing**
 * (`ANCHO_DE_LA_LANDING`), sin cajas más angostas ni más anchas entre sí, y
 * sin rayas entre ellos: el aire de cada uno (`ESPACIO_DEL_BLOQUE`) es lo que
 * los separa.
 *
 * No hay ni un texto de venta escrito aquí: todo llega armado de
 * `lib/pagina-de-plan.server.ts`, que lo lee del panel de Planes.
 */

/** Solo el color: es estilo, no texto. */
const COLOR_DEL_PLAN: Record<string, string> = {
  lite: "from-slate-500 to-slate-600",
  basico: "from-emerald-500 to-emerald-600",
  intermedio: "from-blue-500 to-blue-600",
  avanzado: "from-violet-500 to-violet-600",
  enterprise: "from-amber-500 to-amber-600",
  personalizado: "from-rose-500 to-rose-600",
};

/** Un enlace de la plataforma va en la misma pestaña; uno de fuera, en otra y sin `opener`. */
function Enlace({
  url,
  externo,
  className,
  children,
  ...resto
}: {
  url: string;
  externo: boolean;
  className?: string;
  children: React.ReactNode;
} & Record<`data-${string}`, string>) {
  if (externo) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className} {...resto}>
        {children}
      </a>
    );
  }
  // Sin precarga: el registro lee la modalidad de la cookie que esta página
  // apunta al montarse (`lib/enlaces-de-planes.ts`), y una precarga podría
  // pedirlo antes de que quede puesta.
  return (
    <Link href={url} prefetch={false} className={className} {...resto}>
      {children}
    </Link>
  );
}

/**
 * El botón de comenzar es VERDE en todos los planes: es la única acción de la
 * página y tiene que leerse igual en cualquiera (el color del plan queda para
 * el marco del video). Su texto lo pone `elTextoDelBotonDelPlan`.
 */
const VERDE_DEL_BOTON = "bg-emerald-600 hover:bg-emerald-500";

function BotonPrincipal({ boton }: { boton: BotonDelPlan }) {
  return (
    <Enlace url={boton.url} externo={boton.externo} data-boton="principal">
      <Button size="lg" className={cn("w-full border-0 px-8 text-base font-semibold text-white sm:w-auto", VERDE_DEL_BOTON)}>
        {boton.texto}
      </Button>
    </Enlace>
  );
}

function BotonSecundario({ boton }: { boton: BotonDelPlan }) {
  return (
    <Enlace url={boton.url} externo={boton.externo} data-boton="secundario">
      <Button size="lg" variant="outline" className="w-full border-white/20 bg-transparent px-8 text-white hover:bg-white/10 sm:w-auto">
        {boton.texto}
      </Button>
    </Enlace>
  );
}

function VideoDelPlan({ video }: { video: NonNullable<PaginaDelPlan["video"]> }) {
  const [reproduciendo, setReproduciendo] = useState(false);

  if (video.tipo === "archivo") {
    return (
      <div className="overflow-hidden rounded-lg bg-black" data-video="archivo">
        <video
          src={video.url}
          poster={video.miniatura ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
          aria-label={video.titulo}
        />
      </div>
    );
  }

  if (reproduciendo || !video.miniatura) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black" data-video="iframe">
        <iframe
          src={reproduciendo ? conReproduccionAutomatica(video.url) : video.url}
          title={video.titulo}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setReproduciendo(true)}
      className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-black text-left"
      aria-label={`Reproducir: ${video.titulo}`}
      data-video="miniatura"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={video.miniatura} alt="" className="h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/50">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl">
          <Play className="h-6 w-6 fill-slate-900 text-slate-900" />
        </span>
      </span>
    </button>
  );
}

/**
 * El marco del video: se distingue del fondo oscuro de la página para que se
 * lea como un VIDEO y no como una imagen más o un hueco negro. Un borde con el
 * color del plan, un fondo más claro que la página y una fila arriba con el
 * icono de reproducir y el título. El video va dentro, sin borde propio.
 */
function MarcoDelVideo({
  titulo,
  gradiente,
  children,
}: {
  titulo: string;
  gradiente: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl bg-gradient-to-br p-px shadow-2xl shadow-black/60", gradiente)} data-marco-del-video>
      <div className="rounded-[15px] bg-slate-800/95 p-2 sm:p-3">
        <div className="flex items-center gap-2.5 px-1 pb-2 sm:pb-3" data-cabecera-del-video>
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br", gradiente)}>
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </span>
          <span className="min-w-0 text-sm font-semibold leading-snug text-white">{titulo}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Preguntas({ preguntas }: { preguntas: PreguntaDelPlan[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {preguntas.map((p, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-white/10" data-pregunta>
          <button
            type="button"
            onClick={() => setAbierta(abierta === i ? null : i)}
            aria-expanded={abierta === i}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-white hover:bg-white/5"
          >
            {p.question}
            {abierta === i ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            )}
          </button>
          {abierta === i && (
            <div className="whitespace-pre-line border-t border-white/10 px-5 pb-4 pt-3 text-sm leading-relaxed text-slate-400">
              {p.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * El aire de arriba y abajo de cada bloque, el mismo en todos. Sin rayas entre
 * bloques, este hueco es lo único que los separa: con uno distinto en cada
 * uno, la página se leería descuadrada.
 */
const ESPACIO_DEL_BLOQUE = "py-8 sm:py-10";

/**
 * El tutorial de una función, DENTRO de su desplegable: el video ahí mismo
 * (la demostración de la guía, o el reproductor del enlace propio) y debajo:
 *
 * - si es una guía de la plataforma, el botón «Ver la guía paso a paso», que
 *   la DESPLIEGA ahí mismo, debajo del video (`GuiaDesplegada`), y el video se
 *   compacta para dejarle sitio. Nada sale de la página ni abre otra pestaña;
 * - si es un enlace propio, el enlace para abrirlo en otra pestaña (no es
 *   nuestro: no se puede desplegar aquí).
 *
 * Ningún texto nombra la guía: varias funciones comparten la misma.
 */
function TutorialEnLaPagina({ tutorial, nombre }: { tutorial: TutorialDeLaFuncion; nombre: string }) {
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const video = useRef<HTMLDivElement>(null);
  const idDeLaGuia = useId();

  const abrirFuera = (
    <a
      href={tutorial.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300"
      data-abrir-tutorial={tutorial.url}
    >
      {tutorial.video ? "Abrir en otra pestaña" : tutorial.titulo}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );

  const verLaGuia = tutorial.modulo ? (
    <button
      type="button"
      onClick={() => setGuiaAbierta((v) => !v)}
      aria-expanded={guiaAbierta}
      aria-controls={idDeLaGuia}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300"
      data-ver-la-guia={tutorial.modulo}
    >
      <BookOpen className="h-3.5 w-3.5 shrink-0" />
      {guiaAbierta ? "Ocultar la guía paso a paso" : "Ver la guía paso a paso"}
      {guiaAbierta ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
    </button>
  ) : null;

  const reproductor = !tutorial.video ? null : tutorial.video.tipo === "archivo" ? (
    <video
      src={tutorial.video.url}
      poster={tutorial.portada ?? undefined}
      controls
      playsInline
      preload="metadata"
      className="block h-auto w-full rounded-lg bg-black"
      aria-label={`Tutorial: ${nombre}`}
      data-video-del-tutorial="archivo"
    />
  ) : (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        src={tutorial.video.url}
        title={`Tutorial: ${nombre}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full"
        data-video-del-tutorial="iframe"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {reproductor && (
        // Con la guía abierta el video se compacta: deja de ocupar el ancho y
        // le cede el sitio a la guía, sin dejar de poderse ver.
        <div
          ref={video}
          className={cn("scroll-mt-20 transition-[max-width] duration-300", guiaAbierta ? "max-w-[14rem] sm:max-w-sm" : "max-w-full")}
          data-video-compacto={guiaAbierta ? "si" : "no"}
        >
          {reproductor}
        </div>
      )}
      {verLaGuia ?? abrirFuera}
      {tutorial.modulo && guiaAbierta && (
        <GuiaDesplegada
          modulo={tutorial.modulo}
          id={idDeLaGuia}
          alVerElVideo={() => video.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
        />
      )}
    </div>
  );
}

/**
 * Qué incluye el plan: una fila por función, que se abre como las preguntas
 * frecuentes —una a la vez—. Cerrada enseña el nombre y, si tiene tutorial,
 * «Ver tutorial» a la derecha; abierta, su descripción y el tutorial ahí
 * mismo. Una función sin descripción ni tutorial no tiene nada que abrir: va
 * sin flecha y no es un botón.
 */
function QueIncluye({ funciones }: { funciones: FuncionQueSeEnsena[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const prefijo = useId();
  return (
    <ul className="space-y-3" data-lista-de-funciones>
      {funciones.map((f, i) => {
        const seAbre = Boolean(f.descripcion || f.tutorial);
        const estaAbierta = seAbre && abierta === f.id;
        const idDelCuerpo = `${prefijo}-funcion-${i}`;
        const cabeza = (
          <>
            <Check className="h-5 w-5 shrink-0 text-emerald-400" />
            {/* El nombre y su tutorial en la MISMA fila: el tutorial pegado a la derecha. */}
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3" data-fila-de-la-funcion>
              <span className="min-w-0 flex-1 text-base font-medium text-white" data-nombre-de-la-funcion>
                {f.nombre}
              </span>
              {f.tutorial && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-400"
                  data-tutorial={f.tutorial.url}
                >
                  <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                  {f.tutorial.titulo}
                </span>
              )}
            </span>
          </>
        );
        return (
          <li
            key={f.id}
            className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
            data-funcion={f.id}
            data-abierta={estaAbierta ? "si" : "no"}
          >
            {seAbre ? (
              <button
                type="button"
                onClick={() => setAbierta(estaAbierta ? null : f.id)}
                aria-expanded={estaAbierta}
                aria-controls={idDelCuerpo}
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-white/5"
                data-cabeza-de-la-funcion
              >
                {cabeza}
                {estaAbierta ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                )}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-5 py-4" data-cabeza-de-la-funcion>
                {cabeza}
                {/* El hueco de la flecha: el nombre arranca y acaba donde el de las demás. */}
                <span className="h-4 w-4 shrink-0" aria-hidden />
              </div>
            )}
            {estaAbierta && (
              <div id={idDelCuerpo} className="space-y-4 border-t border-white/10 px-5 pb-5 pt-4" data-cuerpo-de-la-funcion>
                {f.descripcion && (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-400" data-descripcion-de-la-funcion>
                    {f.descripcion}
                  </p>
                )}
                {f.tutorial && <TutorialEnLaPagina tutorial={f.tutorial} nombre={f.nombre} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * «Qué incluye este plan» nace PLEGADO bajo un solo encabezado: quien quiere
 * el detalle lo abre, y quien no sigue bajando hasta el precio sin recorrer
 * todas las funciones. La lista se queda montada y escondida (`hidden`), así
 * lo que se abrió dentro sigue abierto al volver a desplegarla.
 */
function BloqueQueIncluye({ funciones }: { funciones: FuncionQueSeEnsena[] }) {
  const [abierto, setAbierto] = useState(false);
  const idDeLaLista = useId();
  return (
    <div data-que-incluye={abierto ? "abierto" : "plegado"}>
      <h2>
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-controls={idDeLaLista}
          className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-5 text-left hover:bg-white/5"
          data-abrir-que-incluye
        >
          <span className="min-w-0">
            <span className="block text-xl font-bold text-white sm:text-2xl" data-titulo-del-bloque>Qué incluye este plan</span>
            <span className="mt-1 block text-sm font-normal text-slate-400" data-cuantas-funciones>
              {funciones.length === 1 ? "1 función" : `${funciones.length} funciones`}
            </span>
          </span>
          {abierto ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
          )}
        </button>
      </h2>
      <div id={idDeLaLista} className="mt-4" hidden={!abierto}>
        <QueIncluye funciones={funciones} />
      </div>
    </div>
  );
}

/**
 * Cuántas columnas lleva el resumen según cuántos recuadros haya (de uno a
 * `TOPE_DE_RECUADROS`): filas llenas, nunca una última fila con uno suelto.
 * Uno solo ocupa el ancho del bloque, como todos: nada más angosto.
 * Clases literales: Tailwind no ve las compuestas.
 */
const COLUMNAS_DE_CAPACIDAD: Record<number, string> = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3",
  6: "sm:grid-cols-2 lg:grid-cols-3",
};

export function PlanDetailPage({ pagina }: { pagina: PaginaDelPlan }) {
  const gradiente = COLOR_DEL_PLAN[pagina.plan] ?? "from-blue-500 to-blue-600";
  const { principal, secundario } = pagina.botones;
  const anio = new Date().getFullYear();

  // La modalidad que se está enseñando (puede no ser la pedida, si ese nivel
  // no se vende así) queda apuntada para el registro: la dirección ya no la
  // lleva (`lib/enlaces-de-planes.ts`).
  useEffect(() => {
    recordarLaAsistencia(pagina.tipo, { entreSitios: estaEnUnMarco() });
  }, [pagina.tipo]);

  /** Cada bloque, o `null` si ese plan no tiene qué enseñar en él. */
  const bloque = (clave: BloqueDeLaPagina): React.ReactNode => {
    switch (clave) {
      case "video":
        return pagina.video ? (
          <section key={clave} className={ESPACIO_DEL_BLOQUE} data-seccion="video">
            <div className={ANCHO_DE_LA_LANDING} data-ancho-del-bloque>
              <MarcoDelVideo titulo={pagina.video.titulo} gradiente={gradiente}>
                <VideoDelPlan video={pagina.video} />
              </MarcoDelVideo>
            </div>
          </section>
        ) : null;

      case "paraquien":
        return (
          <section key={clave} className={ESPACIO_DEL_BLOQUE} data-seccion="paraquien">
            <div className={cn(ANCHO_DE_LA_LANDING, "grid gap-4 md:grid-cols-2")} data-ancho-del-bloque>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5" data-para-quien>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
                  <Users className="h-4 w-4" /> Para quién es este plan
                </div>
                <p className="mt-3 text-base leading-relaxed text-white">{pagina.paraQuien.paraQuien}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5" data-caso-tipico>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
                  <Briefcase className="h-4 w-4" /> Un caso típico
                </div>
                <p className="mt-3 text-base leading-relaxed text-slate-300">{pagina.paraQuien.caso}</p>
              </div>
            </div>
          </section>
        );

      case "capacidad":
        return pagina.capacidad.length > 0 ? (
          <section key={clave} className={ESPACIO_DEL_BLOQUE} data-seccion="capacidad">
            <div
              className={cn(ANCHO_DE_LA_LANDING, "grid gap-4", COLUMNAS_DE_CAPACIDAD[pagina.capacidad.length] ?? "sm:grid-cols-3")}
              data-ancho-del-bloque
            >
              {pagina.capacidad.map((t) => {
                const Icono = elDibujoDelRecuadro(t.icono);
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
                    data-capacidad={t.id}
                    data-icono={t.icono}
                  >
                    {t.titulo && (
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-400">
                        <Icono className="h-4 w-4 shrink-0" /> {t.titulo}
                      </div>
                    )}
                    <div className={cn("text-2xl font-bold text-white", t.titulo ? "mt-2" : "flex items-center gap-2")}>
                      {!t.titulo && <Icono className="h-5 w-5 shrink-0 text-slate-400" />}
                      {t.valor}
                    </div>
                    {t.detalle && <p className="mt-1 text-sm text-slate-400">{t.detalle}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null;

      case "funciones":
        return pagina.funciones.length > 0 ? (
          <section key={clave} className={ESPACIO_DEL_BLOQUE} data-seccion="funciones">
            <div className={ANCHO_DE_LA_LANDING} data-ancho-del-bloque>
              <BloqueQueIncluye funciones={pagina.funciones} />
            </div>
          </section>
        ) : null;

      case "preguntas":
        return pagina.preguntas.length > 0 ? (
          <section key={clave} className={ESPACIO_DEL_BLOQUE} data-seccion="preguntas">
            <div className={ANCHO_DE_LA_LANDING} data-ancho-del-bloque>
              <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">Preguntas frecuentes</h2>
              <Preguntas preguntas={pagina.preguntas} />
            </div>
          </section>
        ) : null;

      case "comenzar":
        return (
          <section key={clave} className={ESPACIO_DEL_BLOQUE} data-seccion="comenzar">
            <div className={cn(ANCHO_DE_LA_LANDING, "text-center")} data-ancho-del-bloque>
              {/* Sin título: el precio, en blanco, es lo que se lee antes del botón. */}
              <p
                className={cn(
                  "font-bold text-white",
                  pagina.precio.aConsultar ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl",
                )}
                data-precio-final
              >
                {pagina.precio.aConsultar ? "Precio a consultar según tu operación." : `${pagina.precio.texto} USD al mes`}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <BotonPrincipal boton={principal} />
                {secundario && <BotonSecundario boton={secundario} />}
              </div>
              {pagina.planSuperior && (
                <p className="mt-8 text-sm text-slate-500" data-plan-superior={pagina.planSuperior.plan}>
                  ¿Necesitas más capacidad?{" "}
                  <Link
                    href={pagina.planSuperior.url}
                    // Su modalidad viaja en la cookie, no en la dirección; sin
                    // precarga, que se pediría sin ella.
                    prefetch={false}
                    onClick={() => recordarLaAsistencia(pagina.planSuperior?.tipo, { entreSitios: estaEnUnMarco() })}
                    className="inline-flex items-center gap-1 font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
                  >
                    Conoce el plan {pagina.planSuperior.nombre} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </p>
              )}
            </div>
          </section>
        );
    }
  };

  return (
    <div className="min-h-full bg-[#0a0f1a] text-white" data-pagina-de-plan={pagina.plan}>
      {/* ── Barra ── */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0f1a]/95 backdrop-blur-sm">
        <div className={cn(ANCHO_DE_LA_LANDING, "flex items-center justify-between gap-3 py-3")} data-ancho-de-la-barra>
          <Link href="/inicio#pricing" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver a planes
          </Link>
        </div>
      </div>

      {/* El nombre lo leen los lectores de pantalla y los buscadores; a la vista ya lo dijo la tarjeta. */}
      <h1 className="sr-only" data-nombre-del-plan>
        Plan {pagina.nombre}
      </h1>

      {/* Los bloques, en el orden del panel, sin rayas entre ellos: los separa su propio aire. */}
      <main data-bloques>
        {pagina.orden.map(bloque)}
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <div className={ANCHO_DE_LA_LANDING}>
          © {anio} {pagina.marca}
        </div>
      </footer>
    </div>
  );
}
