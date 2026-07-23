"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getActivationChecklist, type ActivationChecklist as Status } from "@/actions/activation-actions";

/**
 * Checklist de puesta en marcha (Inicio). Muestra los 3 pasos para dejar el
 * Agente IA respondiendo en WhatsApp, con su estado real, y un botón que lleva
 * a la acción de cada uno. Se oculta solo cuando el agente ya está EN VIVO.
 */

type StepState = "done" | "todo" | "blocked";

function Dot({ state, n }: { state: StepState; n: number }) {
  if (state === "done") {
    return (
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-emerald-500 text-sm font-bold text-white">
        ✓
      </span>
    );
  }
  return (
    <span
      className={`grid h-7 w-7 flex-none place-items-center rounded-full border-2 text-xs font-bold tabular-nums ${
        state === "blocked"
          ? "border-zinc-300 text-zinc-400 dark:border-zinc-700"
          : "border-blue-500 text-blue-600 dark:text-blue-400"
      }`}
    >
      {n}
    </span>
  );
}

function Row({
  n,
  state,
  title,
  desc,
  action,
}: {
  n: number;
  state: StepState;
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Dot state={state} n={n} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{desc}</p>
      </div>
      <div className="flex-none">{state === "done" ? <span className="text-xs font-semibold text-emerald-600">Listo</span> : action}</div>
    </div>
  );
}

const primaryBtn =
  "inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700";
const ghostBtn =
  "inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300";

export function ActivationChecklist() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await getActivationChecklist();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Al volver de /connection o del asistente, refresca el estado.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const openWizard = () => window.dispatchEvent(new Event("agent-onboarding:open"));

  // Loading skeleton (breve).
  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-4 space-y-2">
          <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
      </div>
    );
  }

  // No aplica (admin/asesor/reseller) → no mostrar nada.
  if (!status || !status.applicable) return null;

  const { agentConfigured, provisioned, whatsappConnected, botEnabled, live } = status;
  const doneCount = [agentConfigured, whatsappConnected, botEnabled].filter(Boolean).length;

  // EN VIVO → banner compacto de éxito (sin ocupar espacio con el checklist).
  if (live) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-emerald-500 text-lg text-white">🟢</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Tu Agente IA está EN VIVO</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Está conectado y respondiendo en WhatsApp automáticamente.
          </p>
        </div>
        <Link href="/connection" className={ghostBtn}>
          Administrar
        </Link>
      </div>
    );
  }

  const configState: StepState = agentConfigured ? "done" : "todo";
  const connState: StepState = whatsappConnected ? "done" : provisioned ? "todo" : "blocked";
  const botState: StepState = botEnabled ? "done" : whatsappConnected ? "todo" : "blocked";

  return (
    <section className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm dark:border-blue-900/50 dark:from-blue-950/30 dark:to-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            🚀 Pon en marcha tu Agente IA
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {doneCount} de 3 pasos · termínalos y tu agente empezará a responder en WhatsApp.
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-blue-600/10 px-2.5 py-1 text-xs font-bold text-blue-700 sm:inline dark:text-blue-300">
          {doneCount}/3
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950/60">
        <span
          className="block h-full rounded-full bg-blue-600 transition-all duration-500"
          style={{ width: `${(doneCount / 3) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        <Row
          n={1}
          state={configState}
          title="Configura tu agente"
          desc="Negocio y objetivo (qué debe hacer)."
          action={
            <button type="button" onClick={openWizard} className={primaryBtn}>
              Configurar
            </button>
          }
        />
        <Row
          n={2}
          state={connState}
          title="Conecta tu WhatsApp"
          desc={
            provisioned
              ? "Escanea el código QR con tu teléfono."
              : "Falta habilitar tu conexión — contacta al administrador."
          }
          action={
            provisioned ? (
              <Link href="/connection" className={primaryBtn}>
                Conectar
              </Link>
            ) : (
              <Link href="/connection" className={ghostBtn}>
                Ver
              </Link>
            )
          }
        />
        <Row
          n={3}
          state={botState}
          title="Enciende el agente"
          desc="Actívalo para que responda automáticamente."
          action={
            <Link href="/connection" className={whatsappConnected ? primaryBtn : ghostBtn}>
              {whatsappConnected ? "Activar" : "Ir"}
            </Link>
          }
        />
      </div>

      {agentConfigured && (
        <div className="mt-3 text-right">
          <Link href="/ia" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            Editar mi agente →
          </Link>
        </div>
      )}
    </section>
  );
}
