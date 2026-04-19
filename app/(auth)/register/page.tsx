import FormRegister from "@/components/form-register";
import { getCountryCodes } from "@/actions/get-country-action";

interface Props {
  searchParams: { ref?: string };
}

const RegisterPage = async ({ searchParams }: Props) => {
  const countries = await getCountryCodes();
  return <FormRegister countries={countries} apiKeyRef={searchParams.ref} />;
};
export default RegisterPage;
