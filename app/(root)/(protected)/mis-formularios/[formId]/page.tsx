import { currentUser } from '@/lib/auth';
import AccessDenied from '@/app/AccessDenied';
import { correoParaCompartirLaHoja, getFormById } from '@/actions/forms-actions';
import { notFound } from 'next/navigation';
import { FormEditorClient } from './_components/FormEditorClient';

// Sin la condición de rol de la persona: ver la página de la lista.
export default async function FormEditorPage({ params }: { params: { formId: string } }) {
  const user = await currentUser();
  if (!user) return <AccessDenied />;

  const [result, correoDeLaHoja] = await Promise.all([getFormById(params.formId), correoParaCompartirLaHoja()]);
  if (!result.success || !result.form) return notFound();

  return <FormEditorClient form={result.form} correoDeLaHoja={correoDeLaHoja} />;
}
