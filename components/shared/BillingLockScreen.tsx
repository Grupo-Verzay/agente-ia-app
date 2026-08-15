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
  /** WhatsApp de su marca. Sin él no se pinta el botón. */
  brandWhatsapp?: string | null;
};

/** Fecha larga en español. `2026-08-09` cuesta más de leer que "09 de agosto". */
function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Los dos botones de las pantallas de cobro.
 *
 * Pagar a la derecha, que es donde termina la lectura. WhatsApp a la izquierda
 * y en tono suave: es la salida para quien tiene una duda o ya pagó y quiere
 * avisar, no una alternativa a pagar — si los dos pesan igual, una parte se va
 * a escribir en vez de pagar.
 */
function AccionesDePago({
  whatsapp,
  canPayOnline,
  payLabel,
}: {
  whatsapp?: string | null;
  canPayOnline?: boolean;
  payLabel: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md border border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400"
        >
          Hablar por WhatsApp
        </a>
      ) : (
        <span />
      )}
      {canPayOnline ? <BillingPayButton label={payLabel} /> : null}
    </div>
  );
}

/**
 * Salir de la cuenta.
 *
 * Va como texto pequeño al pie, no como botón: no es lo que queremos que haga,
 * pero tiene que existir. Sin ella, quien entró con la cuenta equivocada se
 * queda encerrado en el bloqueo sin poder ni volver al login.
 */
function SalirDeLaCuenta() {
  return (
    <p className="mt-5 border-t border-border pt-4 text-center text-xs text-muted-foreground">
      <Link href="/logout" className="underline hover:text-foreground">
        Cerrar sesión
      </Link>{" "}
      · entrar con otra cuenta
    </p>
  );
}

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
    brandWhatsapp,
  } = props;

  const moneda = currencyCode ?? "COP";

  /**
   * El importe: lo que se le cobra, y nada más.
   *
   * Llevaba encima el equivalente en dólares, pero ese número no estaba guardado
   * en ninguna parte: salía de dividir los pesos por la tasa. Al bajar la tasa,
   * un cliente que compró por 59 USD veía "63 USD/mes" sobre el mismo importe de
   * siempre, y en la pantalla de pagar eso no se lee como un redondeo: se lee
   * como que le subieron el precio.
   */
  const Importe = () =>
    !amountDue ? null : (
      <div className="tabular-nums">
        <p className="text-2xl font-bold tracking-tight">
          {amountDue} {moneda}/mes
        </p>
      </div>
    );

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

          {amountDue ? (
            <div className="mt-6 border-t border-border pt-5">
              <Importe />
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                El cobro se hace en <b>pesos colombianos</b>. En cuanto se confirme el pago, tu
                cuenta se dará de alta automáticamente.
              </p>
            </div>
          ) : null}

          <AccionesDePago
            whatsapp={brandWhatsapp}
            canPayOnline={canPayOnline}
            payLabel="Realizar pago"
          />

          {/* Sin precio asignado no hay contra qué generar el enlace: primero
              elige plan. Le pasa a quien viene de la prueba gratis. */}
          {!canPayOnline ? (
            <div className="mt-6">
              <ChoosePlanToPay whatsapp={brandWhatsapp} />
            </div>
          ) : null}

          <SalirDeLaCuenta />
        </section>
      </main>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
     Se le venció la licencia.

     Antes esto era un bloque rojo titulado "Acceso suspendido por facturación"
     que empezaba diciéndole que había sido "bloqueado por seguridad". A quien
     solo se le venció la licencia eso le suena a que hizo algo malo, y encima
     abría con el problema en vez de con la salida.

     Fuera también lo que no le sirve para decidir: el medio de pago, la URL de
     pago —que era fija y apuntaba a Verzay aunque la cuenta fuera de otra
     marca— y el aviso de que el bloqueo no se puede cerrar, que no aporta nada
     a quien ya está viéndolo.
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <main className="min-h-screen w-full flex justify-center items-center bg-background p-6 md:p-10">
      <section className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card p-6 md:p-8">
        <h1 className="text-xl font-semibold tracking-tight">Tu licencia venció</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El servicio está en pausa. Se reactiva solo en cuanto se confirme el pago.
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
          {dueDateIso ? (
            <p>
              <b>Venció el:</b> {fechaLarga(dueDateIso)}
            </p>
          ) : null}
          {/* El motivo solo se nombra cuando NO es el vencimiento normal —una
              suspensión manual, por ejemplo—: repetir "servicio vencido" bajo un
              título que ya lo dice es ruido. */}
          {reasonLabel && !/vencid/i.test(reasonLabel) ? (
            <p>
              <b>Estado:</b> {reasonLabel}
            </p>
          ) : null}
        </div>

        {amountDue ? (
          <div className="mt-6 border-t border-border pt-5">
            <Importe />
            <p className="mt-1.5 text-sm text-muted-foreground">
              El cobro se hace en <b>pesos colombianos</b>.
            </p>
          </div>
        ) : null}

        {canPayOnline ? (
          <AccionesDePago
            whatsapp={brandWhatsapp}
            canPayOnline
            payLabel="Pagar y reactivar"
          />
        ) : (
          <div className="mt-6">
            <ChoosePlanToPay whatsapp={brandWhatsapp} />
          </div>
        )}

        <SalirDeLaCuenta />
      </section>
    </main>
  );
}
