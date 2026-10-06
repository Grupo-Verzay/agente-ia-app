/** El registro de llaves de Verzay del banco: `globalThis.__llavesDeLaCasa`. */
const llaves = (): string[] =>
  (globalThis as unknown as { __llavesDeLaCasa?: string[] }).__llavesDeLaCasa ?? [];
export async function hayRegistroDeLlaves() { return llaves().length > 0; }
export async function esLlaveDeVerzay(clave: string) { return llaves().includes(clave.trim()); }
export async function pagaElClienteSuIa() {
  return (globalThis as unknown as { __pagaSuIa?: boolean }).__pagaSuIa ?? false;
}
