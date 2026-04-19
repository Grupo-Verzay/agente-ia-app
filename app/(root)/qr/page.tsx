import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

const pageQr = async () => {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  };

  return (
    <>

    </>
  )
}

export default pageQr
