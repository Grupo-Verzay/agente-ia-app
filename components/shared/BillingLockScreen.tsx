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
  } = props;

  return (
    <main className="min-h-screen w-full flex justify-center items-center bg-background p-6 md:p-10">
      {/* Una cuenta recién creada que viene a comprar no está "suspendida por
          seguridad": está esperando su primer pago. Darle el texto de moroso
          sería recibir a un cliente nuevo tratándolo de deudor. */}
      <section className={`mx-auto max-w-3xl rounded-xl border p-6 md:p-8 ${awaitingFirstPayment
        ? "border-primary/40 bg-primary/5"
        : "border-destructive/40 bg-destructive/10"}`}>
        <h1 className={`text-2xl font-semibold ${awaitingFirstPayment ? "" : "text-destructive"}`}>
          {awaitingFirstPayment ? "Activa tu plan" : "Acceso suspendido por facturacion"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {awaitingFirstPayment
            ? "Tu cuenta ya está creada. Falta el pago para activar los 30 días de servicio."
            : "Tu acceso ha sido bloqueado por seguridad. Debes regularizar el pago para volver a usar la plataforma."}
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
          <p>
            <b>Estado:</b> {reasonLabel}
          </p>
          {amountDue ? (
            <p>
              <b>Saldo pendiente:</b> {amountDue} {currencyCode ?? "COP"}
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
          {awaitingFirstPayment
            ? "En cuanto se confirme el pago, la cuenta se activa sola."
            : "Este bloqueo no se puede cerrar. Si ya pagaste, contacta soporte para validacion."}
        </p>

        {/* Sin precio configurado —la cuenta que venía de la prueba gratis— no
            hay contra qué generar un enlace, así que primero elige plan. Antes
            esa cuenta se quedaba bloqueada sin ninguna forma de pagarse sola. */}
        <div className="mt-6">
          {canPayOnline ? (
            <BillingPayButton label={awaitingFirstPayment ? "Pagar y activar" : "Pagar y reactivar"} />
          ) : (
            <ChoosePlanToPay />
          )}
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

