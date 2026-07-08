import type { Metadata } from "next";
import FormRegister from "@/components/form-register";
import { getCountryCodes } from "@/actions/get-country-action";
import { getPublicBrandingBySlug } from "@/actions/public-branding-actions";

interface Props {
  searchParams: { ref?: string; aff?: string; plan?: string; r?: string; obj?: string };
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

  return (
    <FormRegister
      countries={countries}
      apiKeyRef={searchParams.ref}
      affiliateCode={searchParams.aff}
      defaultPlan={searchParams.plan}
      resellerSlug={searchParams.r}
      defaultSalesObjective={searchParams.obj}
    />
  );
};

export default RegisterPage;
