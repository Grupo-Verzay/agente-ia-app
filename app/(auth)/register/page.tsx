import { redirect } from "next/navigation";

interface Props {
  searchParams: { ref?: string; aff?: string; plan?: string; a?: string; r?: string; obj?: string; tipo?: string };
}

/**
 * Un solo registro para toda la plataforma.
 *
 * Había dos formularios: este, de tres pasos, y el de `/completar-registro`, de
 * una sola pantalla. El de tres pasos pedía el rubro, el objetivo de ventas y
 * una descripción del negocio ANTES de dejar crear la cuenta — a quien viene a
 * comprar eso le pone una redacción por delante del pago. Todo eso lo pregunta
 * después el asistente de alta del agente, ya dentro y con calma.
 *
 * La ruta se conserva porque la usan los enlaces de registro (`?ref=`) y los de
 * afiliado (`?aff=`), que están repartidos por ahí fuera. Se redirige en vez de
 * romperlos, arrastrando todos los parámetros tal cual.
 */
const RegisterPage = ({ searchParams }: Props) => {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(searchParams)) {
    if (typeof valor === "string" && valor.trim()) params.set(clave, valor);
  }

  const query = params.toString();
  redirect(query ? `/completar-registro?${query}` : "/completar-registro");
};

export default RegisterPage;
