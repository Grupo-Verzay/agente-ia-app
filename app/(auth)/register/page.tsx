import FormRegister from "@/components/form-register";
import { getCountryCodes } from "@/actions/get-country-action";

interface Props {
  searchParams: { ref?: string; aff?: string; plan?: string; r?: string; obj?: string };
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
