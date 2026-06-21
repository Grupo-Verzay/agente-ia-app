import { Bot } from 'lucide-react';
import Link from 'next/link';
import { RegistroReunionForm } from './_components/RegistroReunionForm';
import { getResellerPublicConfig } from '@/actions/reseller-plan-actions';
import { getSiteConfig } from '@/actions/admin/site-config-actions';
import { getCountryCodes } from '@/actions/get-country-action';

export const metadata = { title: 'Activa tu cuenta gratis | Agente IA' };

interface Props {
  searchParams: { r?: string; tipo?: string };
}

export default async function CompletarRegistroPage({ searchParams }: Props) {
  const resellerSlug = searchParams.r;
  const isReseller = searchParams.tipo === 'reseller';
  const [resellerConfig, countries] = await Promise.all([
    resellerSlug
      ? getResellerPublicConfig(resellerSlug)
      : getSiteConfig().then(c => ({ sheetsUrl: c.sheetsUrl, sheetsRegistroName: null })),
    getCountryCodes(),
  ]);
  const resellerSheetsUrl = resellerConfig.sheetsUrl;
  const resellerFormName = resellerConfig.sheetsRegistroName;

  return (
    <div className="flex min-h-full flex-col items-center px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Link href="/inicio" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">Agente IA</span>
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {isReseller ? '🤝 Únete al programa de resellers' : '🚀 Activa tu cuenta gratis'}
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
