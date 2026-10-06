/**
 * Validación del formato de la API key según el proveedor.
 *
 * Módulo puro (NO 'use server') para poder compartirlo entre el server action
 * (barrera real) y el formulario del cliente (UX), con una sola fuente de verdad
 * y sin riesgo de que ambas validaciones diverjan.
 *
 * Devuelve un mensaje claro de error si la clave es inválida, o null si es válida.
 * Evita que se guarde una URL, un teléfono u otro texto en lugar de la clave (eso
 * causaba 401 silenciosos y degradaba el clasificador de leads sin que nadie se
 * enterara hasta ver los logs).
 */
export function validateProviderApiKey(providerName: string, apiKey: string): string | null {
  const key = (apiKey ?? '').trim();
  if (!key) return 'La API key es obligatoria.';
  // Una clave de verdad son letras, números, guiones y puntos, sin espacios ni
  // puntitos de máscara (••••, …): una copiada de una pantalla que la tapa, una
  // dirección o un teléfono se guardaban y la transcripción fallaba sin decir
  // por qué. Misma regla que `noTieneFormaDeClave` al transcribir.
  if (!/^[A-Za-z0-9_\-.]{20,}$/.test(key) || !/[A-Za-z]/.test(key)) {
    return 'Esa API key no es válida: pégala completa, tal como la da el proveedor (sin puntos de máscara ni espacios).';
  }
  if ((providerName ?? '').toLowerCase() === 'openai' && !key.startsWith('sk-')) {
    return 'La API key de OpenAI debe empezar por "sk-". Verifica que pegaste la clave correcta (no una URL ni un teléfono).';
  }
  return null;
}
