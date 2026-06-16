import { currentUser } from '@/lib/auth';
import { isAdminOrReseller } from '@/lib/rbac';
import AccessDenied from '@/app/AccessDenied';
import { getFormById } from '@/actions/forms-actions';
import { notFound } from 'next/navigation';
import { FormEditorClient } from './_components/FormEditorClient';

export default async function FormEditorPage({ params }: { params: { formId: string } }) {
  const user = await currentUser();
  if (!user || !isAdminOrReseller(user.role)) return <AccessDenied />;

  const result = await getFormById(params.formId);
  if (!result.success || !result.form) return notFound();

  return <FormEditorClient form={result.form} userId={user.id} />;
}
