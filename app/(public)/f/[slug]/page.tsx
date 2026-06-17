import { getFormByPublicSlug } from '@/actions/forms-actions';
import { notFound, redirect } from 'next/navigation';

export default async function FormSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await getFormByPublicSlug(params.slug);
  if (!result.success || !result.form || !result.userId) return notFound();

  redirect(`/f/${result.userId}/${result.form.slug}`);
}
