import { currentUser } from '@/lib/auth';
import { isAdminOrReseller } from '@/lib/rbac';
import AccessDenied from '@/app/AccessDenied';
import { getFormById, getFormSubmissions } from '@/actions/forms-actions';
import { notFound } from 'next/navigation';
import { FormRegistrosClient } from './_components/FormRegistrosClient';

export default async function FormRegistrosPage({ params }: { params: { formId: string } }) {
  const user = await currentUser();
  if (!user || !isAdminOrReseller(user.role)) return <AccessDenied />;

  const [formResult, subsResult] = await Promise.all([
    getFormById(params.formId),
    getFormSubmissions(params.formId),
  ]);

  if (!formResult.success || !formResult.form) return notFound();

  return (
    <FormRegistrosClient
      form={formResult.form}
      initialSubmissions={subsResult.success ? (subsResult.submissions ?? []) : []}
    />
  );
}
