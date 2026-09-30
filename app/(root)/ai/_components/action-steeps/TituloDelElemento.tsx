"use client";

import { FC, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CardTitle } from "@/components/ui/card";

/**
 * El título de una tarjeta de elemento de un paso: un icono apagado y el
 * nombre en mayúsculas. Lo usan TODAS las tarjetas —Respuesta, Nota interna,
 * Ejecutar flujo, Notificar asesor, Leer Google Sheets y las de datos—.
 *
 * Antes cada una escribía su título: Respuesta y Nota interna llevaban icono,
 * Ejecutar flujo y Notificar asesor no, y Captura de datos ni siquiera iba en
 * mayúsculas. Puestas una debajo de otra dentro del mismo paso se leían como
 * tres pantallas distintas. Con el título en un sitio, el que se añada mañana
 * sale igual que los demás.
 *
 * El icono es el mismo dibujo que el menú «Agregar acción» pone delante de
 * cada opción (⚡ flujo, 🔔 asesor, 📊 hoja, 🔒 nota), para que lo que se
 * elige y lo que aparece se reconozcan.
 */
export const TituloDelElemento: FC<{ icono: LucideIcon; children: ReactNode }> = ({ icono: Icono, children }) => (
    <CardTitle className="text-md flex items-center gap-2 uppercase" data-titulo-del-elemento>
        <Icono className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {children}
    </CardTitle>
);
