import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { isAdminLike } from '@/lib/rbac';
import { db } from '@/lib/db';

export async function GET() {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  await db.$executeRawUnsafe(
    `DELETE FROM "_prisma_migrations" WHERE migration_name = '20260611000000_add_plan_config'`,
  );

  return NextResponse.json({ ok: true, message: 'Registro eliminado. Ya puedes reiniciar el backend.' });
}
