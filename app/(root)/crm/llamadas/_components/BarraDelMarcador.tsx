"use client";

import { Bot, Loader2, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarraDeslizable } from "@/components/shared/BarraDeslizable";
import { PastillasDeMetricas, type Metrica } from "@/components/shared/PastillasDeMetricas";
import { cn } from "@/lib/utils";

/**
 * La barra de arriba de CRM › Llamadas: marcar un número y acotar el historial.
 *
 * # Qué había, y por qué se junta todo aquí
 *
 * Eran **dos filas separadas y una palabra de más en cada una**. Arriba, un
 * recuadro que se presentaba a sí mismo —un icono de teléfono y la palabra
 * «Marcador»— con el campo, los dos botones y, al final, un «Rellamar:» con la
 * pastilla del último contacto. Abajo, pegada al historial, otra cabecera que
 * decía «Historial» y llevaba a la derecha los conteos y los filtros de
 * dirección.
 *
 * Nada de eso informaba: la pantalla ya se llama Llamadas, el campo ya se ve
 * que es un campo, y la tabla de abajo ya se ve que es el historial. Lo que sí
 * costaba es que **los conteos y el filtro vivieran lejos del marcador**, dos
 * bloques de alto por encima de la tabla que es lo que se viene a leer.
 *
 * Así que es **una sola fila**: a la izquierda marcar, a la derecha acotar.
 *
 * # Las cuatro cosas que hay que mantener
 *
 * 1. **En computador UNA fila; en el teléfono DOS**, y la de abajo se
 *    desplaza. El corte es `sm:` —el mismo de siempre— y lo que se apila es el
 *    `flex-col sm:flex-row` de la caja, no un `flex-wrap`: con `wrap` la fila
 *    se parte por donde toque y el resultado depende de cuánto mida un rótulo.
 * 2. **Lo de la derecha va en UN carril, no en dos.** Las pastillas y el grupo
 *    de dirección son dos cosas distintas y comparten el sitio: metiendo cada
 *    una en su propio `BarraDeslizable` habría dos scrollports pegados, y en un
 *    teléfono el segundo se lleva el ancho que le falta al primero. Uno solo,
 *    con `min-w-max` dentro para que **nada se comprima** —que es la regla que
 *    `BarraDeAcciones` ya pagó una vez: un carril que se desplaza no impide que
 *    lo de dentro encoja—.
 * 3. **«Llamar con IA» pesa lo mismo que «Llamar».** Los dos sólidos, el mismo
 *    alto y el mismo relleno, y lo único que los separa es el color y el icono.
 *    En contorno, el de IA se leía como el secundario de los dos, y no lo es:
 *    son dos formas de llamar al mismo número.
 * 4. **Y las pastillas salen también en el teléfono** (`enElTelefono`). Son la
 *    única forma de mover el filtro de dirección junto al grupo de al lado, así
 *    que esconderlas ahí no ahorra sitio: quita la función. Su renglón ya se
 *    desplaza, así que no le roban ancho a nada.
 */
export function BarraDelMarcador({
    numero,
    alEscribir,
    alLlamar,
    alLlamarConIa,
    llamandoConIa,
    metricas,
    direcciones,
    direccion,
    alCambiarDireccion,
}: {
    numero: string;
    alEscribir: (valor: string) => void;
    alLlamar: () => void;
    alLlamarConIa: () => void;
    llamandoConIa: boolean;
    /** Los conteos, ya armados por la pantalla: ella sabe qué cifras son. */
    metricas: Metrica[];
    direcciones: { label: string; value: string }[];
    direccion: string;
    alCambiarDireccion: (valor: string) => void;
}) {
    // El mismo criterio que ya tenía el marcador: sin seis dígitos no hay
    // número al que llamar, así que los dos botones se apagan a la vez.
    const digitos = numero.replace(/\D/g, "");
    const sinNumero = digitos.length < 6;

    return (
        <Card className="border-border">
            <CardContent
                data-barra="marcador"
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
            >
                <div
                    data-zona="marcar"
                    // `w-full` en el teléfono para que el campo tenga de dónde
                    // sacar el ancho que los dos botones le dejan; de `sm:` en
                    // adelante vuelve a medir lo suyo y no empuja al carril.
                    className="flex w-full shrink-0 items-center gap-2 sm:w-auto"
                >
                    <Input
                        value={numero}
                        onChange={(e) => alEscribir(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") alLlamar();
                        }}
                        // El texto guía es un EJEMPLO, no una explicación: quien
                        // escribe aquí ya sabe que va un número, y lo único que
                        // no sabe es si lleva el código de país. Con la frase
                        // larga el campo pedía 20 rem para decir eso.
                        placeholder="Ej. 573001234567"
                        inputMode="tel"
                        aria-label="Número al que llamar"
                        // En el teléfono el campo es lo ÚNICO que cede: los dos
                        // botones ya van solo con su icono y no dan más de sí,
                        // así que lo que sobra de la fila se lo queda él.
                        className="h-9 min-w-0 flex-1 sm:w-52 sm:flex-none"
                    />
                    <Button
                        data-boton="llamar"
                        aria-label="Llamar"
                        title="Llamar"
                        className="h-9 shrink-0 gap-2 bg-green-600 px-3 text-white hover:bg-green-700 sm:px-4"
                        onClick={alLlamar}
                        disabled={sinNumero}
                    >
                        <Phone className="h-4 w-4" />
                        <span className="hidden sm:inline">Llamar</span>
                    </Button>
                    <Button
                        data-boton="llamar-ia"
                        aria-label="Llamar con IA"
                        className="h-9 shrink-0 gap-2 bg-violet-600 px-3 text-white hover:bg-violet-700 sm:px-4"
                        onClick={alLlamarConIa}
                        disabled={sinNumero || llamandoConIa}
                        title="El asistente de voz IA llama y conversa por ti"
                    >
                        {llamandoConIa ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Bot className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Llamar con IA</span>
                    </Button>
                </div>

                <BarraDeslizable queHay="filtros" className="sm:ml-auto">
                    <div
                        data-zona="filtros"
                        // `min-w-max` y no `w-max`: con `w-max` la fila mide
                        // siempre su contenido y el `justify-end` de abajo se
                        // queda sin sobrante que repartir, así que en computador
                        // los filtros dejarían de pegarse al borde derecho.
                        className="flex min-w-max items-center justify-end gap-2"
                    >
                        <PastillasDeMetricas enElTelefono metricas={metricas} />
                        <div
                            data-grupo="direccion"
                            className="flex shrink-0 rounded-lg border border-border p-0.5"
                        >
                            {direcciones.map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => alCambiarDireccion(o.value)}
                                    className={cn(
                                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                                        direccion === o.value
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </BarraDeslizable>
            </CardContent>
        </Card>
    );
}
