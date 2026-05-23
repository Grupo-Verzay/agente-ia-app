import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listCotizaciones } from '@/actions/cotizaciones-actions';
import { listProducts } from '@/actions/products-actions';
import { MainCotizaciones } from './_components/MainCotizaciones';

export default async function CotizacionesPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const userId = user.effectiveId;
  const [cotizaciones, productsData] = await Promise.all([
    listCotizaciones(userId),
    listProducts({ userId, page: 1, perPage: 100, onlyActive: true }),
  ]);

  return (
    <MainCotizaciones
      userId={userId}
      cotizaciones={cotizaciones}
      products={productsData.items}
    />
  );
}
