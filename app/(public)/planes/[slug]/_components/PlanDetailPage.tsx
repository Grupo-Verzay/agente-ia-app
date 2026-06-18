"use client";

import Link from "next/link";
import { Check, Star, MessageCircle, Calendar, Play, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { PlanDetailData, FeatureSection, GalleryImage, FaqItem, StatItem, TestimonialItem } from "@/actions/plan-detail-actions";

const PLAN_COLORS: Record<string, string> = {
  lite: "from-slate-500 to-slate-600",
  basico: "from-emerald-500 to-emerald-600",
  intermedio: "from-blue-500 to-blue-600",
  avanzado: "from-violet-500 to-violet-600",
  enterprise: "from-amber-500 to-amber-600",
  personalizado: "from-rose-500 to-rose-600",
};

type PlanInfo = {
  id: string; plan: string; assistanceType: string;
  priceUSD: number; priceQuarterly: number | null; priceYearly: number | null;
  credits: number; features: string[]; description: string | null;
  isPopular: boolean;
  checkoutUrlMonthly: string | null; checkoutUrlQuarterly: string | null; checkoutUrlYearly: string | null;
};

function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {faqs.map((faq, i) => (
        <div key={i} className="rounded-lg border border-white/10 overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-white hover:bg-white/5"
          >
            {faq.question}
            {open === i ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>
          {open === i && (
            <div className="border-t border-white/10 px-5 pb-4 pt-3 text-sm text-slate-400 leading-relaxed">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function VideoEmbed({ url, title, thumbnailUrl }: { url: string; title?: string | null; thumbnailUrl?: string | null }) {
  const [playing, setPlaying] = useState(false);
  const isYoutube = url.includes("youtube") || url.includes("youtu.be");
  const isVimeo = url.includes("vimeo");
  const embedUrl = isYoutube ? url.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")
    : isVimeo ? url.replace("vimeo.com/", "player.vimeo.com/video/")
    : url;

  if (playing || !thumbnailUrl) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10">
        <iframe src={`${embedUrl}${playing ? "?autoplay=1" : ""}`} title={title ?? "Video"} allow="autoplay; encrypted-media" allowFullScreen className="h-full w-full" />
      </div>
    );
  }

  return (
    <div
      className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl border border-white/10 group"
      onClick={() => setPlaying(true)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbnailUrl} alt={title ?? "Video"} className="h-full w-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition-colors">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl">
          <Play className="h-6 w-6 fill-slate-900 text-slate-900" />
        </div>
      </div>
      {title && (
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-sm font-medium text-white drop-shadow">{title}</p>
        </div>
      )}
    </div>
  );
}

export function PlanDetailPage({ plan, detail, planLabel }: {
  plan: PlanInfo;
  detail: PlanDetailData | null;
  planLabel: string;
}) {
  const gradient = PLAN_COLORS[plan.plan] ?? "from-blue-500 to-blue-600";
  const checkoutUrl = plan.checkoutUrlMonthly;
  const meetingUrl = detail?.meetingUrl;
  const ctaUrl = detail?.ctaButtonUrl ?? checkoutUrl ?? "/registro";
  const ctaText = detail?.ctaButtonText ?? "Comenzar ahora";
  const secondaryUrl = detail?.ctaSecondaryUrl ?? meetingUrl;
  const secondaryText = detail?.ctaSecondaryText ?? (meetingUrl ? "Agendar una demo" : null);

  const featureSections = (detail?.featureSections ?? []) as FeatureSection[];
  const galleryImages = (detail?.galleryImages ?? []) as GalleryImage[];
  const faqs = (detail?.faqs ?? []) as FaqItem[];
  const stats = (detail?.stats ?? []) as StatItem[];
  const testimonials = (detail?.testimonials ?? []) as TestimonialItem[];

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">

      {/* ── NAVBAR MINI ── */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0f1a]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/inicio" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver a planes
          </Link>
          <div className="flex items-center gap-2">
            {secondaryUrl && secondaryText && (
              <a href={secondaryUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> {secondaryText}
                </Button>
              </a>
            )}
            <a href={ctaUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className={cn("bg-gradient-to-r", gradient, "text-white border-0 hover:opacity-90")}>
                {ctaText}
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden py-16 md:py-24">
        <div className={cn("absolute inset-0 opacity-10 bg-gradient-to-br", gradient)} />
        <div className="relative mx-auto max-w-5xl px-4 text-center">
          {(detail?.heroBadge ?? plan.isPopular) && (
            <Badge className={cn("mb-4 bg-gradient-to-r text-white border-0", gradient)}>
              {detail?.heroBadge ?? "Más popular"}
            </Badge>
          )}
          <h1 className="text-4xl font-bold md:text-5xl">
            {detail?.heroTitle ?? `Todo lo que incluye el plan ${planLabel}`}
          </h1>
          {(detail?.heroSubtitle ?? plan.description) && (
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
              {detail?.heroSubtitle ?? plan.description}
            </p>
          )}

          {/* Precio */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="text-5xl font-bold">${plan.priceUSD}</span>
            <div className="text-left">
              <div className="text-sm text-slate-400">USD / mes</div>
              <div className="text-xs text-slate-500">{plan.credits.toLocaleString()} créditos</div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={ctaUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className={cn("bg-gradient-to-r border-0 text-white hover:opacity-90 px-8", gradient)}>
                {ctaText}
              </Button>
            </a>
            {secondaryUrl && secondaryText && (
              <a href={secondaryUrl} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 gap-2">
                  <Calendar className="h-4 w-4" /> {secondaryText}
                </Button>
              </a>
            )}
          </div>

          {detail?.heroImageUrl && (
            <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.heroImageUrl} alt={`Plan ${planLabel}`} className="w-full object-cover" />
            </div>
          )}
        </div>
      </section>

      {/* ── STATS ── */}
      {stats.length > 0 && (
        <section className="border-y border-white/10 bg-white/[0.02] py-10">
          <div className="mx-auto max-w-5xl px-4">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {stats.map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-3xl font-bold text-white">{stat.value}</div>
                  <div className="mt-1 text-sm text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURES INCLUIDAS (del plan base) ── */}
      {plan.features.length > 0 && (
        <section className="py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="mb-8 text-center text-2xl font-bold">Qué incluye este plan</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plan.features.map((f, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-sm text-slate-300">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── SECCIONES DE FUNCIONES ── */}
      {featureSections.map((sec, i) => (
        <section key={i} className={cn("py-14", i % 2 === 0 ? "bg-white/[0.02]" : "")}>
          <div className="mx-auto max-w-5xl px-4">
            <div className={cn("flex flex-col items-center gap-10 md:flex-row", sec.layout === "left" && "md:flex-row-reverse")}>
              <div className="flex-1 space-y-4">
                {sec.badge && (
                  <Badge variant="outline" className="border-white/20 text-slate-300">{sec.badge}</Badge>
                )}
                <h3 className="text-2xl font-bold md:text-3xl">{sec.title}</h3>
                <p className="text-slate-400 leading-relaxed">{sec.description}</p>
              </div>
              {sec.imageUrl && (
                <div className="w-full flex-1 overflow-hidden rounded-xl border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sec.imageUrl} alt={sec.imageAlt || sec.title} className="w-full object-cover" />
                </div>
              )}
            </div>
          </div>
        </section>
      ))}

      {/* ── VIDEO ── */}
      {detail?.videoUrl && (
        <section className="py-14">
          <div className="mx-auto max-w-3xl px-4">
            {detail.videoTitle && (
              <h2 className="mb-6 text-center text-2xl font-bold">{detail.videoTitle}</h2>
            )}
            <VideoEmbed url={detail.videoUrl} title={detail.videoTitle} thumbnailUrl={detail.videoThumbnailUrl} />
          </div>
        </section>
      )}

      {/* ── GALERÍA ── */}
      {galleryImages.length > 0 && (
        <section className="bg-white/[0.02] py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="mb-8 text-center text-2xl font-bold">Capturas del panel</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {galleryImages.map((img, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt || img.caption} className="w-full object-cover" />
                  {img.caption && (
                    <p className="px-3 py-2 text-xs text-slate-400">{img.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── TESTIMONIOS ── */}
      {testimonials.length > 0 && (
        <section className="py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="mb-8 text-center text-2xl font-bold">Lo que dicen nuestros clientes</h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t, i) => (
                <div key={i} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className={cn("h-4 w-4", s < t.rating ? "fill-amber-400 text-amber-400" : "text-slate-600")} />
                    ))}
                  </div>
                  <p className="flex-1 text-sm text-slate-300 leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    {t.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.avatarUrl} alt={t.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-sm font-bold">
                        {t.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role} · {t.company}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQs ── */}
      {faqs.length > 0 && (
        <section className="bg-white/[0.02] py-14">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="mb-8 text-center text-2xl font-bold">Preguntas frecuentes</h2>
            <FaqAccordion faqs={faqs} />
          </div>
        </section>
      )}

      {/* ── CTA FINAL ── */}
      <section className="py-16">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <div className={cn("inline-block rounded-full px-4 py-1.5 text-xs font-semibold mb-4 bg-gradient-to-r text-white", gradient)}>
            {planLabel}
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">
            {detail?.ctaTitle ?? "¿Listo para empezar?"}
          </h2>
          <p className="mt-3 text-slate-400">
            {detail?.ctaSubtitle ?? "Sin contratos. Cancela cuando quieras."}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a href={ctaUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className={cn("bg-gradient-to-r border-0 text-white hover:opacity-90 px-10 text-base", gradient)}>
                {ctaText}
              </Button>
            </a>
            {secondaryUrl && secondaryText && (
              <a href={secondaryUrl} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 gap-2">
                  {meetingUrl === secondaryUrl
                    ? <Calendar className="h-4 w-4" />
                    : <MessageCircle className="h-4 w-4" />}
                  {secondaryText}
                </Button>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Footer mini */}
      <div className="border-t border-white/10 py-6 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Agente IA. Todos los derechos reservados.
      </div>
    </div>
  );
}
