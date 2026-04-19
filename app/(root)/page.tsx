import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getAllModules } from '@/actions/module-actions';
import { MainHome } from './_components/MainHome';

const HomePage = async () => {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }

  const modulesResponse = await getAllModules();
  const modules = modulesResponse.data ?? [];

  return (
    <MainHome
      user={{
        id: user.id,
        name: user.name ?? null,
        company: user.company ?? null,
        role: user.role,
        plan: user.plan,
      }}
      modules={modules}
    />
  );
};

export default HomePage;

