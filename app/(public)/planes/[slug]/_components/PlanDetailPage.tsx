"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  ExternalLink,
  Package,
  Play,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  conReproduccionAutomatica,
  type BotonDelPlan,
  type PreguntaDelPlan,
  type TarjetaDeCapacidad,
} from "@/lib/pagina-de-plan";
import type { PaginaDelPlan } from "@/lib/pagina-de-plan.server";

/**
 * La página pública de un plan, en este orden y nada más:
 *
 *   1. el hero, con el video de ESE plan (enlace o archivo subido);
 *   2. para quién es, con un caso típico de negocio;
 *   3. el resumen de capacidad (créditos, catálogo, asistencia);
 *   4. las funciones encendidas, por categoría, con su tutorial;
 *   5. las preguntas frecuentes de ese plan;
 *   6. el botón de comenzar, UNA sola vez y aquí al final, con la línea
 *      discreta al plan inmediato superior debajo.
 *
 * Arriba —en la barra fija y junto al nombre y el precio— no hay botón: se
 * decide después de leer lo que trae el plan, no antes.
 *
 * No hay ni un texto de venta escrito aquí: todo llega armado de
 * `lib/pagina-de-plan.server.ts`, que lo lee del panel de Planes. Lo que había
 * antes —estadísticas, testimonios, galería, secciones de marketing y un bloque
 * de cierre— se fue: era lo mismo para todos los planes y se quedaba atrás.
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

const ICONO_DE_CAPACIDAD: Record<TarjetaDeCapacidad["clave"], typeof Coins> = {
  creditos: Coins,
  catalogo: Package,
  asistencia: Bot,
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
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black" data-video="archivo">
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
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black" data-video="iframe">
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
      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black text-left"
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
      <span className="absolute bottom-4 left-4 right-4 text-sm font-medium text-white drop-shadow">{video.titulo}</span>
    </button>
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

const NOMBRE_DEL_TIPO: Record<"IA" | "HUMANO", { texto: string; icono: typeof Zap }> = {
  IA: { texto: "Asistencia IA", icono: Zap },
  HUMANO: { texto: "Asistencia humana", icono: Users },
};

export function PlanDetailPage({ pagina }: { pagina: PaginaDelPlan }) {
  const gradiente = COLOR_DEL_PLAN[pagina.plan] ?? "from-blue-500 to-blue-600";
  const { principal, secundario } = pagina.botones;
  const anio = new Date().getFullYear();

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

      {/* ── 1. Hero con el video del plan ── */}
      <section className="px-4 pb-12 pt-14" data-seccion="hero">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              {pagina.esPopular && (
                <Badge className="flex items-center gap-1 bg-blue-600 px-3 text-xs text-white" data-insignia="popular">
                  <Star className="h-3 w-3" /> Más popular
                </Badge>
              )}
              {pagina.otroTipo ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1" data-tipos>
                  {(["IA", "HUMANO"] as const).map((t) => {
                    const { texto, icono: Icono } = NOMBRE_DEL_TIPO[t];
                    const activo = pagina.tipo === t;
                    return (
                      <Link
                        key={t}
                        href={`/planes/${pagina.plan}?tipo=${t}`}
                        replace
                        scroll={false}
                        aria-current={activo ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all",
                          activo ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white",
                        )}
                      >
                        <Icono className="h-3.5 w-3.5" /> {texto}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1 border-white/20 text-xs text-slate-300" data-tipo={pagina.tipo}>
                  {(() => {
                    const { texto, icono: Icono } = NOMBRE_DEL_TIPO[pagina.tipo];
                    return (
                      <>
                        <Icono className="h-3 w-3" /> {texto}
                      </>
                    );
                  })()}
                </Badge>
              )}
            </div>

            <p className="text-sm font-medium uppercase tracking-wider text-slate-400">Plan</p>
            <h1
              className={cn("mt-1 bg-gradient-to-r bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl", gradiente)}
              data-nombre-del-plan
            >
              {pagina.nombre}
            </h1>
            {pagina.descripcion && (
              <p className="mt-4 text-lg leading-relaxed text-slate-300" data-descripcion>
                {pagina.descripcion}
              </p>
            )}

            <div className="mt-6 flex items-baseline justify-center gap-2" data-precio>
              {pagina.precio.aConsultar ? (
                <span className="text-3xl font-bold text-slate-300">{pagina.precio.texto}</span>
              ) : (
                <>
                  <span className="text-4xl font-bold text-white">{pagina.precio.texto}</span>
                  <span className="text-sm text-slate-400">USD/mes</span>
                </>
              )}
            </div>
          </div>

          {pagina.video && (
            <div className="mx-auto mt-10 max-w-4xl">
              <VideoDelPlan video={pagina.video} />
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Para quién es este plan ── */}
      <section className="px-4 pb-12" data-seccion="paraquien">
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

      {/* ── 3. Resumen de capacidad ── */}
      <section className="border-y border-white/10 bg-white/[0.02] px-4 py-10" data-seccion="capacidad">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          {pagina.capacidad.map((t) => {
            const Icono = ICONO_DE_CAPACIDAD[t.clave];
            return (
              <div key={t.clave} className="rounded-xl border border-white/10 bg-white/[0.03] p-5" data-capacidad={t.clave}>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-400">
                  <Icono className="h-4 w-4" /> {t.titulo}
                </div>
                <div className="mt-2 text-2xl font-bold text-white">{t.valor}</div>
                <p className="mt-1 text-sm text-slate-400">{t.detalle}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. Funciones por categoría ── */}
      {pagina.grupos.length > 0 && (
        <section className="px-4 py-14" data-seccion="funciones">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">Qué incluye el plan {pagina.nombre}</h2>
            <div className="grid gap-5 md:grid-cols-2">
              {pagina.grupos.map((g) => (
                <div key={g.slug} className="rounded-xl border border-white/10 bg-white/[0.03] p-5" data-grupo={g.slug}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{g.nombre}</h3>
                  <ul className="space-y-3">
                    {g.funciones.map((f) => (
                      <li key={f.id} className="flex items-start gap-3" data-funcion={f.id}>
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">{f.nombre}</p>
                          {f.descripcion && <p className="mt-0.5 text-sm leading-relaxed text-slate-400">{f.descripcion}</p>}
                          {f.tutorial && (
                            <Enlace
                              url={f.tutorial.url}
                              externo={f.tutorial.externo}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
                              data-tutorial={f.tutorial.url}
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              {f.tutorial.externo ? "Ver tutorial" : f.tutorial.titulo}
                              {f.tutorial.externo && <ExternalLink className="h-3 w-3" />}
                            </Enlace>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 5. Preguntas frecuentes de este plan ── */}
      {pagina.preguntas.length > 0 && (
        <section className="border-t border-white/10 px-4 py-14" data-seccion="preguntas">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">Preguntas frecuentes sobre {pagina.nombre}</h2>
            <Preguntas preguntas={pagina.preguntas} />
          </div>
        </section>
      )}

      {/* ── 6. Comenzar: el único botón de la página, al final ── */}
      <section className="border-t border-white/10 px-4 py-14" data-seccion="comenzar">
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

      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-slate-500">
        © {anio} {pagina.marca}
      </footer>
    </div>
  );
}
