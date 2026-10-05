import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { laCuentaDelEnlaceDeAgenda } from "@/lib/enlace-de-agenda.server";
import SchedulePage, { generateMetadata as laMetadataDeLaCuenta } from "../page";

// El enlace legible (/schedule/<nombre>/agenda): se resuelve a la cuenta y se
// pinta la MISMA página que el enlace con el id, que sigue abriendo.
export const dynamic = "force-dynamic";

type Props = { params: { userId: string }; searchParams: Record<string, string | undefined> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const cuentaId = await laCuentaDelEnlaceDeAgenda(decodeURIComponent(params.userId), "schedule").catch(() => null);
    return laMetadataDeLaCuenta({ params: { userId: cuentaId ?? params.userId } });
}

export default async function AgendaPorNombre({ params, searchParams }: Props) {
    const cuentaId = await laCuentaDelEnlaceDeAgenda(decodeURIComponent(params.userId), "schedule");
    if (!cuentaId) notFound();
    return SchedulePage({ params: { userId: cuentaId }, searchParams: searchParams as never });
}
