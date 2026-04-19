import Link from "next/link";

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
  } = props;

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
          Este bloqueo no se puede cerrar. Si ya pagaste, contacta soporte para validacion.
        </p>

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

