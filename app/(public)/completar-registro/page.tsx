import type { Metadata } from 'next';
import { Bot } from 'lucide-react';
import Link from 'next/link';
import { RegistroReunionForm } from './_components/RegistroReunionForm';
import { getResellerPublicConfig } from '@/actions/reseller-plan-actions';
import { getSiteConfig } from '@/actions/admin/site-config-actions';
import { getPublicBrandingBySlug } from '@/actions/public-branding-actions';
import { getCountryCodes } from '@/actions/get-country-action';
import { db } from '@/lib/db';
import { etiquetaDePlanParaCuenta, normalizarPlan, precioDePlanParaCuenta } from '@/lib/plan-pricing';
import { PLAN_LABELS, PLANS } from '@/types/plans';

/**
 * Qué plan se está comprando, para enseñarlo antes de que el cliente teclee
 * nada.
 *
 * La página decía solo "Activa tu cuenta": ni el plan ni el precio. En una
 * reunión eso es un problema para los dos lados —el cliente no ve qué compra y
 * quien vende no puede confirmar que el enlace es el correcto— y un enlace
 * equivocado no se notaba hasta después de cobrar.
 */
async function planDelEnlace(planSlug: string | undefined, asistencia: string | undefined, resellerSlug: string | undefined) {
  const plan = normalizarPlan(planSlug);
  if (!plan) return null;

  const resellerUserId = resellerSlug
    ? await db.reseller
        .findFirst({ where: { slug: resellerSlug }, select: { resellerid: true } })
        .then((fila) => fila?.resellerid ?? null)
        .catch(() => null)
    : null;

  const [precio, etiqueta] = await Promise.all([
    precioDePlanParaCuenta(plan, asistencia, resellerUserId).catch(() => null),
    etiquetaDePlanParaCuenta(plan, resellerUserId).catch(() => null),
  ]);

  return {
    nombre: etiqueta?.trim() || PLAN_LABELS[plan],
    nivel: PLANS.indexOf(plan) + 1,
    precio: precio?.price ?? null,
    moneda: precio?.currency ?? null,
  };
}

interface Props {
  searchParams: { r?: string; tipo?: string; plan?: string; a?: string; ref?: string; aff?: string; obj?: string };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  // Si viene de un reseller (?r=slug) usa su marca; si no, la de la plataforma.
  const branding = await getPublicBrandingBySlug(searchParams.r ?? '');
  return {
    title: `Activa tu cuenta | ${branding.brandName}`,
    icons: { icon: branding.faviconUrl },
  };
}

export default async function CompletarRegistroPage({ searchParams }: Props) {
  const resellerSlug = searchParams.r;
  const isReseller = searchParams.tipo === 'reseller';
  // Plan elegido en la landing. Con él, la cuenta nace pendiente de pago en vez
  // de con prueba, así que el encabezado tampoco puede prometer días gratis.
  const planSlug = searchParams.plan?.trim() || undefined;
  const [resellerConfig, countries, branding] = await Promise.all([
    resellerSlug
      ? getResellerPublicConfig(resellerSlug)
      : getSiteConfig().then(c => ({ sheetsUrl: c.sheetsUrl, sheetsRegistroName: null })),
    getCountryCodes(),
    getPublicBrandingBySlug(resellerSlug ?? ''),
  ]);
  const planDeVenta = await planDelEnlace(planSlug, searchParams.a, resellerSlug);
  const resellerSheetsUrl = resellerConfig.sheetsUrl;
  const resellerFormName = resellerConfig.sheetsRegistroName;
  const accent = branding.primaryColor?.trim() || null;

  return (
    <div className="flex min-h-full flex-col items-center px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Link href="/inicio" className="flex items-center gap-2">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.brandName} className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600"
              style={accent ? { backgroundColor: accent } : undefined}
            >
              <Bot className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="text-lg font-bold text-white">{branding.brandName}</span>
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {isReseller ? '🤝 Únete al programa de resellers' : '🚀 Activa tu cuenta'}
          </h1>
          {planSlug && !isReseller && (
            <p className="mt-2 text-sm text-slate-400">
              Creas tu cuenta y activas el plan con el pago.
            </p>
          )}
          {planDeVenta && !isReseller && (
            <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5">
              <span className="text-sm font-semibold text-white">Plan {planDeVenta.nombre}</span>
              <span className="text-xs text-slate-400">Nivel {planDeVenta.nivel}</span>
              {planDeVenta.precio !== null && (
                <span
                  className="text-sm font-semibold tabular-nums text-white"
                  style={accent ? { color: accent } : undefined}
                >
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: planDeVenta.moneda ?? 'USD',
                    maximumFractionDigits: 0,
                  }).format(Number(planDeVenta.precio))}
                  <span className="text-xs font-normal text-slate-400"> /mes</span>
                </span>
              )}
            </div>
          )}
          {isReseller && (
            <p className="mt-2 max-w-md text-sm text-slate-400">
              Cuéntanos sobre tu agencia o negocio para configurar tu cuenta de reseller.
            </p>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <RegistroReunionForm
          resellerSlug={resellerSlug}
          resellerSheetsUrl={resellerSheetsUrl}
          resellerFormName={resellerFormName}
          countries={countries}
          isReseller={isReseller}
          planSlug={planSlug}
          assistanceType={searchParams.a}
          apiKeyRef={searchParams.ref}
          affiliateCode={searchParams.aff}
        />
      </div>

    </div>
  );
}
