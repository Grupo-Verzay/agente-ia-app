import { currentUser } from '@/lib/auth';
import { ResellerCreditPage } from './_components';

const MainCredits = async () => {
  const user = await currentUser();

  if (!user) {
    return <h1 className="text-center text-2xl font-bold mt-10">404 - Usuario no autenticado</h1>;
  }


  return (
    <ResellerCreditPage />
  )
}

export default MainCredits
