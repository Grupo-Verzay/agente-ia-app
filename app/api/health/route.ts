import { NextResponse } from "next/server";

// Señal de vida del contenedor, para el `healthcheck` de Docker y para que
// Traefik sepa cuándo la instancia nueva ya escucha.
//
// Sin esto no se puede usar `Order: start-first` con garantías: Swarm apagaría
// la vieja en cuanto la nueva ARRANCA, que no es lo mismo que cuando está lista
// para contestar. Con este endpoint, la nueva no cuenta como sana hasta que
// Next responde de verdad, y la vieja no se apaga hasta entonces. Ver el
// pendiente del coste de cada despliegue en CLAUDE.md.
//
// A propósito NO toca la base de datos. Esto responde "este proceso está en pie
// y sirviendo", nada más. Si mirara Postgres, un pico de la base tumbaría el
// healthcheck, Swarm mataría contenedores sanos y una lentitud pasajera se
// convertiría en una caída. El estado de la base se vigila aparte.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
