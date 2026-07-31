import Link from "next/link";

import BillingPayButton from "./BillingPayButton";
import ChoosePlanToPay from "./ChoosePlanToPay";

type Props = {
  clientName: string;
  company?: string | null;
  amountDue?: string | null;
  currencyCode?: string | null;
  dueDateIso?: string | null;
  paymentMethodLabel?: string | null;
  paymentNotes?: string | null;
  paymentUrl?: string | null;
  reasonLabel: string;
  /** Cuenta recién creada que todavía no ha pagado nunca. */
  awaitingFirstPayment?: boolean;
  /** Hay precio configurado, así que se puede generar el enlace de pago. */
  canPayOnline?: boolean;
  /** Nombre comercial del plan, con el que lo llama su marca. */
  planLabel?: string | null;
  /** Los mismos pesos en dólares, la referencia con la que vio el precio. */
  amountUsd?: number | null;
};

export default function BillingLockScreen(props: Props) {
  const {
    clientName,
    company,
    amountDue,
    currencyCode,
    dueDateIso,
    paymentMethodLabel,
    paymentUrl,
    reasonLabel,
    awaitingFirstPayment,
    canPayOnline,
    planLabel,
    amountUsd,
  } = props;

  const moneda = currencyCode ?? "COP";
  const importe = amountDue
    ? `${amountDue} ${moneda}${amountUsd ? ` - ${amountUsd} USD` : ""}`
    : null;

  /* ─────────────────────────────────────────────────────────────────────────
     Cuenta nueva pendiente de su primer pago.

     Es una pantalla distinta, no la misma con otro texto: aquí no hay deuda ni
     servicio caído, hay una compra a medias. Fuera el título de bloqueo, el
     medio de pago, la URL fija y la fecha de vencimiento —que es hoy, porque la
     cuenta nace vencida, y le diría que se le venció algo que nunca tuvo—.
     Queda lo que necesita para decidir: qué compra, cuánto cuesta y el botón.
  ───────────────────────────────────────────────────────────────────────── */
  if (awaitingFirstPayment) {
    return (
      <main className="min-h-screen w-full flex justify-center items-center bg-background p-6 md:p-10">
        <section className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card p-6 md:p-8">
          <div className="grid gap-2 text-sm">
            <p><b>Cliente:</b> {clientName}</p>
            {company ? <p><b>Empresa:</b> {company}</p> : null}
            {planLabel ? <p><b>Plan:</b> {planLabel}</p> : null}
            <p className="flex items-center gap-2">
              <b>Estado:</b>
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold leading-none text-amber-600 dark:text-amber-400">
                Pendiente de pago
              </span>
            </p>
          </div>

          {importe ? (
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-2xl font-bold tracking-tight tabular-nums">
                Total a pagar: {importe}
              </p>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                Al operar desde <b>Colombia</b>, cobramos en <b>pesos</b>. En cuanto se confirme el
                pago, tu cuenta se dará de alta automáticamente.
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/logout"
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cerrar sesión
            </Link>
            {canPayOnline ? <BillingPayButton label="Realizar pago" /> : null}
          </div>

          {/* Sin precio asignado no hay contra qué generar el enlace: primero
              elige plan. Le pasa a quien viene de la prueba gratis. */}
          {!canPayOnline ? (
            <div className="mt-6">
              <ChoosePlanToPay />
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full flex justify-center items-center bg-background p-6 md:p-10">
      <section className="mx-auto max-w-3xl rounded-xl border border-destructive/40 bg-destructive/10 p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-destructive">
          Acceso suspendido por facturacion
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu acceso ha sido bloqueado por seguridad. Debes regularizar el pago para volver a usar la plataforma.
        </p>

        <div className="mt-6 grid gap-2 text-sm">
          <p>
            <b>Cliente:</b> {clientName}
          </p>
          {company ? (
            <p>
              <b>Empresa:</b> {company}
            </p>
          ) : null}
          {planLabel ? (
            <p>
              <b>Plan:</b> {planLabel}
            </p>
          ) : null}
          <p>
            <b>Estado:</b> {reasonLabel}
          </p>
          {importe ? (
            <p>
              <b>Saldo pendiente:</b> {importe}
            </p>
          ) : null}
          {dueDateIso ? (
            <p>
              <b>Fecha de vencimiento:</b> {dueDateIso.slice(0, 10)}
            </p>
          ) : null}
          {paymentMethodLabel ? (
            <p>
              <b>Medio de pago:</b> {paymentMethodLabel}
            </p>
          ) : null}
          {paymentUrl ? (
            <p>
              <b>URL de pago:</b>{" "}
              <a className="underline text-primary" href={paymentUrl} target="_blank" rel="noreferrer">
                {paymentUrl}
              </a>
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Este bloqueo no se puede cerrar. Si ya pagaste, contacta soporte para validacion.
        </p>

        <div className="mt-6">
          {canPayOnline ? <BillingPayButton label="Pagar y reactivar" /> : <ChoosePlanToPay />}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/logout"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Salir e iniciar con otra cuenta
          </Link>
          <p className="text-xs text-muted-foreground">
            Esta opcion cierra la sesion actual y te envia al login.
          </p>
        </div>
      </section>
    </main>
  );
}
