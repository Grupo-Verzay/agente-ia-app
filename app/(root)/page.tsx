import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getAllModules } from '@/actions/module-actions';
import { MainHome } from './_components/MainHome';

// El home web SIEMPRE muestra el Workspace Home (no redirige), para no arriesgar
// bucles de redirección con guards de otras secciones. El aterrizaje directo en la
// pantalla operativa (crm/dashboard → chats) se hace SOLO en el arranque de la PWA
// (/abrir), que no es una ruta de navegación normal.
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

