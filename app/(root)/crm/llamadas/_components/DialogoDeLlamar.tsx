"use client";

import { useState } from "react";
import { Bot, Loader2, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { SelectorDeVia } from "@/components/shared/SelectorDeVia";
import { cuentasParaLlamarAction } from "@/actions/cuentas-para-llamar-actions";
import { laOpcionPorDefecto, type OpcionDeLlamada } from "@/lib/cuentas-para-llamar";

/**
 * El botón «Llamar» de la barra de CRM › Llamadas, y su ventana.
 *
 * # Por qué el campo y «Llamar con IA» salieron de la barra
 *
 * La fila de mandos llevaba dentro el campo del número y los DOS botones de
 * llamar, que entre los tres se comían unos 340 px — y en un teléfono eso
 * obligaba a que el campo cediera hasta cuatro dígitos y a que los dos botones
 * se quedaran solo con su icono. Marcar un número es algo que se hace de vez en
 * cuando; la barra la usa quien viene a LEER el historial.
 *
 * Así que la barra se queda como la de Leads —buscador, pastillas y un solo
 * botón de acción a la derecha— y lo de marcar vive en una ventana, con el
 * mismo estilo que «Crear contacto» de Leads: mismo ancho (`sm:max-w-[400px]`),
 * misma cabecera, mismo `Label` + `Input`.
 *
 * # Las tres cosas que hay que mantener
 *
 * 1. **Las dos llamadas son EXACTAMENTE las de antes.** Este componente no
 *    sabe llamar: recibe `alLlamar` y `alLlamarConIa` y los dispara. Cambiar
 *    aquí cómo se llama sería tener dos formas de hacerlo, y la de la cabecera
 *    de Chats se quedaría atrás.
 * 2. **El campo va alineado a la IZQUIERDA**, con su `text-left` escrito: es un
 *    número que se teclea y se revisa dígito a dígito, y centrado no se puede
 *    comparar con el de al lado.
 * 3. **Los dos botones son hijos DIRECTOS de `DialogFooter`.** Ese pie es
 *    `justify-between`: metidos en un `<div>` el pie ve un solo hijo y los manda
 *    todos a un extremo — está medido en este repositorio, +198 px. Y son DOS:
 *    «Llamar IA» a la izquierda y «Llamar» a la derecha. «Cancelar» sobraba —la
 *    ventana se cierra con la X y tocando fuera— y con él el pie tenía tres.
 *
 * # Y llamar CIERRA la ventana
 *
 * Lo cazó el banco, y no es un detalle de estilo. El velo de Radix es
 * `fixed inset-0 z-50 bg-black/80` y **se traga las pulsaciones de todo lo que
 * hay debajo**: dejándolo puesto, la tarjeta flotante que `abrirLlamadaAqui`
 * acaba de abrir queda detrás de él, así que **no se puede ni colgar**. Y la
 * barra tampoco responde, con lo que no se puede marcar un segundo número.
 *
 * Cerrar **no cambia qué llamada sale** —la regla de arriba sigue en pie, este
 * componente solo dispara lo que le pasan— y del lado de la IA el aviso no se
 * pierde: `startBotDial` lo cuenta con su `toast`.
 *
 * # Y el «Vía:» dice por qué cuenta sale
 *
 * El mismo mando que «Nuevo mensaje» de Chats (`SelectorDeVia`), con las
 * cuentas que quien mira alcanza —la suya y las de abajo— y la suya elegida al
 * abrir. Lo que se le pasa a `alLlamar`/`alLlamarConIa` es la LÍNEA de esa
 * cuenta (`null` para la propia), y de ahí el servidor saca número, créditos y
 * registro por el camino de siempre. Ver `lib/cuentas-para-llamar.ts`.
 *
 * Se piden al ABRIR, no en cada carga de la pantalla: el diálogo casi nunca se
 * abre y la lista cuesta tres consultas. Si falla, se llama con la propia —lo
 * que se hacía antes— y se dice.
 */
export function DialogoDeLlamar({
    numero,
    alEscribir,
    alLlamar,
    alLlamarConIa,
    llamandoConIa,
}: {
    numero: string;
    alEscribir: (valor: string) => void;
    alLlamar: (instanceName: string | null) => void;
    alLlamarConIa: (instanceName: string | null) => void;
    llamandoConIa: boolean;
}) {
    const [abierto, setAbierto] = useState(false);
    const [opciones, setOpciones] = useState<OpcionDeLlamada[]>([]);
    const [via, setVia] = useState("");
    const [avisoCuentas, setAvisoCuentas] = useState<string | null>(null);

    const abrir = () => {
        setAbierto(true);
        void cuentasParaLlamarAction()
            .then((r) => {
                if (!r.success) {
                    setAvisoCuentas(r.message);
                    return;
                }
                setAvisoCuentas(null);
                setOpciones(r.opciones);
                // La propia, cada vez que se abre: la elección de la vez
                // anterior no puede quedarse puesta sin que nadie la vea.
                setVia(laOpcionPorDefecto(r.opciones));
            })
            .catch((error) => {
                console.warn("[llamadas] no se pudieron cargar las cuentas para llamar", error);
                setAvisoCuentas("No se pudieron cargar las cuentas; se llama con la tuya.");
            });
    };

    const elegida = opciones.find((o) => o.id === via) ?? null;
    const linea = elegida?.instanceName ?? null;
    const viaNoSirve = Boolean(elegida?.motivo);

    // El mismo criterio de siempre: sin seis dígitos no hay número al que
    // llamar, así que los dos botones se apagan a la vez.
    const digitos = numero.replace(/\D/g, "");
    const sinNumero = digitos.length < 6 || viaNoSirve;

    // Llamar CIERRA la ventana: el velo de Radix se traga las pulsaciones de
    // todo lo que hay debajo, y debajo está la tarjeta flotante de la llamada
    // que se acaba de abrir. Ver la explicación de arriba.
    const llamar = () => {
        setAbierto(false);
        alLlamar(linea);
    };
    const llamarConIa = () => {
        setAbierto(false);
        alLlamarConIa(linea);
    };

    return (
        <>
            <Button
                data-boton="abrir-llamar"
                onClick={abrir}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
            >
                Llamar
            </Button>

            <Dialog open={abierto} onOpenChange={setAbierto}>
                <DialogContent data-dialogo="llamar" className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Llamar</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-2">
                        <SelectorDeVia
                            opciones={opciones.map((o) => ({
                                id: o.id,
                                etiqueta: o.nombre,
                                deshabilitada: Boolean(o.motivo),
                                motivo: o.motivo,
                            }))}
                            valor={via}
                            alCambiar={setVia}
                            vacio="Seleccionar cuenta"
                        />
                        {elegida?.motivo && (
                            <p data-aviso="via" className="text-xs text-amber-600">
                                {elegida.nombre}: {elegida.motivo.toLowerCase()}. Vincúlalo en Conexión de esa cuenta.
                            </p>
                        )}
                        {avisoCuentas && <p className="text-xs text-amber-600">{avisoCuentas}</p>}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="llamar-numero">Número de WhatsApp</Label>
                            <Input
                                id="llamar-numero"
                                value={numero}
                                onChange={(e) => alEscribir(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !sinNumero) llamar();
                                }}
                                placeholder="573001234567"
                                inputMode="tel"
                                aria-label="Número al que llamar"
                                className="text-left"
                            />
                        </div>
                    </div>
                    {/*
                      Dos botones y ninguno más: sin «Cancelar», que la ventana
                      ya se cierra con la X y tocando fuera. «Llamar IA» a la
                      IZQUIERDA y «Llamar» a la DERECHA, en la misma fila —
                      `flex-nowrap`, que el pie de la casa lleva `flex-wrap` y
                      en un teléfono los partiría en dos líneas—. Son hijos
                      DIRECTOS del pie: es lo que hace que `justify-between` los
                      lleve a cada extremo.
                    */}
                    <DialogFooter className="flex-nowrap">
                        <Button
                            data-boton="llamar-ia"
                            type="button"
                            className="min-w-0 gap-2 bg-violet-600 text-white hover:bg-violet-700"
                            onClick={llamarConIa}
                            disabled={sinNumero || llamandoConIa}
                            title="El asistente de voz IA llama y conversa por ti"
                        >
                            {llamandoConIa ? (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            ) : (
                                <Bot className="h-4 w-4 shrink-0" />
                            )}
                            Llamar IA
                        </Button>
                        <Button
                            data-boton="llamar"
                            type="button"
                            className="min-w-0 gap-2 bg-green-600 text-white hover:bg-green-700"
                            onClick={llamar}
                            disabled={sinNumero}
                        >
                            <Phone className="h-4 w-4 shrink-0" />
                            Llamar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
