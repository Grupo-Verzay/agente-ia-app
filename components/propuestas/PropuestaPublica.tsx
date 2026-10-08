import { CalendarClock, CalendarDays, CreditCard, FileText, Package, PlayCircle, RefreshCw, ScrollText, StickyNote } from "lucide-react";

import { PlanEnLaPropuesta } from "@/components/propuestas/PlanEnLaPropuesta";
import { ANCHO_DE_LA_LANDING } from "@/lib/ancho-de-la-landing";
import { PieDeLasPublicas } from "@/components/shared/PieDeLasPublicas";
import { AIRE_ENCIMA_DEL_PIE, elTextoDePreparadaPor } from "@/lib/pie-de-las-publicas";
import {
    losPlanesDeCadaServicio,
    losPlanesQueSeEnsenan,
    type PlanDeLaPropuesta,
} from "@/lib/plan-de-la-propuesta";

import {
    comoSeLeeElImporte,
    comoSeLeeLaFecha,
    elTotal,
    lasIniciales,
    losRotulosDeItems,
    type PropuestaPublica as Datos,
} from "@/lib/propuestas";

/**
 * Cómo se ve una propuesta comercial por dentro, para el cliente.
 *
 * **Mobile-first**: se pinta primero para un teléfono de 360 px —que es desde
 * donde se abre, por WhatsApp— y de `sm` para arriba solo gana aire y una
 * columna más ancha. Nada de tablas: una tabla de servicios con alcance e
 * inversión en un teléfono se lee desplazándose a lo ancho, y un cliente no
 * hace eso. Cada servicio es una tarjeta, con la inversión a la vista.
 *
 * **El azul es el de la plataforma, claro** (`blue-500` → `blue-400`): el
 * `slate-900` de antes se leía como un azul casi negro y apagado que no casaba
 * con ningún logo. Vive en `AZUL_DE_LA_PROPUESTA` para que la tarjeta y las
 * iniciales no puedan salir de dos azules distintos.
 *
 * **Sigue el modo claro u oscuro del DISPOSITIVO** (`data-tema-del-plan=
 * "dispositivo"` y los tokens `--plan-*` de `globals.css`): en claro, el azul
 * cielo de siempre; en oscuro, la paleta de la landing de planes con la tarjeta
 * en un azul más hondo (sigue siendo la tarjeta azul). Por eso aquí
 * no hay ni un `slate-*` ni un `bg-white` de fondo: un color escrito a mano no
 * cambia con el dispositivo.
 *
 * **El logo y el eslogan van DENTRO de la tarjeta azul**: el logo arriba, a la
 * altura de «Preparada para», y el eslogan abajo, a la altura de «Inversión
 * total». Sueltos encima se leían como de otra página.
 *
 * **Un servicio que es un plan del panel enseña el plan**, no un alcance
 * escrito a mano: su video, sus recuadros, «Qué incluye» y el precio con su
 * botón (`PlanEnLaPropuesta`), emparejados por el NOMBRE
 * (`losPlanesDeCadaServicio`). Lo que no empareja sale después de los
 * servicios, con el mismo bloque.
 *
 * Sin `"use client"`: no hay nada que hacer en el navegador, así que se pinta
 * entera en el servidor y llega como HTML — que es lo que carga rápido con la
 * conexión de un móvil.
 */
export const AZUL_DE_LA_PROPUESTA = "bg-gradient-to-br from-[color:var(--plan-hero-desde)] to-[color:var(--plan-hero-hasta)]";

/**
 * La letra del eslogan de la cabecera. Iba en `text-sm` (14 px), por debajo de
 * los títulos de sección (16) y del texto de cada servicio: se leía como una
 * nota al pie. Sube con la pantalla: 16 px en el teléfono (con 70 % del ancho
 * no puede ser más sin partirse en tres líneas), 18 en tableta y 20 en
 * escritorio. Clases literales: Tailwind solo genera lo que ve escrito.
 */
export const ESLOGAN_DE_LA_PROPUESTA = "text-base leading-snug sm:text-lg lg:text-xl";

/**
 * El ancho del contenedor es el de la landing de planes (`ANCHO_DE_LA_LANDING`,
 * hasta 1152 px): así las tarjetas de capacidad de un plan se ven igual de
 * holgadas aquí que en su página. Una sola fuente para el ancho.
 */
export const ANCHO_DE_LA_PROPUESTA = ANCHO_DE_LA_LANDING;

/**
 * El tope de un párrafo largo (alcance, notas, condiciones, pago). Con el
 * contenedor ancho, un texto de 14 px pasaría de 140 caracteres por línea y
 * se leería mal: se topa en ~100 (`max-w-3xl`). Los títulos, importes y
 * tarjetas sí ocupan el ancho entero.
 */
export const TOPE_DE_LECTURA = "max-w-3xl";

export function PropuestaPublica({ propuesta, planes = [] }: { propuesta: Datos; planes?: readonly PlanDeLaPropuesta[] }) {
    const total = elTotal(propuesta.servicios);
    const planesQueSeVen = losPlanesQueSeEnsenan(planes);
    const { porServicio, sueltos } = losPlanesDeCadaServicio(propuesta.servicios, planesQueSeVen);
    const { negocio } = propuesta;
    const conMantenimiento = propuesta.mantenimientoMensual !== null;
    const rotulos = losRotulosDeItems(propuesta.tipoDeItems);
    const conPago = Boolean(propuesta.metodoPago || propuesta.medioPago);

    const logo = negocio.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            data-logo-propuesta
            src={negocio.logo}
            alt={negocio.nombre || "Logo"}
            className="h-12 w-12 shrink-0 rounded-xl border border-white/30 bg-white object-contain"
        />
    ) : (
        <div
            data-logo-propuesta
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-base font-semibold text-white"
        >
            {lasIniciales(negocio.nombre)}
        </div>
    );

    return (
        <article
            data-propuesta
            data-tema-del-plan="dispositivo"
            className={`w-full ${ANCHO_DE_LA_PROPUESTA} pt-6 text-plan-tinta sm:pt-10`}
        >
            {/* La tarjeta azul lleva la cabecera DENTRO: arriba, «Preparada
                para» a la izquierda y el logo a la derecha, a la misma altura;
                abajo, «Inversión total» a la izquierda y el eslogan a la
                derecha. Ni el nombre de la cuenta (el logo lo dice, y sale en
                el pie) ni el rótulo «Propuesta comercial». */}
            <section data-hero className={`rounded-2xl p-5 text-white shadow-sm sm:p-7 ${AZUL_DE_LA_PROPUESTA}`}>
                <div data-hero-arriba className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p data-preparada-para className="text-xs uppercase tracking-wide text-white/80">Preparada para</p>
                        <h1 data-cliente className="mt-1 break-words text-2xl font-bold leading-tight sm:text-3xl">
                            {propuesta.cliente}
                        </h1>
                        {propuesta.empresa ? (
                            <p data-empresa className="mt-1 break-words text-base font-medium text-white/90">
                                {propuesta.empresa}
                            </p>
                        ) : null}
                    </div>
                    {logo}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-white/80">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    {comoSeLeeLaFecha(propuesta.fecha)}
                </p>
                {propuesta.vigencia ? (
                    <p data-vigencia className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
                        <CalendarClock className="h-4 w-4 shrink-0" />
                        Válida hasta el {comoSeLeeLaFecha(propuesta.vigencia)}
                    </p>
                ) : null}
                <div data-hero-abajo className="mt-5 flex items-end justify-between gap-4 border-t border-white/25 pt-4">
                    <div className="min-w-0">
                        <p data-inversion-total className="text-xs uppercase tracking-wide text-white/80">Inversión total</p>
                        <p data-total className="mt-1 break-words text-3xl font-bold sm:text-4xl">
                            {comoSeLeeElImporte(total, propuesta.moneda)}
                        </p>
                        {conMantenimiento ? (
                            <p className="mt-1 text-sm text-white/80">
                                + {comoSeLeeElImporte(propuesta.mantenimientoMensual!, propuesta.moneda)} / mes de mantenimiento
                            </p>
                        ) : null}
                    </div>
                    {negocio.eslogan ? (
                        <p
                            data-eslogan
                            className={`min-w-0 max-w-[55%] break-words text-right font-bold text-white ${ESLOGAN_DE_LA_PROPUESTA}`}
                        >
                            {negocio.eslogan}
                        </p>
                    ) : null}
                </div>
            </section>

            {/* Servicios o productos: lo eligió quien creó la propuesta. Sin
                título encima de la lista: cada tarjeta lo dice delante de su
                nombre («Servicios: Plan Business»), así se lee sola. */}
            <section data-items className="mt-8">
                <ol className="space-y-3">
                    {propuesta.servicios.map((s, i) => {
                        const plan = porServicio[i];
                        return (
                            <li
                                key={i}
                                data-servicio
                                data-servicio-con-plan={plan ? plan.llave : undefined}
                                className="rounded-2xl border border-plan-borde bg-plan-superficie p-4 shadow-sm sm:p-5"
                            >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                    <h3
                                        data-titulo-del-item
                                        className="flex min-w-0 items-start gap-2 break-words text-base font-semibold text-plan-tinta"
                                    >
                                        {propuesta.tipoDeItems === "productos" ? (
                                            <Package className="mt-1 h-4 w-4 shrink-0 text-plan-suave" />
                                        ) : (
                                            <FileText className="mt-1 h-4 w-4 shrink-0 text-plan-suave" />
                                        )}
                                        <span className="min-w-0">
                                            <span data-rotulo-del-item className="text-plan-tenue">
                                                {rotulos.plural}:
                                            </span>{" "}
                                            {s.nombre}
                                        </span>
                                    </h3>
                                    {/* Con un plan que trae su precio, el importe va UNA vez, junto
                                        a su botón «Comenzar con el plan»: aquí sería repetirlo. */}
                                    {plan?.precio ? null : (
                                        <p data-precio-del-servicio className="shrink-0 text-base font-semibold text-plan-tinta sm:text-right">
                                            {comoSeLeeElImporte(s.inversion, propuesta.moneda)}
                                        </p>
                                    )}
                                </div>
                                {plan ? (
                                    // Es un plan del panel: se enseña el plan, no un alcance copiado a mano.
                                    <div className="mt-5">
                                        <PlanEnLaPropuesta plan={plan} />
                                    </div>
                                ) : s.alcance ? (
                                    <div className="mt-2">
                                        <p className="text-xs font-medium uppercase tracking-wide text-plan-tenue">Alcance</p>
                                        <p data-lectura className={`mt-1 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-plan-suave`}>
                                            {s.alcance}
                                        </p>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ol>
                {/* Sin «Total» abajo: el total va UNA vez, en «Inversión total» de arriba. */}
            </section>

            {/* Un plan que la propuesta lleva y que no es ninguno de sus
                servicios (otro nombre, o se renombró después): sale aquí, con
                el mismo bloque y dentro de la misma propuesta. */}
            {sueltos.length > 0 ? (
                <section data-planes-de-la-propuesta className="mt-8 rounded-2xl border border-plan-borde bg-plan-superficie p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-plan-tinta">
                        <PlayCircle className="h-4 w-4 text-plan-suave" />
                        {sueltos.length === 1 ? "Conoce el plan" : "Conoce los planes"}
                    </h2>
                    <div className="mt-4 space-y-10">
                        {sueltos.map((plan) => (
                            <div key={plan.llave} data-plan-de-la-propuesta={plan.llave} className="space-y-4">
                                <p className="break-words text-base font-semibold text-plan-tinta">{plan.nombre}</p>
                                <PlanEnLaPropuesta plan={plan} />
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {conMantenimiento ? (
                <section data-mantenimiento className="mt-8 rounded-2xl border border-plan-borde bg-plan-superficie p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-plan-tinta">
                        <RefreshCw className="h-4 w-4 text-plan-suave" />
                        Mantenimiento mensual
                    </h2>
                    <p className="mt-2 text-xl font-bold text-plan-tinta">
                        {propuesta.mantenimientoMensual === 0
                            ? "Incluido"
                            : `${comoSeLeeElImporte(propuesta.mantenimientoMensual!, propuesta.moneda)} / mes`}
                    </p>
                    {propuesta.mantenimientoDescripcion ? (
                        <p data-lectura className={`mt-2 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-plan-suave`}>
                            {propuesta.mantenimientoDescripcion}
                        </p>
                    ) : null}
                </section>
            ) : null}

            {propuesta.nota ? (
                <section data-nota className="mt-8 rounded-2xl border border-plan-borde bg-plan-superficie p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-plan-tinta">
                        <StickyNote className="h-4 w-4 text-plan-suave" />
                        Nota
                    </h2>
                    <p data-lectura className={`mt-2 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-plan-suave`}>
                        {propuesta.nota}
                    </p>
                </section>
            ) : null}

            {propuesta.condiciones ? (
                <section data-condiciones className="mt-8 rounded-2xl border border-plan-borde bg-plan-superficie p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-plan-tinta">
                        <ScrollText className="h-4 w-4 text-plan-suave" />
                        Condiciones
                    </h2>
                    <p data-lectura className={`mt-2 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-plan-suave`}>
                        {propuesta.condiciones}
                    </p>
                </section>
            ) : null}

            {/* Cómo pagar: después de las condiciones y antes del pie. Sin días
                de licencia ni vencimientos — el cliente todavía no contrató. */}
            {conPago ? (
                <section data-pago className="mt-8 rounded-2xl border border-plan-borde bg-plan-superficie p-4 shadow-sm sm:p-5">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-plan-tinta">
                        <CreditCard className="h-4 w-4 text-plan-suave" />
                        Información de pago
                    </h2>
                    <dl className="mt-2 space-y-3">
                        {propuesta.metodoPago ? (
                            <div data-metodo-pago>
                                <dt className="text-xs font-medium uppercase tracking-wide text-plan-tenue">Método de pago</dt>
                                <dd className="mt-1 break-words text-sm leading-relaxed text-plan-medio">{propuesta.metodoPago}</dd>
                            </div>
                        ) : null}
                        {propuesta.medioPago ? (
                            <div data-medio-pago>
                                <dt className="text-xs font-medium uppercase tracking-wide text-plan-tenue">Medio de pago</dt>
                                <dd data-lectura className={`mt-1 ${TOPE_DE_LECTURA} whitespace-pre-wrap break-words text-sm leading-relaxed text-plan-medio`}>
                                    {propuesta.medioPago}
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                </section>
            ) : null}

            {/* El pie de las tres públicas, DENTRO del `article`: la raya mide lo
                que el contenido, y encima deja el mismo aire que hay entre dos
                bloques (`mt-8`). Con la línea de quién la preparó encima de los
                derechos. */}
            <PieDeLasPublicas
                tema="propuesta"
                aire={AIRE_ENCIMA_DEL_PIE.propuesta}
                preparadaPor={elTextoDePreparadaPor(negocio.nombre)}
            />
        </article>
    );
}
