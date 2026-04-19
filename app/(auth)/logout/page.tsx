"use client";

import { useEffect } from "react";
import { LogOut, ShieldCheck, Loader2 } from "lucide-react";
import { handleLogout } from "@/lib/handleLogout";

export default function LogoutPage() {
  useEffect(() => {
    handleLogout();
  }, []);

  return (
    <main className="relative h-[100vh] w-[100vw] overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/25 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <LogOut className="h-8 w-8 text-cyan-300" />
          </div>

          <h1 className="text-center text-2xl font-bold tracking-tight">Cerrando sesión</h1>
          <p className="mt-2 text-center text-sm text-slate-300">
            Estamos cerrando tu sesión de forma segura y limpiando los datos locales.
          </p>

          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              <p className="text-sm text-slate-200">Procesando cierre de sesión...</p>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <p className="text-sm text-emerald-100">Redirigiendo al login.</p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Si no ocurre redirección automática, recarga la página.
          </p>
        </section>
      </div>
    </main>
  );
}

