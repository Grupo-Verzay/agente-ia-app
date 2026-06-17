import { getPublicFormBySlug } from '@/actions/forms-actions';
import { PublicFormClient } from './_components/PublicFormClient';
import { notFound } from 'next/navigation';
import { Bot } from 'lucide-react';

export default async function PublicFormPage({
  params,
}: {
  params: { slug: string; formSlug: string };
}) {
  const result = await getPublicFormBySlug(params.slug, params.formSlug);
  if (!result.success || !result.form) return notFound();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-semibold text-white">Agente IA</span>
      </div>

      <div className="w-full max-w-xl">
        {/* Título */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">{result.form.title}</h1>
          {result.form.description && (
            <p className="mt-2 text-slate-400 text-sm">{result.form.description}</p>
          )}
        </div>

        {/* Formulario dinámico */}
        <PublicFormClient form={result.form} />
      </div>
    </main>
  );
}
