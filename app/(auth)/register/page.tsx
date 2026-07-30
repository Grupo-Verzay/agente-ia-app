import type { Metadata } from "next";
import FormRegister from "@/components/form-register";
import { getCountryCodes } from "@/actions/get-country-action";
import { getPublicBrandingBySlug } from "@/actions/public-branding-actions";
import { db } from "@/lib/db";
import { diasDePruebaDeMarca } from "@/lib/trial-days.server";

interface Props {
  searchParams: { ref?: string; aff?: string; plan?: string; a?: string; r?: string; obj?: string };
}

// Marca del reseller en la pestaña del registro (cuando el cliente entra por
// ?r=slug). Sin esto, el registro salía con favicon/título de Verzay.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const slug = searchParams.r?.trim();
  if (!slug) return {};
  const b = await getPublicBrandingBySlug(slug);
  return {
    title: `Crea tu cuenta | ${b.brandName}`,
    icons: { icon: b.faviconUrl },
  };
}

const RegisterPage = async ({ searchParams }: Props) => {
  const countries = await getCountryCodes();

  // Los días de prueba los pone cada marca, así que el encabezado no puede
  // anunciar un número fijo: se resuelve aquí, donde ya se sabe por qué landing
  // entró el cliente.
  const slug = searchParams.r?.trim();
  const reseller = slug
    ? await db.reseller
      .findFirst({ where: { slug }, select: { resellerid: true } })
      .catch(() => null)
    : null;
  const trialDays = await diasDePruebaDeMarca(reseller?.resellerid ?? null);

  return (
    <FormRegister
      countries={countries}
      apiKeyRef={searchParams.ref}
      affiliateCode={searchParams.aff}
      defaultPlan={searchParams.plan}
      defaultAssistanceType={searchParams.a}
      resellerSlug={searchParams.r}
      defaultSalesObjective={searchParams.obj}
      trialDays={trialDays}
    />
  );
};

export default RegisterPage;
