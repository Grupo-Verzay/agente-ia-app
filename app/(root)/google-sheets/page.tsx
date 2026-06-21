import { currentUser } from '@/lib/auth';
import { GoogleSheetsClient } from './_components/GoogleSheetsClient';
import { db } from '@/lib/db';

export default async function GoogleSheetsPage() {
  const user = await currentUser();
  if (!user) return null;

  const userId: string = (user as any).effectiveId ?? user.id;

  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { sheetsUrl: true },
  });

  return <GoogleSheetsClient userId={userId} initialSheetsUrl={dbUser?.sheetsUrl ?? null} />;
}
