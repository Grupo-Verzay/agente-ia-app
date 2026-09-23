/**
 * La entrada que se empaqueta para el banco del relleno de historial. Todo es
 * de produccion; lo unico fingido en el test es el PROVEEDOR (la red), que se
 * arma con los mismos traductores (`traidoDeEvolution`, `traidoDeWaha`).
 */
export {
  rellenarLaLinea,
  rellenarUnChat,
  revisarUnChat,
  estadoDelRelleno,
  laLineaDelRelleno,
  traidoDeEvolution,
  traidoDeWaha,
} from "@/lib/relleno-de-historial.server";
export { planDelChat, chatsQueQuedan, dondeViveLaConversacion } from "@/lib/relleno-de-historial";
export { persistEvolutionMessages } from "@/lib/chat-persistence";
export { db } from "@/lib/db";
