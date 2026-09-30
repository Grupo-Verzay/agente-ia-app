// La encuesta del contacto, fingida: la ficha espera `{ encuestas }` y la
// acción muda genérica contesta otra forma.
export async function getEncuestasDelContactoAction() {
    return { success: true as const, encuestas: [] };
}
