import { redirect } from "next/navigation";

import { elEnlaceDeTutoriales } from "@/lib/tutoriales-de-la-landing";

/**
 * `/tutoriales` ya no es una página aparte: los tutoriales son una sección de
 * la landing (`/inicio#tutoriales`). Esta dirección se queda para no romper
 * los enlaces que ya circulan, y lleva allí.
 */
export default function TutorialesPage() {
    redirect(elEnlaceDeTutoriales());
}
