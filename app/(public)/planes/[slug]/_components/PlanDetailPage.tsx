"use client";

import Link from "next/link";
import { useState } from "react";
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
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { elDibujoDelRecuadro } from "@/components/shared/DibujoDelRecuadro";
import { cn } from "@/lib/utils";
import {
  conReproduccionAutomatica,
  type BloqueDeLaPagina,
  type BotonDelPlan,
  type PreguntaDelPlan,
} from "@/lib/pagina-de-plan";
import type { PaginaDelPlan } from "@/lib/pagina-de-plan.server";

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
 *   4. qué incluye: UNA tarjeta por función encendida, en una sola columna y
 *      en el orden del editor de funciones;
 *   5. las preguntas frecuentes de ese plan, si tiene;
 *   6. el botón de comenzar, UNA sola vez, con el precio y la línea discreta
 *      al plan inmediato superior.
 *
 * En la barra fija no hay botón: se decide después de leer lo que trae el plan.
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
  return (
    <Link href={url} className={className} {...resto}>
      {children}
    </Link>
  );
}

function BotonPrincipal({ boton, gradiente }: { boton: BotonDelPlan; gradiente: string }) {
  return (
    <Enlace url={boton.url} externo={boton.externo} data-boton="principal">
      <Button size="lg" className={cn("w-full border-0 bg-gradient-to-r px-8 text-white hover:opacity-90 sm:w-auto", gradiente)}>
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
 * Cuántas columnas lleva el resumen según cuántos recuadros haya (de uno a
 * `TOPE_DE_RECUADROS`): filas llenas, nunca una última fila con uno suelto.
 * Clases literales: Tailwind no ve las compuestas.
 */
const COLUMNAS_DE_CAPACIDAD: Record<number, string> = {
  1: "mx-auto max-w-sm",
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

  /** Cada bloque, o `null` si ese plan no tiene qué enseñar en él. */
  const bloque = (clave: BloqueDeLaPagina): React.ReactNode => {
    switch (clave) {
      case "video":
        return pagina.video ? (
          <section key={clave} className="px-4 py-10" data-seccion="video">
            <div className="mx-auto max-w-4xl">
              <MarcoDelVideo titulo={pagina.video.titulo} gradiente={gradiente}>
                <VideoDelPlan video={pagina.video} />
              </MarcoDelVideo>
            </div>
          </section>
        ) : null;

      case "paraquien":
        return (
          <section key={clave} className="px-4 py-10" data-seccion="paraquien">
            <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
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
          <section key={clave} className="bg-white/[0.02] px-4 py-10" data-seccion="capacidad">
            <div className={cn("mx-auto grid max-w-5xl gap-4", COLUMNAS_DE_CAPACIDAD[pagina.capacidad.length] ?? "sm:grid-cols-3")}>
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
          <section key={clave} className="px-4 py-12" data-seccion="funciones">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">Qué incluye este plan</h2>
              <ul className="space-y-3" data-lista-de-funciones>
                {pagina.funciones.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5"
                    data-funcion={f.id}
                  >
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      {/* El nombre y su guía en la MISMA fila: la guía pegada a la derecha. */}
                      <div className="flex items-start justify-between gap-3" data-fila-de-la-funcion>
                        <p className="min-w-0 flex-1 text-base font-medium text-white" data-nombre-de-la-funcion>
                          {f.nombre}
                        </p>
                        {f.tutorial && (
                          <Enlace
                            url={f.tutorial.url}
                            externo={f.tutorial.externo}
                            className="mt-0.5 inline-flex max-w-[45%] shrink-0 items-center gap-1 text-right text-xs font-medium text-blue-400 hover:text-blue-300"
                            data-tutorial={f.tutorial.url}
                          >
                            <BookOpen className="h-3.5 w-3.5 shrink-0" />
                            <span>{f.tutorial.externo ? "Ver tutorial" : f.tutorial.titulo}</span>
                            {f.tutorial.externo && <ExternalLink className="h-3 w-3 shrink-0" />}
                          </Enlace>
                        )}
                      </div>
                      {f.descripcion && <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.descripcion}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null;

      case "preguntas":
        return pagina.preguntas.length > 0 ? (
          <section key={clave} className="px-4 py-12" data-seccion="preguntas">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">Preguntas frecuentes</h2>
              <Preguntas preguntas={pagina.preguntas} />
            </div>
          </section>
        ) : null;

      case "comenzar":
        return (
          <section key={clave} className="px-4 py-14" data-seccion="comenzar">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-2xl font-bold sm:text-3xl">Empieza con el plan {pagina.nombre}</h2>
              <p className="mt-3 text-slate-400" data-precio-final>
                {pagina.precio.aConsultar ? "Precio a consultar según tu operación." : `${pagina.precio.texto} USD al mes.`}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <BotonPrincipal boton={principal} gradiente={gradiente} />
                {secundario && <BotonSecundario boton={secundario} />}
              </div>
              {pagina.planSuperior && (
                <p className="mt-8 text-sm text-slate-500" data-plan-superior={pagina.planSuperior.plan}>
                  ¿Necesitas más capacidad?{" "}
                  <Link
                    href={pagina.planSuperior.url}
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/inicio#pricing" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver a planes
          </Link>
        </div>
      </div>

      {/* El nombre lo leen los lectores de pantalla y los buscadores; a la vista ya lo dijo la tarjeta. */}
      <h1 className="sr-only" data-nombre-del-plan>
        Plan {pagina.nombre}
      </h1>

      {/* Los bloques, en el orden del panel, separados por una raya igual sea cual sea el orden. */}
      <main className="divide-y divide-white/10" data-bloques>
        {pagina.orden.map(bloque)}
      </main>

      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-slate-500">
        © {anio} {pagina.marca}
      </footer>
    </div>
  );
}
