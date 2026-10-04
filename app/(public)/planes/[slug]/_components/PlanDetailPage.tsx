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
  ExternalLink,
  Home,
  Play,
  PlayCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { elDibujoDelRecuadro } from "@/components/shared/DibujoDelRecuadro";
import { GuiaDesplegada } from "@/components/guia/GuiaDesplegada";
import { VideoDelPlan } from "@/components/planes/VideoDelPlan";
import { cn } from "@/lib/utils";
import {
  cuantoBajarParaVerLaGuia,
  elRepartoDeLasFunciones,
  seVeLaFuncion,
  type BloqueDeLaPagina,
  type BotonDelPlan,
  type FuncionQueSeEnsena,
  type PreguntaDelPlan,
  type TutorialDeLaFuncion,
} from "@/lib/pagina-de-plan";
import { ANCHO_DE_LA_LANDING } from "@/lib/ancho-de-la-landing";
import { PieDeLasPublicas } from "@/components/shared/PieDeLasPublicas";
import { AIRE_ENCIMA_DEL_PIE } from "@/lib/pie-de-las-publicas";
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
 *   4. qué incluye: el título centrado («Qué incluye este plan», con cuántas
 *      funciones trae) y debajo, DE ENTRADA, solo las funciones DESTACADAS
 *      —la misma marca que decide la tarjeta corta de la landing—; «Ver todas
 *      las funciones» enseña TODAS en el orden del editor de principio a fin,
 *      cada una en su sitio entre las destacadas (no al final). UNA
 *      tarjeta por función, en una sola columna; cada una es un desplegable,
 *      como las preguntas, que al abrirse enseña ahí mismo su descripción y el
 *      video de su tutorial. Si el tutorial es una guía de la plataforma, la
 *      fila «Guía paso a paso» lleva a la derecha «Ver guía», que la DESPLIEGA
 *      ahí mismo, justo debajo del video —que sigue en su sitio— y sin mover
 *      la página; «Ocultar guía» la recoge. Nada saca a nadie de la página ni
 *      abre otra pestaña;
 *   5. las preguntas frecuentes de ese plan, si tiene;
 *   6. el cierre: SIN título, solo el precio en blanco destacado y debajo el
 *      botón verde «Comenzar con el plan <nombre>» (`elTextoDelBotonDelPlan`),
 *      UNA sola vez, con la línea discreta al plan inmediato superior.
 *
 * En la barra fija no hay botón de comprar: se decide después de leer lo que
 * trae el plan. Lleva «Volver a planes» a la izquierda e «Inicio» (la landing
 * principal) a la derecha.
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
export const COLOR_DEL_PLAN: Record<string, string> = {
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
export const VERDE_DEL_BOTON = "bg-emerald-600 hover:bg-emerald-500";

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

/**
 * El marco del video: se distingue del fondo oscuro de la página para que se
 * lea como un VIDEO y no como una imagen más o un hueco negro. Un borde con el
 * color del plan, un fondo más claro que la página y una fila arriba con el
 * icono de reproducir y el título. El video va dentro, sin borde propio.
 */
export function MarcoDelVideo({
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
      <div className="rounded-[15px] bg-plan-marco/95 p-2 sm:p-3">
        <div className="flex items-center gap-2.5 px-1 pb-2 sm:pb-3" data-cabecera-del-video>
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br", gradiente)}>
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </span>
          <span className="min-w-0 text-sm font-semibold leading-snug text-plan-tinta">{titulo}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * La flecha de abrir y cerrar, la MISMA en todos los desplegables de la página
 * (cada función, «Ver todas las funciones», cada pregunta). Era un
 * `slate-400` suelto sobre el fondo casi negro y casi no se distinguía: ahora
 * es blanca, dentro de un círculo claro, y gira al abrirse.
 */
export function FlechaDelDesplegable({ abierto }: { abierto: boolean }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-plan-tinta/15 text-plan-tinta"
      aria-hidden
      data-flecha-del-desplegable={abierto ? "abierta" : "cerrada"}
    >
      <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", abierto && "rotate-180")} />
    </span>
  );
}

/** El hueco de la flecha, para una fila que no se abre: el texto acaba donde el de las demás. */
const HUECO_DE_LA_FLECHA = "h-6 w-6 shrink-0";

function Preguntas({ preguntas }: { preguntas: PreguntaDelPlan[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {preguntas.map((p, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-plan-tinta/10" data-pregunta>
          <button
            type="button"
            onClick={() => setAbierta(abierta === i ? null : i)}
            aria-expanded={abierta === i}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-plan-tinta hover:bg-plan-tinta/5"
          >
            {p.question}
            <FlechaDelDesplegable abierto={abierta === i} />
          </button>
          {abierta === i && (
            <div className="whitespace-pre-line border-t border-plan-tinta/10 px-5 pb-4 pt-3 text-sm leading-relaxed text-plan-suave">
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
 * - si es una guía de la plataforma, la fila «Guía paso a paso», con el mismo
 *   reparto que la cabecera de la función (el título a la izquierda, la
 *   acción a la derecha): «Ver guía» la DESPLIEGA ahí mismo
 *   (`GuiaDesplegada`), justo debajo del video, que SIGUE en su sitio pero
 *   se COMPACTA (`VIDEO_COMPACTO`) para cederle el ancho; «Ocultar guía» la
 *   recoge y el video vuelve a su tamaño. Nada sale de la página ni abre otra
 *   pestaña;
 * - si es un enlace propio, el enlace para abrirlo en otra pestaña (no es
 *   nuestro: no se puede desplegar aquí).
 *
 * Abrir la guía NO mueve la página: el video se compacta con su BORDE DE
 * ARRIBA quieto, así que lo único que se mueve es lo de debajo (la fila y la
 * guía suben). Solo si el principio de la guía queda por debajo del borde de
 * la vista se baja lo justo para verlo, sin que el video se vaya por arriba
 * (`cuantoBajarParaVerLaGuia`). Esconder el video al abrir —como se hizo—
 * encogía lo de arriba de golpe y el navegador recolocaba la página: la guía y
 * el video quedaban fuera de vista. Y la compactación va SIN transición: el
 * efecto que decide si bajar mide la vista ya compactada.
 *
 * Es el MISMO componente en la página del plan y en una propuesta, así que los
 * dos hacen exactamente lo mismo.
 *
 * Ningún texto nombra la guía: varias funciones comparten la misma.
 */
/** El video con la guía abierta: deja de ocupar el ancho, sin dejar de poderse ver. */
export const VIDEO_COMPACTO = "max-w-[14rem] sm:max-w-sm";

function TutorialEnLaPagina({
  tutorial,
  nombre,
  enLaPropuesta = false,
}: {
  tutorial: TutorialDeLaFuncion;
  nombre: string;
  /** Dentro de una propuesta: nada sale a otra página y la guía sigue el tema del dispositivo. */
  enLaPropuesta?: boolean;
}) {
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLDivElement>(null);
  const idDeLaGuia = useId();

  // Al abrir la guía la página se queda donde estaba; solo si su principio cae
  // por debajo de la vista se baja lo justo para verlo (`cuantoBajarParaVerLaGuia`).
  useEffect(() => {
    if (!guiaAbierta) return;
    const raiz = caja.current;
    const laGuia = raiz?.querySelector<HTMLElement>("[data-guia-desplegada]");
    const abierto = video.current ?? raiz?.querySelector<HTMLElement>("[data-fila-de-la-guia]");
    if (!raiz || !laGuia || !abierto) return;
    const quien = quienSeDesplaza(raiz);
    const vista = laVistaDe(quien);
    const bajar = cuantoBajarParaVerLaGuia({
      arribaDeLaGuia: laGuia.getBoundingClientRect().top,
      arribaDeLoAbierto: abierto.getBoundingClientRect().top,
      inicioDeLaVista: vista.arriba + (parseFloat(getComputedStyle(laGuia).scrollMarginTop) || 0),
      finDeLaVista: vista.abajo,
    });
    if (bajar > 0) quien.scrollBy({ top: bajar, behavior: "smooth" });
  }, [guiaAbierta]);

  // «Ir al vídeo» desde la guía: el video sigue pintado encima, así que solo
  // se sube hasta él; la guía se queda abierta.
  const irAlVideo = () => {
    const destino = video.current ?? caja.current;
    destino?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const abrirFuera = (
    <a
      href={tutorial.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-plan-acento hover:text-plan-acento-fuerte"
      data-abrir-tutorial={tutorial.url}
    >
      {tutorial.video ? "Abrir en otra pestaña" : tutorial.titulo}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );

  // La fila de la guía: el título a la izquierda y la acción a la derecha,
  // como la cabecera de la función («nombre» … «Ver tutorial»).
  const filaDeLaGuia = tutorial.modulo ? (
    <div className="flex items-center justify-between gap-3" data-fila-de-la-guia>
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-plan-tinta" data-titulo-de-la-guia>
        <BookOpen className="h-4 w-4 shrink-0 text-plan-acento" />
        Guía paso a paso
      </span>
      <button
        type="button"
        onClick={() => setGuiaAbierta((v) => !v)}
        aria-expanded={guiaAbierta}
        aria-controls={idDeLaGuia}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-plan-acento hover:text-plan-acento-fuerte"
        data-ver-la-guia={tutorial.modulo}
      >
        {guiaAbierta ? "Ocultar guía" : "Ver guía"}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", guiaAbierta && "rotate-180")} />
      </button>
    </div>
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
    <div ref={caja} className="space-y-3">
      {/* El video se queda pintado también con la guía abierta —quitarlo
          encogía lo de arriba de golpe y la página saltaba— pero se compacta
          con su borde de arriba quieto, para cederle el sitio a la guía. */}
      {reproductor && (
        <div
          ref={video}
          className={cn("scroll-mt-20", guiaAbierta ? VIDEO_COMPACTO : "max-w-full")}
          data-caja-del-video
          data-video-compacto={guiaAbierta ? "si" : "no"}
        >
          {reproductor}
        </div>
      )}
      {filaDeLaGuia ?? (enLaPropuesta ? null : abrirFuera)}
      {tutorial.modulo && guiaAbierta && (
        <GuiaDesplegada
          modulo={tutorial.modulo}
          id={idDeLaGuia}
          alVerElVideo={irAlVideo}
          sinSalidas={enLaPropuesta}
          tema={enLaPropuesta ? "dispositivo" : undefined}
        />
      )}
    </div>
  );
}

/**
 * El contenedor que de verdad se desplaza. Una página pública lleva el suyo
 * (`PANTALLA_PUBLICA_QUE_SE_DESPLAZA`: el `<body>` de la App no se desplaza),
 * así que desplazar la ventana no movería nada.
 */
function quienSeDesplaza(desde: HTMLElement): HTMLElement {
  for (let p = desde.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Dónde empieza y acaba lo que se ve de ese contenedor, en coordenadas de la ventana. */
function laVistaDe(quien: HTMLElement): { arriba: number; abajo: number } {
  if (quien === document.scrollingElement || quien === document.documentElement) {
    return { arriba: 0, abajo: window.innerHeight };
  }
  const r = quien.getBoundingClientRect();
  return { arriba: Math.max(0, r.top), abajo: Math.min(window.innerHeight, r.bottom) };
}

/**
 * La lista de funciones: una fila por función, que se abre como las preguntas
 * frecuentes. Cerrada enseña el nombre y, si tiene tutorial, «Ver tutorial» a
 * la derecha; abierta, su descripción y el tutorial ahí mismo. Una función sin
 * descripción ni tutorial no tiene nada que abrir: va sin flecha y no es un
 * botón. Cuál está abierta lo lleva el bloque, y solo una a la vez.
 *
 * Es UNA lista, en el orden del editor de principio a fin: lo que no se ve
 * todavía (`seVeLaFuncion`) va en SU sitio, montado y escondido (`hidden`), así
 * que «Ver todas» lo enseña donde va y no al final. Y lo que se abrió dentro
 * sigue abierto al volver a desplegar.
 */
function QueIncluye({
  id,
  funciones,
  todas,
  abierta,
  alAbrir,
  enLaPropuesta = false,
}: {
  id: string;
  funciones: FuncionQueSeEnsena[];
  todas: boolean;
  abierta: string | null;
  alAbrir: (id: string | null) => void;
  enLaPropuesta?: boolean;
}) {
  const prefijo = useId();
  return (
    <ul id={id} className="space-y-3" data-lista-de-funciones>
      {funciones.map((f, i) => {
        const seAbre = Boolean(f.descripcion || f.tutorial);
        const estaAbierta = seAbre && abierta === f.id;
        const idDelCuerpo = `${prefijo}-funcion-${i}`;
        const cabeza = (
          <>
            <Check className="h-5 w-5 shrink-0 text-plan-check" />
            {/* El nombre y su tutorial en la MISMA fila: el tutorial pegado a la derecha. */}
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3" data-fila-de-la-funcion>
              <span className="min-w-0 flex-1 text-base font-medium text-plan-tinta" data-nombre-de-la-funcion>
                {f.nombre}
              </span>
              {f.tutorial && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-plan-acento"
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
            className="overflow-hidden rounded-xl border border-plan-tinta/10 bg-plan-tinta/[0.03]"
            hidden={!seVeLaFuncion(f, todas)}
            data-funcion={f.id}
            data-destacada={f.destacada ? "si" : "no"}
            data-abierta={estaAbierta ? "si" : "no"}
          >
            {seAbre ? (
              <button
                type="button"
                onClick={() => alAbrir(estaAbierta ? null : f.id)}
                aria-expanded={estaAbierta}
                aria-controls={idDelCuerpo}
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-plan-tinta/5"
                data-cabeza-de-la-funcion
              >
                {cabeza}
                <FlechaDelDesplegable abierto={estaAbierta} />
              </button>
            ) : (
              <div className="flex items-center gap-3 px-5 py-4" data-cabeza-de-la-funcion>
                {cabeza}
                {/* El hueco de la flecha: el nombre arranca y acaba donde el de las demás. */}
                <span className={HUECO_DE_LA_FLECHA} aria-hidden />
              </div>
            )}
            {estaAbierta && (
              <div id={idDelCuerpo} className="space-y-4 border-t border-plan-tinta/10 px-5 pb-5 pt-4" data-cuerpo-de-la-funcion>
                {f.descripcion && (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-plan-suave" data-descripcion-de-la-funcion>
                    {f.descripcion}
                  </p>
                )}
                {f.tutorial && <TutorialEnLaPagina tutorial={f.tutorial} nombre={f.nombre} enLaPropuesta={enLaPropuesta} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * «Qué incluye este plan»: el título CENTRADO, como el de las preguntas, y
 * debajo, de entrada, las funciones DESTACADAS —las mismas que salen en la
 * tarjeta corta de la landing (`elRepartoDeLasFunciones`)—. «Ver todas las
 * funciones» enseña las demás EN SU SITIO: la lista es una y va en el orden
 * del editor de principio a fin (`seVeLaFuncion`), no las destacadas primero y
 * el resto pegado detrás. Si todas son destacadas no hay botón; si no hay
 * ninguna, el botón las despliega todas.
 */
export function BloqueQueIncluye({
  funciones,
  enLaPropuesta = false,
}: {
  funciones: FuncionQueSeEnsena[];
  /** Dentro de una propuesta (`PlanEnLaPropuesta`). */
  enLaPropuesta?: boolean;
}) {
  const { deEntrada, resto } = elRepartoDeLasFunciones(funciones);
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const idDeLaLista = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const recogidoConElBoton = useRef(false);

  // Al recoger, el botón sube de golpe (la lista de encima se esconde): se
  // deja a la vista, o quien lo pulsó se queda mirando lo que había debajo.
  useEffect(() => {
    if (todas || !recogidoConElBoton.current) return;
    recogidoConElBoton.current = false;
    boton.current?.scrollIntoView({ block: "nearest" });
  }, [todas]);

  return (
    <div data-que-incluye={resto.length === 0 || todas ? "todas" : "destacadas"}>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl" data-titulo-del-bloque>Qué incluye este plan</h2>
        <p className="mt-2 text-sm text-plan-suave" data-cuantas-funciones>
          {funciones.length === 1 ? "1 función" : `${funciones.length} funciones`}
        </p>
      </div>
      {/* Sin ninguna destacada no hay nada que enseñar de entrada: la lista
          entera está escondida y la abre el botón. */}
      <QueIncluye enLaPropuesta={enLaPropuesta} id={idDeLaLista} funciones={funciones} todas={todas} abierta={abierta} alAbrir={setAbierta} />
      {resto.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            ref={boton}
            type="button"
            onClick={() => {
              if (todas) recogidoConElBoton.current = true;
              setTodas((t) => !t);
            }}
            aria-expanded={todas}
            aria-controls={idDeLaLista}
            className="inline-flex items-center gap-3 rounded-full border border-plan-tinta/15 bg-plan-tinta/[0.04] py-2 pl-5 pr-2 text-sm font-medium text-plan-tinta hover:bg-plan-tinta/10"
            data-ver-todas-las-funciones
          >
            {todas ? "Ver menos funciones" : "Ver todas las funciones"}
            <FlechaDelDesplegable abierto={todas} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Cuántas columnas lleva el resumen según cuántos recuadros haya (de uno a
 * `TOPE_DE_RECUADROS`): filas llenas, nunca una última fila con uno suelto.
 * Uno solo ocupa el ancho del bloque, como todos: nada más angosto.
 * Clases literales: Tailwind no ve las compuestas.
 */
/**
 * Los recuadros de capacidad (créditos, catálogo, asistencia…). Los pinta la
 * página del plan y, tal cual, la propuesta que lleva ese plan dentro.
 */
export function RecuadrosDeCapacidad({ capacidad }: { capacidad: PaginaDelPlan["capacidad"] }) {
  return (
    <>
    {capacidad.map((t) => {
      const Icono = elDibujoDelRecuadro(t.icono);
      return (
        <div
          key={t.id}
          className="rounded-xl border border-plan-tinta/10 bg-plan-tinta/[0.03] p-5"
          data-capacidad={t.id}
          data-icono={t.icono}
        >
          {t.titulo && (
            <div className="flex items-center gap-2 text-sm font-medium text-plan-suave">
              <Icono className="h-4 w-4 shrink-0" /> {t.titulo}
            </div>
          )}
          <div className={cn("text-2xl font-bold text-plan-tinta", t.titulo ? "mt-2" : "flex items-center gap-2")}>
            {!t.titulo && <Icono className="h-5 w-5 shrink-0 text-plan-suave" />}
            {t.valor}
          </div>
          {t.detalle && <p className="mt-1 text-sm text-plan-suave">{t.detalle}</p>}
        </div>
      );
    })}
    </>
  );
}

export const COLUMNAS_DE_CAPACIDAD: Record<number, string> = {
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
              <RecuadrosDeCapacidad capacidad={pagina.capacidad} />
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
          <Link href="/inicio#pricing" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white" data-volver-a-planes>
            <ArrowLeft className="h-4 w-4" /> Volver a planes
          </Link>
          {/* A la landing principal, arriba del todo: «Volver a planes» baja a los precios. */}
          <Link href="/inicio" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white" data-ir-al-inicio>
            <Home className="h-4 w-4" /> Inicio
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

      {/* El pie de las tres públicas: la raya al ancho del contenido, con el
          mismo aire encima que entre dos bloques (`ESPACIO_DEL_BLOQUE`). */}
      <PieDeLasPublicas tema="oscuro" aire={AIRE_ENCIMA_DEL_PIE.plan} ancho={ANCHO_DE_LA_LANDING} />
    </div>
  );
}
