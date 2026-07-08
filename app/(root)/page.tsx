import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getAllModules } from '@/actions/module-actions';
import { resolveLandingRoute } from '@/lib/pwa-landing';
import { MainHome } from './_components/MainHome';

const HomePage = async () => {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }

  // Aterrizaje directo en la pantalla operativa (CRM dashboard → Chats). Si el
  // usuario no tiene acceso a ninguna, se queda en el Workspace Home (launcher).
  const landing = await resolveLandingRoute(user);
  if (landing !== '/') redirect(landing);

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

