import {
  Bot,
  CalendarDays,
  Coins,
  Headphones,
  MessagesSquare,
  Package,
  Phone,
  Smartphone,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IconoDeRecuadro } from "@/lib/pagina-de-plan";

/**
 * El dibujo de cada icono que se le puede poner a un recuadro del resumen de
 * capacidad (`ICONOS_DE_RECUADRO`). Lo usan la página pública del plan y el
 * editor del panel: con el mapa escrito en cada uno, el panel ofrecería un
 * dibujo y la página pintaría otro.
 */
export const DIBUJO_DEL_RECUADRO: Record<IconoDeRecuadro, LucideIcon> = {
  creditos: Coins,
  catalogo: Package,
  asistencia: Bot,
  usuarios: Users,
  lineas: Smartphone,
  mensajes: MessagesSquare,
  llamadas: Phone,
  agenda: CalendarDays,
  soporte: Headphones,
  estrella: Star,
};

/** El dibujo de un icono; uno que no se conoce es la estrella de «Destacado». */
export function elDibujoDelRecuadro(icono: string): LucideIcon {
  return (DIBUJO_DEL_RECUADRO as Record<string, LucideIcon>)[icono] ?? Star;
}
