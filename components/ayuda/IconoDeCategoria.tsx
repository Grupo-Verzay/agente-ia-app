import {
    AdjustmentsHorizontalIcon,
    BoltIcon,
    ChatBubbleLeftRightIcon,
    Cog6ToothIcon,
    IdentificationIcon,
    LifebuoyIcon,
    PuzzlePieceIcon,
    ShieldCheckIcon,
    SparklesIcon,
    UsersIcon,
} from "@heroicons/react/24/solid";

import type { IconoDeCategoria as NombreDelIcono } from "@/lib/centro-de-ayuda";

/**
 * El icono de una categoría del centro de ayuda: el MISMO de su grupo en el
 * menú lateral (heroicons sólidos, como `iconMap`), para que la tarjeta se
 * reconozca de un vistazo con lo que ya se ve a la izquierda.
 */
const ICONOS: Record<NombreDelIcono, typeof ShieldCheckIcon> = {
    ShieldCheckIcon,
    ChatBubbleLeftRightIcon,
    IdentificationIcon,
    PuzzlePieceIcon,
    AdjustmentsHorizontalIcon,
    LifebuoyIcon,
    UsersIcon,
    SparklesIcon,
    BoltIcon,
    Cog6ToothIcon,
};

export function IconoDeCategoria({ nombre, className }: { nombre: NombreDelIcono; className?: string }) {
    const Icono = ICONOS[nombre];
    return <Icono className={className} aria-hidden />;
}
