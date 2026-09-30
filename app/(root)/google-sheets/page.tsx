import { currentUser } from '@/lib/auth';
import { GoogleSheetsClient } from './_components/GoogleSheetsClient';
import { db } from '@/lib/db';
import { getServiceAccountEmail } from '@/actions/google-calendar-actions';

export default async function GoogleSheetsPage() {
  const user = await currentUser();
  if (!user) return null;

  const userId: string = (user as any).effectiveId ?? user.id;

  // `sheetsFormName` y `sheetsRegistroName` se pedían y la pantalla no los
  // usaba: viajaban a un componente que no los leía.
  const [dbUser, serviceAccountEmail] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { sheetsUrl: true } as any }),
    getServiceAccountEmail(),
  ]);

  return (
    <GoogleSheetsClient
      userId={userId}
      initialSheetsUrl={(dbUser as any)?.sheetsUrl ?? null}
      serviceAccountEmail={serviceAccountEmail}
    />
  );
}
