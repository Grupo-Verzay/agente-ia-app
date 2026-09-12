// components/training/cards/LeerGoogleSheetsCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PropsLeerGoogleSheets } from "@/types/agentAi";
import { esUrlDeGoogleSheets } from "@/lib/url-de-google-sheets";
import { ElementMenu } from "./ElementMenu";

/**
 * El elemento que consulta una hoja de cálculo.
 *
 * Mismo cuerpo que «Ejecutar flujo» —cabecera con su menú, contenido debajo— y
 * la única diferencia es lo que pide: en vez de elegir un flujo de una lista,
 * se pega la URL de la hoja.
 *
 * La URL se pega de la barra del navegador con la pestaña abierta: ahí dentro
 * viaja el `gid`, que es lo único que identifica la pestaña. Una URL sin `gid`
 * vale igual —la hoja de una sola pestaña no lo lleva—, así que no se exige.
 *
 * Y no lleva texto de ayuda debajo. La tarjeta se queda como sus hermanas —el
 * título y su campo, nada más—: un párrafo de instrucciones dentro de un
 * elemento del paso desequilibra la columna entera y empuja hacia abajo lo que
 * viene después. Lo que hay que saber para pegar bien la URL se explica donde
 * se explica lo demás, no en la tarjeta.
 */
export const LeerGoogleSheetsCard: FC<PropsLeerGoogleSheets> = ({
    el,
    onRemove,
    onChangeUrl,
    isManagement,
}) => {
    const url = el.sheetUrl ?? "";
    // Solo se avisa de lo que está escrito y no sirve. El campo vacío no es un
    // error: significa "usa la hoja configurada en la herramienta".
    const malaUrl = url.trim().length > 0 && !esUrlDeGoogleSheets(url);

    return (
        <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="py-2 px-3 flex-row items-center justify-between">
                <CardTitle className="text-md uppercase">Leer Google Sheets</CardTitle>
                {!isManagement && (
                    <ElementMenu onRemove={onRemove} />
                )}
            </CardHeader>

            <CardContent className="space-y-2 px-3 pb-3 pt-0">
                <Input
                    value={url}
                    onChange={(e) => onChangeUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    aria-invalid={malaUrl}
                    aria-label="URL de Google Sheets"
                    className={malaUrl ? "border-destructive focus-visible:ring-destructive" : undefined}
                />

                {malaUrl && (
                    <p className="text-xs text-destructive">
                        Esa no es una URL de Google Sheets. Debe empezar por
                        {" "}docs.google.com/spreadsheets.
                    </p>
                )}
            </CardContent>
        </Card>
    );
};
