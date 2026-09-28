"use client";

import { ICONO_DE_CHATS, PanelSinSeleccion } from "@/components/shared/PanelSinSeleccion";

/**
 * Chats sin conversación abierta. El panel es el compartido con Correo
 * (`PanelSinSeleccion`); aquí solo va lo que dice y qué filtra cada tarjeta.
 */
export function PanelSinChat({ alIrA }: { alIrA: (tab: "mine" | "all", sinLeer?: boolean) => void }) {
    return (
        <PanelSinSeleccion
            className="hidden sm:flex"
            icono={ICONO_DE_CHATS}
            titulo="Tus conversaciones"
            texto="Selecciona un chat de la lista para comenzar"
            tarjetas={[
                { clave: "mias", tono: "violeta", letra: "M", titulo: "Mías", texto: "Conversaciones asignadas a ti", alPulsar: () => alIrA("mine") },
                { clave: "todos", tono: "azul", letra: "T", titulo: "Todos", texto: "Todas las conversaciones activas", alPulsar: () => alIrA("all") },
                // El MISMO filtro que la pastilla de la barra, así que el mismo
                // nombre: con «No leídos» aquí y «Sin leer» allá se leen como
                // dos filtros distintos.
                { clave: "sinLeer", tono: "naranja", letra: "S", titulo: "Sin leer", texto: "Conversaciones pendientes por leer", alPulsar: () => alIrA("all", true) },
            ]}
        />
    );
}
