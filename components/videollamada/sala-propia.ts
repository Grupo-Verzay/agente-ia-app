"use client";

import { conectarElMotor, type ConexionDelMotor } from "@/components/videollamada/conexion-del-motor";
import { crearElLogoQueHabla, elContextoDeAudio, type LogoQueHabla } from "@/components/videollamada/logo-que-habla";
import { NOMBRE_DEL_AVATAR } from "@/lib/videollamada-ia";
import {
    elFinDelMotor,
    loQueDiceElMotor,
    loQueSeLeMandaAlMotor,
    type FraseDelMotor,
    type MensajeDeLaSala,
} from "@/lib/motor-de-verzay";
import {
    comoMensajeEntrePersonas,
    debeOfrecer,
    HUECOS_DE_LA_CONEXION,
    ID_DE_VERZY,
    laPista,
    LATIDO_DE_LA_SALA_MS,
    llevaElMotor,
    TIPO_DEL_HUECO,
    type HuecoDeLaConexion,
    type MensajeEntrePersonas,
    type ParticipanteDeLaSala,
    type SenalQueSale,
} from "@/lib/sala-propia";
import { esperarLosCandidatos } from "@/lib/webrtc-del-navegador";

/**
 * La SALA PROPIA (proveedor `verzay`): hace lo que `DailyIframe.createCallObject`
 * para `SalaDeLaVideollamada` —`join`, `participants`, `on`, `sendAppMessage`,
 * `setLocalAudio`, `startScreenShare`, `leave`, `destroy`— con los MISMOS
 * eventos y la MISMA forma de participantes. Así la sala de siempre (el
 * silencio, pedir un humano, el cierre, el reloj, la pantalla, la grabación)
 * funciona igual con Tavus que con el motor propio.
 *
 * Verzy es un participante más: su voz sale del motor (`conexion-del-motor`)
 * y su video es el logo que late con esa voz (`logo-que-habla`). Las reglas
 * puras están en `lib/sala-propia.ts` y `lib/motor-de-verzay.ts`.
 */

type Oyente = (ev: any) => void;

type Senalizar = (cuerpo: Record<string, unknown>) => Promise<{
    ok?: boolean;
    presentes?: Array<{ participanteId: string; nombre: string | null; datos: Record<string, unknown> }>;
    senales?: Array<{ de: string; tipo: string; cuerpo: string }>;
    ice?: RTCIceServer[];
}>;

export type OpcionesDeLaSalaPropia = {
    /** `c=<cita>&f=<firma>`: la puerta de las rutas de la videollamada. */
    consulta: string;
    esAsesor: boolean;
    /** Para el banco: cómo se conecta el motor y cómo se señaliza. */
    conectar?: typeof conectarElMotor;
    senalizar?: Senalizar;
};

/** Lo más que se espera el fin de una respuesta del motor antes de dar el turno por libre. */
export const TURNO_PERDIDO_MS = 20_000;

/** Cada cuánto se guarda la transcripción en el servidor mientras se habla. */
export const GUARDAR_LO_HABLADO_CADA_MS = 10_000;

type Par = {
    id: string;
    nombre: string | null;
    datos: Record<string, unknown>;
    pc: RTCPeerConnection;
    canal: RTCDataChannel | null;
    remotas: Partial<Record<HuecoDeLaConexion, MediaStreamTrack>>;
    estado: { audio: boolean; video: boolean; pantalla: boolean };
    ofrezco: boolean;
};

function nuevoId(): string {
    const c = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    return `p${c.replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
}

export class SalaPropia {
    private oyentes: Record<string, Oyente[]> = {};
    private readonly yo = nuevoId();
    private nombre: string | null = null;
    private marca: Record<string, unknown> = {};
    private conversacionId = "";
    private dentro = false;
    private saliendo = false;
    // Lo mío.
    private micro: MediaStreamTrack | null = null;
    private camara: MediaStreamTrack | null = null;
    private pantalla: MediaStreamTrack | null = null;
    private audioOn = true;
    private videoOn = true;
    // Verzy.
    private motor: ConexionDelMotor | null = null;
    private llevoElMotor = false;
    private vozDeVerzy: MediaStreamTrack | null = null;
    private logo: LogoQueHabla | null = null;
    private mezcla: { destino: MediaStreamAudioDestinationNode; fuentes: Map<string, MediaStreamAudioSourceNode> } | null = null;
    private respondiendo = false;
    private respondiendoDesde = 0;
    private pendientes: Record<string, unknown>[] = [];
    private frases: FraseDelMotor[] = [];
    private tokensSinMandar = 0;
    private guardadas = 0;
    // Las demás personas.
    private pares = new Map<string, Par>();
    private senalesQueSalen: SenalQueSale[] = [];
    private ice: RTCIceServer[] = [];
    private relojes: number[] = [];
    private latiendo = false;
    private guardarPronto: number | undefined;
    /** Órdenes de un asesor para Verzy que salieron antes de tener conexión con quien la lleva. */
    private ordenesPendientes: unknown[] = [];

    constructor(private readonly opciones: OpcionesDeLaSalaPropia) {}

    /* ── Lo que la sala usa de Daily ────────────────────────────────────── */

    on(ev: string, fn: Oyente) {
        (this.oyentes[ev] ??= []).push(fn);
        return this;
    }

    off(ev: string, fn: Oyente) {
        this.oyentes[ev] = (this.oyentes[ev] ?? []).filter((f) => f !== fn);
        return this;
    }

    private emitir(ev: string, datos: unknown = {}) {
        for (const f of this.oyentes[ev] ?? []) {
            try {
                f(datos);
            } catch (error) {
                console.warn("[sala-propia] un oyente de la sala falló", { ev, error });
            }
        }
    }

    participants(): Record<string, ParticipanteDeLaSala> {
        const todos: Record<string, ParticipanteDeLaSala> = {
            local: {
                local: true,
                session_id: this.yo,
                user_name: this.nombre ?? undefined,
                userData: this.marca,
                audio: !!this.micro && this.audioOn,
                video: !!this.camara && this.videoOn,
                tracks: {
                    audio: laPista(this.micro, this.audioOn),
                    video: laPista(this.camara, this.videoOn),
                    screenVideo: laPista(this.pantalla, true),
                },
            },
        };
        for (const p of this.pares.values()) {
            todos[p.id] = {
                local: false,
                session_id: p.id,
                user_name: p.nombre ?? undefined,
                userData: { ...(p.datos.humano ? { humano: true } : {}), ...(p.datos.asesor ? { asesor: true } : {}) },
                audio: p.estado.audio,
                video: p.estado.video,
                tracks: {
                    audio: laPista(p.remotas.microfono, p.estado.audio),
                    video: laPista(p.remotas.camara, p.estado.video),
                    screenVideo: laPista(p.remotas.pantalla, p.estado.pantalla),
                },
            };
        }
        if (this.vozDeVerzy && this.logo) {
            todos[ID_DE_VERZY] = {
                local: false,
                session_id: ID_DE_VERZY,
                user_name: NOMBRE_DEL_AVATAR,
                audio: true,
                video: true,
                tracks: { audio: laPista(this.vozDeVerzy, true), video: laPista(this.logo.pista, true) },
            };
        }
        return todos;
    }

    async join(input: { url: string; userName?: string; userData?: unknown }): Promise<void> {
        this.nombre = input.userName ?? null;
        this.marca = (input.userData && typeof input.userData === "object" ? input.userData : {}) as Record<string, unknown>;
        this.conversacionId = String(input.url ?? "").replace(/^verzay:/, "");
        await this.abrirMisMedios();
        // Un primer latido antes de encender el motor: si otra pestaña ya lo
        // lleva, esta no enciende un segundo Verzy.
        const primero = await this.latir().catch(() => null);
        this.llevoElMotor = llevaElMotor({ esAsesor: this.opciones.esAsesor, otros: primero?.presentes ?? [] });
        if (this.llevoElMotor) await this.encenderElMotor();
        this.dentro = true;
        this.emitir("joined-meeting", { participants: this.participants() });
        if (this.vozDeVerzy) this.emitir("participant-joined", { participant: this.participants()[ID_DE_VERZY] });
        this.relojes.push(window.setInterval(() => void this.latir().catch((e) => console.warn("[sala-propia] el latido falló", e)), LATIDO_DE_LA_SALA_MS));
        if (this.llevoElMotor) {
            this.relojes.push(window.setInterval(() => void this.guardarLoHablado(false), GUARDAR_LO_HABLADO_CADA_MS));
            window.addEventListener("pagehide", this.alIrse);
        }
    }

    sendAppMessage(mensaje: unknown, _a?: string) {
        if (this.llevoElMotor) {
            this.alMotor(mensaje);
            return;
        }
        // Un asesor: la orden va al navegador que lleva a Verzy. Si todavía no
        // hay conexión con él (recién entrado), espera: Daily tampoco las pierde.
        const hayMotor = [...this.pares.values()].some((p) => p.datos.motor === true && p.canal?.readyState === "open");
        if (!hayMotor) {
            if (this.ordenesPendientes.length < 50) this.ordenesPendientes.push(mensaje);
            return;
        }
        this.aLosPares({ t: "orden", m: mensaje }, (p) => p.datos.motor === true);
    }

    /** Las órdenes que esperaban salen en cuanto hay canal con quien lleva a Verzy. */
    private soltarLasOrdenes() {
        if (this.llevoElMotor || !this.ordenesPendientes.length) return;
        const conMotor = [...this.pares.values()].some((p) => p.datos.motor === true && p.canal?.readyState === "open");
        if (!conMotor) return;
        for (const m of this.ordenesPendientes.splice(0)) this.aLosPares({ t: "orden", m }, (p) => p.datos.motor === true);
    }

    setLocalAudio(encendido: boolean) {
        this.audioOn = !!encendido;
        if (this.micro) this.micro.enabled = this.audioOn;
        this.contarMiEstado();
        this.emitir("participant-updated", { participant: this.participants().local });
    }

    setLocalVideo(encendido: boolean) {
        this.videoOn = !!encendido;
        if (this.camara) this.camara.enabled = this.videoOn;
        this.contarMiEstado();
        this.emitir("participant-updated", { participant: this.participants().local });
    }

    startScreenShare() {
        if (!navigator.mediaDevices?.getDisplayMedia) return;
        navigator.mediaDevices
            .getDisplayMedia({ video: true, audio: false })
            .then((s) => {
                this.pantalla = s.getVideoTracks()[0] ?? null;
                if (!this.pantalla) return;
                this.pantalla.addEventListener("ended", () => this.stopScreenShare(), { once: true });
                for (const p of this.pares.values()) this.ponerEnElHueco(p, "pantalla", this.pantalla);
                this.contarMiEstado();
                this.emitir("local-screen-share-started", {});
                this.emitir("participant-updated", { participant: this.participants().local });
            })
            .catch((e) => console.warn("[sala-propia] no se compartió la pantalla", e));
    }

    stopScreenShare() {
        if (!this.pantalla) return;
        this.pantalla.stop();
        this.pantalla = null;
        for (const p of this.pares.values()) this.ponerEnElHueco(p, "pantalla", null);
        this.contarMiEstado();
        this.emitir("local-screen-share-stopped", {});
        this.emitir("participant-updated", { participant: this.participants().local });
    }

    /** Colgar A PROPÓSITO: la transcripción se entrega al resumen y al CRM. */
    async leave(): Promise<void> {
        if (this.saliendo) return;
        this.saliendo = true;
        if (this.llevoElMotor && this.motor) await this.guardarLoHablado(true);
        this.cerrarTodo(true);
        window.setTimeout(() => this.emitir("left-meeting", {}), 0);
    }

    /** Desmontar (o reconectar): se cierra sin entregar; la conversación sigue viva para la reentrada. */
    async destroy(): Promise<void> {
        if (this.saliendo) return;
        this.saliendo = true;
        if (this.llevoElMotor && this.motor) await this.guardarLoHablado(false);
        this.cerrarTodo(false);
    }

    /* ── Mis medios ─────────────────────────────────────────────────────── */

    private async abrirMisMedios() {
        const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio, video: { width: 640, height: 360 } });
            this.micro = s.getAudioTracks()[0] ?? null;
            this.camara = s.getVideoTracks()[0] ?? null;
        } catch (conVideo) {
            console.warn("[sala-propia] sin cámara; se entra solo con micrófono", conVideo);
            try {
                const s = await navigator.mediaDevices.getUserMedia({ audio });
                this.micro = s.getAudioTracks()[0] ?? null;
            } catch (sinNada) {
                console.warn("[sala-propia] sin micrófono", sinNada);
                // Como Daily: se dice y se sigue dentro (Verzy habla aunque no oiga).
                window.setTimeout(() => this.emitir("camera-error", { error: String(sinNada) }), 0);
            }
        }
    }

    /* ── Verzy ──────────────────────────────────────────────────────────── */

    private async encenderElMotor() {
        const r = await fetch(`/api/videollamada/motor?${this.opciones.consulta}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ a: "sesion" }),
        });
        const sesion = (await r.json().catch(() => ({}))) as { ok?: boolean; clave?: string; motivo?: string; frases?: FraseDelMotor[] };
        if (!sesion.ok || !sesion.clave) throw new Error(`el motor no dio sesión (${sesion.motivo ?? r.status})`);
        this.frases = Array.isArray(sesion.frases) ? [...sesion.frases] : [];
        this.guardadas = this.frases.length;
        const conectar = this.opciones.conectar ?? conectarElMotor;
        const motor = await conectar({ clave: sesion.clave, entrada: this.micro });
        this.motor = motor;
        this.vozDeVerzy = motor.voz;
        this.logo = crearElLogoQueHabla();
        this.logo.escuchar(motor.voz);
        motor.alEvento((e) => this.delMotor(e));
        motor.alCaerse((porque) => {
            if (this.saliendo) return;
            console.warn("[sala-propia] se cayó el motor de Verzy", { porque });
            // La sala lo lee como el fin de Tavus si se cerró, o reconecta si fue un error.
            this.emitir("error", { errorMsg: `motor: ${porque}` });
        });
        console.info("[sala-propia] Verzy conectada con el motor propio", { conversacion: this.conversacionId });
    }

    private delMotor(evento: unknown) {
        const tipo = (evento as { type?: unknown })?.type;
        if (tipo === "response.created") {
            this.respondiendo = true;
            this.respondiendoDesde = Date.now();
        }
        const r = loQueDiceElMotor(evento, this.conversacionId);
        if (tipo === "response.done") {
            this.respondiendo = false;
            const siguiente = this.pendientes.shift();
            if (siguiente) this.mandarAlMotor(siguiente);
        }
        if (r.error) console.warn("[sala-propia] el motor avisó un error", { error: r.error });
        if (r.frase) {
            this.frases.push(r.frase);
            // Cada frase se guarda enseguida (con un respiro): una recarga no pierde lo último.
            window.clearTimeout(this.guardarPronto);
            this.guardarPronto = window.setTimeout(() => void this.guardarLoHablado(false), 1_500);
        }
        if (r.tokens) this.tokensSinMandar += r.tokens;
        for (const e of r.respuesta) this.mandarAlMotor(e);
        for (const m of r.mensajes) this.repartir(m);
    }

    /** Lo que Verzy dice o hace: a esta sala y a las demás personas. */
    private repartir(m: MensajeDeLaSala) {
        this.emitir("app-message", { data: m, fromId: ID_DE_VERZY });
        this.aLosPares({ t: "evento", m });
    }

    private alMotor(mensaje: unknown) {
        for (const e of loQueSeLeMandaAlMotor(mensaje)) this.mandarAlMotor(e);
    }

    /**
     * Realtime no admite dos respuestas a la vez: la que llega con otra en curso
     * espera su turno (`response.done`). Cortar a Verzy deja el turno libre, y
     * una respuesta que nunca avisó su fin no bloquea más de `TURNO_PERDIDO_MS`.
     */
    private mandarAlMotor(evento: Record<string, unknown>) {
        if (!this.motor) return;
        if (this.respondiendo && Date.now() - this.respondiendoDesde > TURNO_PERDIDO_MS) {
            console.warn("[sala-propia] una respuesta del motor no avisó su fin; se libera el turno");
            this.respondiendo = false;
        }
        if (evento.type === "response.create" && this.respondiendo) {
            this.pendientes.push(evento);
            return;
        }
        if (evento.type === "response.create") {
            this.respondiendo = true;
            this.respondiendoDesde = Date.now();
        }
        if (evento.type === "response.cancel") {
            this.pendientes = [];
            this.respondiendo = false;
        }
        this.motor.enviar(evento);
    }

    private readonly alIrse = () => {
        // Cerrar la pestaña o recargar: se guarda lo hablado, sin entregarlo
        // (una recarga sigue la MISMA conversación). Si no vuelve, lo entrega el barrido.
        const cuerpo = JSON.stringify({ a: "hablado", conversacionId: this.conversacionId, frases: this.frases, tokens: this.tokensSinMandar });
        this.tokensSinMandar = 0;
        try {
            navigator.sendBeacon?.(`/api/videollamada/motor?${this.opciones.consulta}`, new Blob([cuerpo], { type: "application/json" }));
        } catch (error) {
            console.warn("[sala-propia] no se pudo guardar lo hablado al irse", error);
        }
    };

    private async guardarLoHablado(fin: boolean) {
        if (!this.conversacionId) return;
        // Aunque no haya nada nuevo se manda: es el latido que le dice al
        // barrido que la conversación sigue viva.
        const tokens = this.tokensSinMandar;
        this.tokensSinMandar = 0;
        const frases = [...this.frases];
        try {
            const r = await fetch(`/api/videollamada/motor?${this.opciones.consulta}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                keepalive: true,
                body: JSON.stringify({ a: "hablado", conversacionId: this.conversacionId, frases, tokens, ...(fin ? { fin: true } : {}) }),
            });
            const j = (await r.json().catch(() => ({}))) as { ok?: boolean; motivo?: string };
            if (!j.ok) console.warn("[sala-propia] el servidor no guardó lo hablado", { motivo: j.motivo, fin });
            else this.guardadas = frases.length;
        } catch (error) {
            this.tokensSinMandar += tokens;
            console.warn("[sala-propia] no se pudo guardar lo hablado", { fin, error });
        }
    }

    /* ── Las demás personas ─────────────────────────────────────────────── */

    private datosMios(): Record<string, unknown> {
        return { ...this.marca, ...(this.llevoElMotor ? { motor: true } : {}) };
    }

    private async latir() {
        if (this.latiendo) return null;
        this.latiendo = true;
        try {
            const senales = this.senalesQueSalen.splice(0);
            const cuerpo = { participanteId: this.yo, nombre: this.nombre, datos: this.datosMios(), senales };
            const r = this.opciones.senalizar
                ? await this.opciones.senalizar(cuerpo)
                : await fetch(`/api/videollamada/senales?${this.opciones.consulta}`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(cuerpo),
                  }).then((x) => x.json());
            if (!r?.ok) {
                this.senalesQueSalen.unshift(...senales);
                return null;
            }
            if (Array.isArray(r.ice) && r.ice.length) this.ice = r.ice;
            if (this.dentro) {
                for (const s of r.senales ?? []) await this.alLlegarUnaSenal(s);
                this.repasarLosPares(r.presentes ?? []);
            }
            return r;
        } finally {
            this.latiendo = false;
        }
    }

    private repasarLosPares(presentes: Array<{ participanteId: string; nombre: string | null; datos: Record<string, unknown> }>) {
        const vivos = new Set(presentes.map((p) => p.participanteId));
        for (const p of [...this.pares.values()]) {
            const caido = p.pc.connectionState === "failed" || p.pc.connectionState === "closed";
            if (!vivos.has(p.id) || caido) this.quitarElPar(p.id, caido ? "conexión caída" : "se fue");
        }
        for (const p of presentes) {
            const par = this.pares.get(p.participanteId);
            if (par) {
                const eraElMotor = par.datos.motor === true;
                par.nombre = p.nombre;
                par.datos = p.datos;
                // La voz de Verzy pudo llegar antes de saber que esta persona la lleva.
                if (!eraElMotor && p.datos.motor === true && par.remotas.verzy) this.alLlegarLaVozDeVerzy(par);
                if (!eraElMotor && p.datos.motor === true) this.soltarLasOrdenes();
                continue;
            }
            if (debeOfrecer(this.yo, p.participanteId)) void this.ofrecer(p);
        }
    }

    private nuevoPar(id: string, nombre: string | null, datos: Record<string, unknown>, ofrezco: boolean): Par {
        const pc = new RTCPeerConnection({ iceServers: this.ice });
        const par: Par = { id, nombre, datos, pc, canal: null, remotas: {}, estado: { audio: false, video: false, pantalla: false }, ofrezco };
        pc.addEventListener("track", (ev) => {
            const i = pc.getTransceivers().indexOf(ev.transceiver);
            const hueco = HUECOS_DE_LA_CONEXION[i];
            if (!hueco) return;
            par.remotas[hueco] = ev.track;
            if (hueco === "verzy") this.alLlegarLaVozDeVerzy(par);
            this.cambioEnLosPares(par);
        });
        pc.addEventListener("datachannel", (ev) => this.atarElCanal(par, ev.channel));
        pc.addEventListener("connectionstatechange", () => {
            if (pc.connectionState === "connected") this.cambioEnLosPares(par);
        });
        this.pares.set(id, par);
        return par;
    }

    private pistaDelHueco(hueco: HuecoDeLaConexion): MediaStreamTrack | null {
        if (hueco === "microfono") return this.micro;
        if (hueco === "camara") return this.camara;
        if (hueco === "pantalla") return this.pantalla;
        return this.llevoElMotor ? this.vozDeVerzy : null;
    }

    private ponerEnElHueco(p: Par, hueco: HuecoDeLaConexion, pista: MediaStreamTrack | null) {
        const t = p.pc.getTransceivers()[HUECOS_DE_LA_CONEXION.indexOf(hueco)];
        if (t) void t.sender.replaceTrack(pista).catch((e) => console.warn("[sala-propia] no se pudo cambiar la pista", { hueco, e }));
    }

    private async ofrecer(p: { participanteId: string; nombre: string | null; datos: Record<string, unknown> }) {
        const par = this.nuevoPar(p.participanteId, p.nombre, p.datos, true);
        for (const hueco of HUECOS_DE_LA_CONEXION) {
            par.pc.addTransceiver(TIPO_DEL_HUECO[hueco], { direction: "sendrecv" });
        }
        for (const hueco of HUECOS_DE_LA_CONEXION) this.ponerEnElHueco(par, hueco, this.pistaDelHueco(hueco));
        this.atarElCanal(par, par.pc.createDataChannel("sala"));
        try {
            await par.pc.setLocalDescription(await par.pc.createOffer());
            await esperarLosCandidatos(par.pc);
            this.senalesQueSalen.push({ para: par.id, tipo: "oferta", cuerpo: par.pc.localDescription?.sdp ?? "" });
        } catch (error) {
            console.warn("[sala-propia] no se pudo ofrecer la conexión", { a: par.id, error });
            this.quitarElPar(par.id, "oferta fallida");
        }
    }

    private async alLlegarUnaSenal(s: { de: string; tipo: string; cuerpo: string }) {
        try {
            if (s.tipo === "oferta") {
                if (this.pares.has(s.de)) this.quitarElPar(s.de, "nueva oferta");
                const par = this.nuevoPar(s.de, null, {}, false);
                await par.pc.setRemoteDescription({ type: "offer", sdp: s.cuerpo });
                for (const t of par.pc.getTransceivers()) t.direction = "sendrecv";
                for (const hueco of HUECOS_DE_LA_CONEXION) this.ponerEnElHueco(par, hueco, this.pistaDelHueco(hueco));
                await par.pc.setLocalDescription(await par.pc.createAnswer());
                await esperarLosCandidatos(par.pc);
                this.senalesQueSalen.push({ para: par.id, tipo: "respuesta", cuerpo: par.pc.localDescription?.sdp ?? "" });
            } else if (s.tipo === "respuesta") {
                const par = this.pares.get(s.de);
                if (par?.ofrezco && par.pc.signalingState === "have-local-offer") {
                    await par.pc.setRemoteDescription({ type: "answer", sdp: s.cuerpo });
                }
            }
        } catch (error) {
            console.warn("[sala-propia] una señal no se pudo usar", { de: s.de, tipo: s.tipo, error });
            this.quitarElPar(s.de, "señal fallida");
        }
    }

    private atarElCanal(par: Par, canal: RTCDataChannel) {
        par.canal = canal;
        canal.addEventListener("open", () => {
            this.contarMiEstado();
            this.cambioEnLosPares(par);
            this.soltarLasOrdenes();
        });
        canal.addEventListener("message", (ev) => {
            const m = comoMensajeEntrePersonas(ev.data);
            if (!m) return;
            if (m.t === "estado") {
                par.estado = { audio: m.audio, video: m.video, pantalla: m.pantalla };
                this.cambioEnLosPares(par);
            } else if (m.t === "evento" && !this.llevoElMotor) {
                this.emitir("app-message", { data: m.m, fromId: ID_DE_VERZY });
            } else if (m.t === "orden" && this.llevoElMotor) {
                this.alMotor(m.m);
            }
        });
    }

    private aLosPares(m: MensajeEntrePersonas, filtro: (p: Par) => boolean = () => true) {
        const texto = JSON.stringify(m);
        for (const p of this.pares.values()) {
            if (!filtro(p) || p.canal?.readyState !== "open") continue;
            try {
                p.canal.send(texto);
            } catch (error) {
                console.warn("[sala-propia] no salió un mensaje a otra persona", { a: p.id, error });
            }
        }
    }

    private contarMiEstado() {
        this.aLosPares({ t: "estado", audio: !!this.micro && this.audioOn, video: !!this.camara && this.videoOn, pantalla: !!this.pantalla });
    }

    /** Un asesor recibe la voz de Verzy del navegador que la lleva: su logo late con ella. */
    private alLlegarLaVozDeVerzy(par: Par) {
        // Toda conexión trae un hueco «verzy»; solo vale el de quien lleva el motor.
        if (this.llevoElMotor || par.datos.motor !== true) return;
        const voz = par.remotas.verzy;
        if (!voz) return;
        const nueva = !this.vozDeVerzy;
        this.vozDeVerzy = voz;
        this.logo ??= crearElLogoQueHabla();
        this.logo.escuchar(voz);
        if (nueva) this.emitir("participant-joined", { participant: this.participants()[ID_DE_VERZY] });
    }

    private cambioEnLosPares(par: Par) {
        this.mezclarParaVerzy();
        this.emitir("participant-updated", { participant: this.participants()[par.id] });
        this.emitir("track-started", { participant: this.participants()[par.id] });
    }

    /**
     * Verzy oye a TODOS los de la sala: con un asesor dentro, lo que le entra al
     * motor es la mezcla del micrófono del cliente y la voz del asesor. Solo, el
     * micrófono tal cual (sin pasar por el audio del navegador, que sin un gesto
     * puede estar dormido).
     */
    private mezclarParaVerzy() {
        if (!this.llevoElMotor || !this.motor) return;
        const voces = [...this.pares.values()].map((p) => [p.id, p.remotas.microfono] as const).filter((v): v is readonly [string, MediaStreamTrack] => !!v[1]);
        if (!voces.length) {
            if (this.mezcla) {
                this.motor.cambiarLaEntrada(this.micro);
                this.mezcla = null;
            }
            return;
        }
        const ctx = elContextoDeAudio();
        if (!ctx || ctx.state !== "running") {
            console.warn("[sala-propia] el audio del navegador está dormido: Verzy oye solo al cliente hasta el primer toque");
            return;
        }
        if (!this.mezcla) {
            const destino = ctx.createMediaStreamDestination();
            this.mezcla = { destino, fuentes: new Map() };
            if (this.micro) {
                const f = ctx.createMediaStreamSource(new MediaStream([this.micro]));
                f.connect(destino);
                this.mezcla.fuentes.set("yo", f);
            }
            this.motor.cambiarLaEntrada(destino.stream.getAudioTracks()[0] ?? this.micro);
        }
        for (const [id, pista] of voces) {
            if (this.mezcla.fuentes.has(id)) continue;
            const f = ctx.createMediaStreamSource(new MediaStream([pista]));
            f.connect(this.mezcla.destino);
            this.mezcla.fuentes.set(id, f);
        }
    }

    private quitarElPar(id: string, porque: string) {
        const p = this.pares.get(id);
        if (!p) return;
        this.pares.delete(id);
        const f = this.mezcla?.fuentes.get(id);
        if (f) {
            try {
                f.disconnect();
            } catch {
                // Ya suelta.
            }
            this.mezcla?.fuentes.delete(id);
        }
        try {
            p.pc.close();
        } catch {
            // Ya cerrada.
        }
        console.info("[sala-propia] una persona salió de la sala", { id, porque });
        this.emitir("participant-left", { participant: { local: false, session_id: id, userData: { humano: true, ...(p.datos.asesor ? { asesor: true } : {}) } } });
        // Si era quien llevaba a Verzy, Verzy se va con ella.
        if (!this.llevoElMotor && p.remotas.verzy && this.vozDeVerzy === p.remotas.verzy) {
            this.vozDeVerzy = null;
            this.logo?.escuchar(null);
            this.emitir("participant-left", { participant: { local: false, session_id: ID_DE_VERZY } });
        }
    }

    /** `colgo`: se fue a propósito (Verzy se despide de las demás); si no, es una recarga o una reconexión. */
    private cerrarTodo(colgo: boolean) {
        this.dentro = false;
        this.relojes.forEach((r) => window.clearInterval(r));
        window.clearTimeout(this.guardarPronto);
        this.relojes = [];
        window.removeEventListener("pagehide", this.alIrse);
        // Que las demás dejen de verme ya, sin esperar al latido.
        const salir = { participanteId: this.yo, nombre: this.nombre, datos: {}, senales: [], salir: true };
        if (this.opciones.senalizar) void this.opciones.senalizar(salir).catch(() => {});
        else
            void fetch(`/api/videollamada/senales?${this.opciones.consulta}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                keepalive: true,
                body: JSON.stringify(salir),
            }).catch(() => {});
        if (colgo && this.llevoElMotor && this.motor) this.aLosPares({ t: "evento", m: elFinDelMotor(this.conversacionId) });
        for (const id of [...this.pares.keys()]) this.quitarElPar(id, "salí");
        this.motor?.cerrar();
        this.motor = null;
        this.logo?.parar();
        this.logo = null;
        this.vozDeVerzy = null;
        for (const t of [this.micro, this.camara, this.pantalla]) t?.stop();
        this.micro = this.camara = this.pantalla = null;
    }
}

export function crearLaSalaPropia(opciones: OpcionesDeLaSalaPropia): SalaPropia {
    return new SalaPropia(opciones);
}
