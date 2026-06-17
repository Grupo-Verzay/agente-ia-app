import { getUserIdBySlug } from '@/actions/catalog-config-actions';
import { getPublicCatalog } from '@/actions/products-actions';
import { notFound, redirect } from 'next/navigation';

export default async function CatalogoSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const userId = await getUserIdBySlug(params.slug);
  if (!userId) return notFound();

  // Redirigir a la página canónica del catálogo para reutilizar todo el rendering
  redirect(`/catalogo/${userId}`);
}
