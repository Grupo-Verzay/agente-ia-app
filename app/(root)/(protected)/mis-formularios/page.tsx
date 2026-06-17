import { currentUser } from '@/lib/auth';
import { isAdminOrReseller } from '@/lib/rbac';
import AccessDenied from '@/app/AccessDenied';
import { getMyForms } from '@/actions/forms-actions';
import { MisFormulariosClient } from './_components/MisFormulariosClient';

export default async function MisFormulariosPage() {
  const user = await currentUser();
  if (!user || !isAdminOrReseller(user.role)) return <AccessDenied />;

  const result = await getMyForms();

  return (
    <MisFormulariosClient
      initialForms={result.success ? (result.forms ?? []) : []}
      userId={user.id}
    />
  );
}
