import { CentroDeAyuda } from "@/components/ayuda/CentroDeAyuda";
import { lasGuiasDelCentroDeAyuda } from "@/lib/guias-del-centro-de-ayuda";

/**
 * El centro de ayuda: el botón «Ayuda» de la barra de arriba lleva aquí.
 *
 * No es un módulo: no se asigna en «Editar módulo» ni lo cierra el guardián
 * del layout, porque la ayuda es para todo el que usa la plataforma. Y no lee
 * nada de la base: las guías publicadas están en el código
 * (`GUIAS_PUBLICADAS`), así que la pantalla no puede quedarse vacía por un
 * fallo de consulta.
 *
 * Sin `metadata` propia, a propósito: el título de la pestaña es la marca de
 * la cuenta (el layout lo pone, también para un reseller), como en el resto de
 * pantallas.
 */
export default function AyudaPage() {
    return <CentroDeAyuda guias={lasGuiasDelCentroDeAyuda()} />;
}
