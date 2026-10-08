import { redirect } from "next/navigation";
import { LOS_PRECIOS_DE_LA_LANDING } from "@/lib/pantalla-de-verzy";

// La vista de planes DENTRO de la plataforma (las tarjetas con «Elegir plan»)
// se quitó: los precios se ven en un solo sitio, la sección de precios de la
// landing. Quien llegue a /planes —un enlace guardado, el candado de un
// módulo— aterriza ahí. Cambiar de plan va por «Cambiar plan» del Perfil.
// Solo /planes a secas: /planes/<nivel> es la página pública de un plan.
export default function PlanesPage(): never {
  redirect(LOS_PRECIOS_DE_LA_LANDING);
}
