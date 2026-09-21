#!/usr/bin/env python3
"""Saca de `origin/main` los DOS bloques que la barra del marcador vino a unir.

El «antes» de un banco **no se escribe a mano**: copiado, se estaría midiendo
lo que alguien recuerda de la pantalla vieja y no la que había. Así que los dos
trozos salen con `git show`, recortados por sus propios comentarios:

  1. el recuadro «Marcador» —su icono, su palabra, el campo con el texto guía
     largo, los dos botones (el de IA en CONTORNO) y el «Rellamar:»—;
  2. la cabecera «Historial», que es donde vivían los conteos y los filtros de
     dirección, dos bloques de alto por debajo del marcador.

Alrededor va lo mínimo para que eso se pueda pintar solo: los locales que las
dos rebanadas nombran y que en la pantalla de verdad venían del estado de
`CallsCrmClient`. Eso es andamiaje, no el «antes»; lo que se mide —cómo se
reparte, qué palabras salen y qué aspecto tiene el botón de IA— es literal.

Y se le pegan las MARCAS que el banco busca en el DOM (`data-barra`,
`data-zona`, `data-boton`, `data-grupo`). Son las mismas que lleva la barra
nueva: sin ellas la medida no encontraría nada y el modo roto saldría en verde
sin haber ejercido una sola comprobación. Cada marca se inserta sobre un ancla
que tiene que aparecer **exactamente una vez**; si no, esto se cae con
estruendo en vez de devolver un fichero que no mide nada.

Uso:  scripts/sacar-marcador-de-antes.py .banco-marcador-antes.tsx
"""
import subprocess
import sys

FUENTE = "app/(root)/crm/llamadas/_components/CallsCrmClient.tsx"

# Las marcas: (ancla, lo que se le pega delante). El ancla es texto literal de
# `origin/main` y se exige que sea única.
MARCAS = [
    ('<CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">',
     '<CardContent data-barra="marcador" data-zona="marcar" '
     'className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">'),
    ('className="h-9 gap-2 bg-green-600 text-white hover:bg-green-700"',
     'data-boton="llamar" className="h-9 gap-2 bg-green-600 text-white hover:bg-green-700"'),
    ('className="h-9 gap-2 border-violet-300',
     'data-boton="llamar-ia" className="h-9 gap-2 border-violet-300'),
    ('<div className="ml-auto flex items-center gap-2">',
     '<div data-zona="filtros" className="ml-auto flex items-center gap-2">'),
    ('<div className="flex shrink-0 rounded-lg border border-border p-0.5">',
     '<div data-grupo="direccion" className="flex shrink-0 rounded-lg border border-border p-0.5">'),
]


def rebanada(src: str, desde: str, hasta: str, incluir_final: bool) -> str:
    i = src.find(desde)
    if i < 0:
        sys.exit(f"no se encontró en origin/main el principio del bloque: {desde!r}")
    j = src.find(hasta, i + len(desde))
    if j < 0:
        sys.exit(f"no se encontró en origin/main el final del bloque: {hasta!r}")
    return src[i : j + (len(hasta) if incluir_final else 0)]


def marcar(texto: str) -> str:
    for ancla, con_marca in MARCAS:
        cuantas = texto.count(ancla)
        if cuantas != 1:
            sys.exit(
                f"el ancla {ancla!r} aparece {cuantas} veces en lo sacado de "
                "origin/main; sin exactamente una, la marca iría al sitio "
                "equivocado y el modo roto mediría otra cosa"
            )
        texto = texto.replace(ancla, con_marca)
    return texto


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("uso: sacar-marcador-de-antes.py <fichero de salida>")
    salida = sys.argv[1]

    src = subprocess.run(
        ["git", "show", f"origin/main:{FUENTE}"],
        capture_output=True, text=True, check=True,
    ).stdout

    marcador = rebanada(src, "{/* Marcador */}", "{/* Gráficos eliminados", False)
    historial = rebanada(
        src,
        '<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">',
        "</CardHeader>",
        True,
    )

    cuerpo = marcar(marcador + "\n" + "<Card className=\"border-border\">\n" + historial + "\n</Card>\n")

    with open(salida, "w", encoding="utf-8") as f:
        f.write('"use client";\n')
        f.write("// GENERADO por scripts/sacar-marcador-de-antes.py — no se edita a mano.\n")
        f.write("// Los dos bloques de dentro salen de `origin/main` con `git show`.\n\n")
        f.write('import { Bot, Loader2, Phone, PhoneMissed, PhoneOutgoing } from "lucide-react";\n')
        f.write('import { Button } from "@/components/ui/button";\n')
        f.write('import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";\n')
        f.write('import { Input } from "@/components/ui/input";\n')
        f.write('import { PastillasDeMetricas } from "@/components/shared/PastillasDeMetricas";\n')
        f.write('import { abrirLlamadaAqui } from "@/components/chats/AnfitrionDeLlamada";\n')
        f.write('import { cn } from "@/lib/utils";\n\n')
        f.write(ANDAMIO)
        f.write("    return (\n        <>\n")
        f.write(cuerpo)
        f.write("        </>\n    );\n}\n")


# El andamiaje: los locales que las dos rebanadas nombran. En la pantalla de
# verdad venían del estado de `CallsCrmClient`; aquí llegan por las MISMAS
# props que recibe la barra nueva, para que las dos versiones se midan con las
# mismas cifras y el único cambio sea la pantalla.
ANDAMIO = '''
/** El antes, con la misma firma que `BarraDelMarcador` para poder compararlas. */
export function BarraDelMarcador(props: any) {
    const dialNumber: string = props.numero;
    const setDialNumber = props.alEscribir;
    const startDial = props.alLlamar;
    const startBotDial = props.alLlamarConIa;
    const botDialing: boolean = props.llamandoConIa;
    const dialDigits = dialNumber.replace(/\\D/g, "");
    const direction: string = props.direccion;
    const setDirection = props.alCambiarDireccion;
    const DIRECTION_OPTIONS = props.direcciones;
    const kpis = props.kpis;
    // El «Rellamar:» solo se pintaba con alguna llamada reciente detrás, y es
    // justo una de las palabras que el banco comprueba que hoy ya no están.
    const recentDials = [{ phone: "573001112233", name: "Marta Restrepo" }];
    const fmtDuration = (s: number) =>
        `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

'''

if __name__ == "__main__":
    main()
