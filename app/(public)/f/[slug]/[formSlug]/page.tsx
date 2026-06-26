import type { Metadata } from 'next';
import { getPublicFormBySlug } from '@/actions/forms-actions';
import { PublicFormClient } from './_components/PublicFormClient';
import { notFound } from 'next/navigation';
import { Bot } from 'lucide-react';
import { getPublicBrandingByUserId } from '@/actions/public-branding-actions';

// En /f/[slug]/[formSlug] el segmento [slug] es el userId (lo resuelve el redirect).
export async function generateMetadata({
  params,
}: {
  params: { slug: string; formSlug: string };
}): Promise<Metadata> {
  const branding = await getPublicBrandingByUserId(params.slug);
  return {
    title: branding.brandName,
    icons: { icon: branding.faviconUrl },
  };
}

export default async function PublicFormPage({
  params,
}: {
  params: { slug: string; formSlug: string };
}) {
  const [result, branding] = await Promise.all([
    getPublicFormBySlug(params.slug, params.formSlug),
    getPublicBrandingByUserId(params.slug),
  ]);
  if (!result.success || !result.form) return notFound();

  const accent = branding.primaryColor?.trim() || null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center px-4 py-12">
      {/* Logo / marca del reseller (o plataforma) */}
      <div className="flex items-center gap-2 mb-8">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.brandName} className="h-10 w-10 rounded-xl object-cover" />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600"
            style={accent ? { backgroundColor: accent } : undefined}
          >
            <Bot className="h-5 w-5 text-white" />
          </div>
        )}
        <span className="text-lg font-semibold text-white">{branding.brandName}</span>
      </div>

      <div className="w-full max-w-lg">
        {/* Título */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">{result.form.title}</h1>
          {result.form.description && (
            <p className="mt-2 text-slate-400 text-sm">{result.form.description}</p>
          )}
        </div>

        {/* Formulario dinámico */}
        <PublicFormClient form={result.form} accentColor={accent} />
      </div>
    </main>
  );
}
