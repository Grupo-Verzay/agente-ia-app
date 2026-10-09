// `AnimatedChat` (el teléfono de la landing) quieto: la conversación que se
// va escribiendo sola mueve cajas durante segundos, y un banco que mide
// posiciones necesita una pantalla que no se mueva. Mismo alto y mismo ancho
// de caja que el de verdad no hace falta: solo ocupa un hueco centrado.
import React from "react";

export function AnimatedChat() {
    return <div data-chat-quieto className="h-[420px] w-[260px] rounded-[2rem] border border-white/10 bg-slate-800" />;
}
