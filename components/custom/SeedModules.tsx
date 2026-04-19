'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const SeedModules = () => {
  const [loading, setLoading] = useState(false);

  const handleSeedModules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seed-modules", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(" Módulos creados correctamente");
      } else {
        toast.error("❌ Error al crear módulos");
      }
    } catch (err) {
      console.error(err);
      toast.error("❌ Falló la petición");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSeedModules} disabled={loading}>
      {loading ? "Cargando..." : "Ejecutar Seed de Módulos"}
    </Button>
  );
};
