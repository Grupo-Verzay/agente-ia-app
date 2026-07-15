import { CachedSidebar } from "./_components/CachedSidebar";
import { LoadingProgress } from "@/components/shared/LoadingProgress";

export default function Loading() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Izquierda: última lista de chats conocida (instantánea, desde caché) */}
      <CachedSidebar />

      {/* Derecha: card de carga pulido (no burbujas falsas: aún no hay chat abierto) */}
      <div className="flex flex-1 items-center justify-center p-6">
        <LoadingProgress
          label="Cargando conversaciones"
          description="Esto suele tardar solo unos segundos..."
        />
      </div>
    </div>
  );
}
