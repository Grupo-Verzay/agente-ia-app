import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bot } from 'lucide-react';
import Link from 'next/link';
import { RegistroReunionForm } from './_components/RegistroReunionForm';
import { getResellerPublicConfig } from '@/actions/reseller-plan-actions';
import { getSiteConfig } from '@/actions/admin/site-config-actions';
import { getPublicBrandingBySlug } from '@/actions/public-branding-actions';
import { getCountryCodes } from '@/actions/get-country-action';
import { normalizarPlan } from '@/lib/plan-pricing';
import { PLANS } from '@/types/plans';

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
  // La dirección se deja siempre en su forma por nivel. Un enlace viejo
  // (?plan=avanzado) sigue funcionando, pero se corrige solo a ?plan=nivel-4:
  // así lo que se lee en la barra es siempre el nivel y nadie tiene que
  // acordarse de qué nombre interno le tocaba a cada plan.
  const planDelSlug = normalizarPlan(planSlug);
  if (planDelSlug) {
    const porNivel = `nivel-${PLANS.indexOf(planDelSlug) + 1}`;
    if (planSlug !== porNivel) {
      const destino = new URLSearchParams();
      for (const [clave, valor] of Object.entries(searchParams)) {
        if (clave === 'plan' || !valor) continue;
        destino.set(clave, Array.isArray(valor) ? valor[0] : valor);
      }
      destino.set('plan', porNivel);
      redirect(`/completar-registro?${destino.toString()}`);
    }
  }

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
