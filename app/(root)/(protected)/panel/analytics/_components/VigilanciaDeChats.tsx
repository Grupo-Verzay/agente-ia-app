import { Activity, AlertTriangle, CheckCircle2, EyeOff } from "lucide-react";
import { UNA_CARGA_MALA_MS } from "@/lib/vigilancia-de-chats";
import {
  DIAS_QUE_SE_MIRAN,
  resumirLaVigilancia,
  type VistaDeLaVigilancia,
} from "@/lib/vigilancia-vista";

/**
 * Cuanto tarda Chats en verse, por cuenta, en los ultimos 30 dias.
 *
 * Va **arriba del todo de Analiticas**, lo primero que se ve: es el bloque que
 * avisa de que algo se degrado, y un aviso al que hay que bajar no avisa.
 *
 * La puerta NO esta aqui. `leerLaVigilancia` devuelve `null` a quien no sea
 * superadministrador, asi que este componente ni se pinta; enseñar el bloque es
 * cosa de la pantalla, **que los datos salgan es cosa de la consulta**.
 */
export function VigilanciaDeChats({ vista }: { vista: VistaDeLaVigilancia }) {
  const resumen = resumirLaVigilancia(
    vista.dias,
    UNA_CARGA_MALA_MS,
    vista.señaladasPorElVeredicto,
  );
  const hayAlgo = resumen.señaladas.length > 0;
  const sinDatos = resumen.cuentas === 0;

  return (
    <section className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <Activity className="h-[21px] w-[21px] shrink-0 text-muted-foreground" />
        <h2 className="text-[19px] font-semibold">Rendimiento de Chats</h2>
        <span className="text-xs text-muted-foreground">
          últimos {DIAS_QUE_SE_MIRAN} días · interno
        </span>
      </header>

      {/* El estado, en una frase. Es lo unico que se mira el 95% de las veces. */}
      <Estado sinDatos={sinDatos} hayAlgo={hayAlgo} hayDeHoy={vista.hayDeHoy} resumen={resumen} />

      {hayAlgo && (
        <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Cuenta</th>
                <th className="py-2 pr-3 font-medium">Día típico</th>
                <th className="py-2 pr-3 font-medium">Peor</th>
                <th className="py-2 pr-3 font-medium">Cargas</th>
                <th className="py-2 font-medium">Malas</th>
              </tr>
            </thead>
            <tbody>
              {resumen.señaladas.map((c) => (
                <tr key={c.userId} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <span className="block max-w-[14rem] truncate" title={c.nombre}>
                      {c.nombre}
                    </span>
                    {/* La misma marca que salio por WhatsApp: si llegó un aviso,
                        esta es la fila que hay que mirar. */}
                    {c.laSeñaloElAviso && (
                      <span className="text-xs text-destructive">avisada</span>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-3 tabular-nums ${
                      c.tipicoMs > UNA_CARGA_MALA_MS ? "font-semibold text-destructive" : ""
                    }`}
                  >
                    {enSegundos(c.tipicoMs)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                    {enSegundos(c.peorMs)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">{c.cargas}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">
                    {c.malas}
                    {c.diasConMalas > 1 && (
                      <span className="ml-1 text-xs">({c.diasConMalas} días)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            «Mala» es una carga que pasó de {enSegundos(UNA_CARGA_MALA_MS)}. El día típico es la
            mediana, no la media: un día suelto malo no puede teñir el resto.
          </p>
        </div>
      )}
    </section>
  );
}

function Estado({
  sinDatos,
  hayAlgo,
  hayDeHoy,
  resumen,
}: {
  sinDatos: boolean;
  hayAlgo: boolean;
  hayDeHoy: boolean;
  resumen: ReturnType<typeof resumirLaVigilancia>;
}) {
  // Sin una sola fila no se puede decir "va bien": puede ser que nadie haya
  // abierto Chats, o que la vigilancia no escriba. Decir "todo bien" aqui seria
  // justo el fallo mudo que esto viene a evitar.
  if (sinDatos) {
    return (
      <Fila
        icono={<EyeOff className="h-5 w-5 shrink-0 text-amber-600" />}
        titulo="Sin datos todavía"
        detalle="No hay ni una carga anotada. O nadie ha abierto Chats, o la vigilancia no está escribiendo."
      />
    );
  }

  if (hayAlgo) {
    return (
      <Fila
        icono={<AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />}
        titulo={`${resumen.señaladas.length} ${
          resumen.señaladas.length === 1 ? "cuenta" : "cuentas"
        } con cargas lentas`}
        detalle={`De ${resumen.cuentas} cuentas y ${resumen.cargas.toLocaleString("es")} cargas. El día típico de la plataforma es ${enSegundos(resumen.tipicoMs)}.`}
      />
    );
  }

  return (
    <Fila
      icono={<CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
      titulo="Ninguna cuenta se salió"
      detalle={`${resumen.cuentas} cuentas, ${resumen.cargas.toLocaleString("es")} cargas, día típico ${enSegundos(resumen.tipicoMs)}.${
        hayDeHoy ? "" : " Hoy todavía no hay ninguna carga anotada."
      }`}
    />
  );
}

function Fila({
  icono,
  titulo,
  detalle,
}: {
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {icono}
      <div className="min-w-0">
        <p className="font-medium">{titulo}</p>
        <p className="text-sm text-muted-foreground">{detalle}</p>
      </div>
    </div>
  );
}

function enSegundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
