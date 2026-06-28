import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CallsCrmClient } from './_components/CallsCrmClient';

export default async function CallsCrmPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <CallsCrmClient />;
}
