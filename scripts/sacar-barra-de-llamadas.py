#!/usr/bin/env python3
"""Saca la barra de CRM › Llamadas —la de AHORA y la de ANTES— del código real.

Ninguna de las dos se escribe a mano. La de ahora sale del árbol de trabajo y
la de antes de `origin/main` con `git show`; copiadas al banco se estaría
midiendo lo que alguien recuerda de cada pantalla y no la que React pinta.

Lo que se saca:

  ahora  el elemento `<BarraDeAcciones … />` entero de `CallsCrmClient.tsx`.
         Trae dentro sus cinco huecos tal cual los llena la pantalla, y con
         ellos el `DialogoDeLlamar` de verdad — o sea la ventana que el banco
         abre y cierra.

  antes  las DOS filas que había: el `toolbar` con el buscador, los rangos de
         días, exportar, actualizar y el `⋯`; y debajo el `<BarraDelMarcador>`
         con el campo del número y los dos botones de llamar dentro.
         `BarraDelMarcador.tsx` se copia **entero y literal** a un fichero
         aparte, para que su marcado sea el de `origin/main` sin una coma de
         diferencia.

Alrededor va lo mínimo para que eso se pueda pintar solo: los locales que las
rebanadas nombran y que en la pantalla venían del estado de `CallsCrmClient`.
Eso es andamiaje, no la barra; lo que se mide —cómo se reparte, qué mandos hay
y qué pasa al pulsarlos— es literal.

Cada rebanada se recorta por anclas que tienen que aparecer **exactamente una
vez**; si no, esto se cae con estruendo en vez de devolver un fichero que no
mide nada.

Uso:  scripts/sacar-barra-de-llamadas.py ahora <salida.tsx>
      scripts/sacar-barra-de-llamadas.py antes <salida.tsx> <salida-marcador.tsx>
"""
import subprocess
import sys

PANTALLA = "app/(root)/crm/llamadas/_components/CallsCrmClient.tsx"
MARCADOR = "app/(root)/crm/llamadas/_components/BarraDelMarcador.tsx"


def del_arbol(ruta: str) -> str:
    with open(ruta, encoding="utf-8") as f:
        return f.read()


def de_origin_main(ruta: str) -> str:
    hecho = subprocess.run(
        ["git", "show", f"origin/main:{ruta}"],
        capture_output=True, text=True,
    )
    if hecho.returncode != 0:
        sys.exit(
            f"no se pudo leer {ruta!r} de origin/main: {hecho.stderr.strip()}\n"
            "corre `git fetch origin main` antes"
        )
    return hecho.stdout


def rebanada(src: str, desde: str, hasta: str, incluir_final: bool) -> str:
    """El trozo entre dos anclas, exigiendo que la de entrada sea única."""
    cuantas = src.count(desde)
    if cuantas != 1:
        sys.exit(
            f"el ancla {desde!r} aparece {cuantas} veces; sin exactamente una "
            "la rebanada saldría de otro sitio y el banco mediría otra cosa"
        )
    i = src.index(desde)
    j = src.find(hasta, i + len(desde))
    if j < 0:
        sys.exit(f"no se encontró el final de la rebanada: {hasta!r}")
    return src[i : j + (len(hasta) if incluir_final else 0)]


# Los locales que las rebanadas nombran. Las cifras son las de una cuenta con
# tráfico de verdad: son las que más ancho piden, que es lo que hay que medir.
COMUN = '''
const KPIS = { total: 1284, outgoing: 742, incoming: 542, answered: 903, totalDurationSecs: 51240, avgDurationSecs: 40 };
const DIRECTION_OPTIONS = [
    { label: "Todas", value: "all" },
    { label: "Salientes", value: "outgoing" },
    { label: "Entrantes", value: "incoming" },
];
const EXPORTACION_DE_CLIENTES_HABILITADA = true;
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Lo que el banco lee para afirmar QUÉ llamada salió de cada botón. */
const anotar = (cual: "llamar" | "ia") => {
    const w = window as any;
    (w.__llamadas ??= { llamar: 0, ia: 0 })[cual] += 1;
};
'''

CABECERA_AHORA = '''"use client";
// GENERADO por scripts/sacar-barra-de-llamadas.py — no se edita a mano.
// El `<BarraDeAcciones>` de dentro sale del árbol de trabajo tal cual.

import React from "react";
import { Download, MessageSquare, MoreVertical, Phone, PhoneMissed, PhoneOutgoing, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarraDeAcciones } from "@/components/shared/BarraDeAcciones";
import { PastillasDeMetricas } from "@/components/shared/PastillasDeMetricas";
import { DialogoDeLlamar } from "@/app/(root)/crm/llamadas/_components/DialogoDeLlamar";
import { cn } from "@/lib/utils";
'''

CABECERA_ANTES = '''"use client";
// GENERADO por scripts/sacar-barra-de-llamadas.py — no se edita a mano.
// Las dos filas de dentro salen de `origin/main` con `git show`.

import React from "react";
import { Download, MessageSquare, MoreVertical, Phone, PhoneMissed, PhoneOutgoing, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarraDelMarcador } from "@/.banco-marcador-antes";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [
    { label: "7 días", value: 7 },
    { label: "30 días", value: 30 },
    { label: "90 días", value: 90 },
];
'''

ESTADO = '''
export function LaBarra() {
    const [query, setQuery] = React.useState("");
    const [direction, setDirection] = React.useState("all");
    const [dialNumber, setDialNumber] = React.useState("");
    const [days, setDays] = React.useState(30);
    const kpis = KPIS;
    const loading = false;
    const clearing = false;
    const botDialing = false;
    const visibleCalls: unknown[] = [{}];
    const startDial = () => anotar("llamar");
    const startBotDial = () => anotar("ia");
    const handleExport = () => {};
    const load = () => {};
    const openMissedCfg = () => {};
    const clearMissed = () => {};
    const deleteAll = () => {};
    // El menú de acciones esconde los dos borrados en bloque mientras se
    // consolidan varias cuentas de Finanzas; aquí se mide la pantalla normal.
    const unificado = false;
    // `days`, `setDays`, `load` y `unificado` solo los nombra la fila de ANTES;
    // se declaran en los dos para que el andamiaje sea el mismo y la única
    // diferencia medible sea la barra.
    void days; void setDays; void load; void loading; void unificado;

    return (
        <div className="flex flex-col gap-3">
'''

CIERRE = '''
        </div>
    );
}
'''


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__.strip().splitlines()[-2].strip())
    modo, salida = sys.argv[1], sys.argv[2]

    if modo == "ahora":
        src = del_arbol(PANTALLA)
        cuerpo = rebanada(src, "      <BarraDeAcciones\n", "\n      />", True)
        cabecera = CABECERA_AHORA
    elif modo == "antes":
        if len(sys.argv) != 4:
            sys.exit("el modo «antes» necesita también el fichero del marcador")
        src = de_origin_main(PANTALLA)
        toolbar = rebanada(
            src,
            "      {/* Toolbar: buscador + rango de días */}\n",
            "\n      {/* La barra de arriba:",
            False,
        )
        marcador = rebanada(src, "      <BarraDelMarcador\n", "\n      />", True)
        cuerpo = toolbar + "\n" + marcador
        cabecera = CABECERA_ANTES
        with open(sys.argv[3], "w", encoding="utf-8") as f:
            f.write("// GENERADO por scripts/sacar-barra-de-llamadas.py — copia LITERAL\n")
            f.write("// de `origin/main:" + MARCADOR + "`.\n")
            f.write(de_origin_main(MARCADOR))
    else:
        sys.exit(f"modo desconocido: {modo!r} (ahora | antes)")

    with open(salida, "w", encoding="utf-8") as f:
        f.write(cabecera)
        f.write(COMUN)
        f.write(ESTADO)
        f.write(cuerpo)
        f.write(CIERRE)


if __name__ == "__main__":
    main()
