import type { Metadata } from 'next';
import { Bot } from 'lucide-react';
import Link from 'next/link';
import { RegistroReunionForm } from './_components/RegistroReunionForm';
import { getResellerPublicConfig } from '@/actions/reseller-plan-actions';
import { getSiteConfig } from '@/actions/admin/site-config-actions';
import { getPublicBrandingBySlug } from '@/actions/public-branding-actions';
import { getCountryCodes } from '@/actions/get-country-action';

interface Props {
  searchParams: { r?: string; tipo?: string };
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
  const [resellerConfig, countries, branding] = await Promise.all([
    resellerSlug
      ? getResellerPublicConfig(resellerSlug)
      : getSiteConfig().then(c => ({ sheetsUrl: c.sheetsUrl, sheetsRegistroName: null })),
    getCountryCodes(),
    getPublicBrandingBySlug(resellerSlug ?? ''),
  ]);
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
          <p className="mt-2 max-w-md text-sm text-slate-400">
            {isReseller
              ? 'Cuéntanos sobre tu agencia o negocio para configurar tu cuenta de reseller.'
              : 'Cuéntanos sobre tu negocio para que tu agente esté listo desde el primer día.'}
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <RegistroReunionForm resellerSlug={resellerSlug} resellerSheetsUrl={resellerSheetsUrl} resellerFormName={resellerFormName} countries={countries} isReseller={isReseller} />
      </div>

      <p className="mt-6 text-xs text-slate-600">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-slate-400 underline underline-offset-2 hover:text-white">
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}
