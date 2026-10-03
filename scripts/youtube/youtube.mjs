#!/usr/bin/env node
/**
 * La herramienta del agente para el canal de YouTube de la casa.
 *
 *   node scripts/youtube/youtube.mjs estado
 *   node scripts/youtube/youtube.mjs guardar-cliente <credenciales.json>
 *   node scripts/youtube/youtube.mjs autorizar
 *   node scripts/youtube/youtube.mjs terminar "<dirección pegada del navegador>"
 *   node scripts/youtube/youtube.mjs subir --video v.mp4 --titulo "…" --descripcion d.txt \
 *        --miniatura m.jpg --publicar "2026-10-10 18:00" [--etiquetas "a, b"] [--categoria 28] \
 *        [--sin-avisar] [--forzar] [--probar]
 *   node scripts/youtube/youtube.mjs miniatura --video-id ID --archivo m.jpg
 *
 * Las fechas van en hora de Colombia. `--probar` lo comprueba todo —archivos,
 * fecha, el permiso y el canal— sin subir nada.
 *
 * Nada de lo que imprime es un secreto: el permiso de una hora se usa en
 * memoria y no se escribe en ninguna parte.
 */
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { enElContenedor } from "./contenedor.mjs";
import { leerElCliente, RUTA_DE_CONECTAR, RUTA_DE_VUELTA, elCanalAutorizado } from "../../lib/youtube-acceso.mjs";
import {
    comoQuedo,
    elCuerpoDelVideo,
    elTitulo,
    elVideo,
    elVideoSubido,
    laCategoria,
    laDescripcion,
    laHoraDePublicar,
    laHoraLegible,
    laHuellaDeLaSubida,
    laHuellaDelArchivo,
    laMiniatura,
    lasEtiquetas,
    ponerLaMiniatura,
    subirElVideo,
} from "../../lib/youtube-subida.mjs";

/** El dominio de la App. Es donde vive la ruta que empieza la autorización. */
export const ORIGEN_DE_LA_APP = (process.env.YOUTUBE_ORIGEN || "https://agente.ia-app.com").replace(/\/+$/, "");

class Parada extends Error {
    /** @param {string} mensaje @param {number} [salida] */
    constructor(mensaje, salida = 1) {
        super(mensaje);
        this.salida = salida;
    }
}

/** @param {string[]} args */
function lasOpciones(args) {
    /** @type {Record<string, string | boolean>} */
    const o = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith("--")) continue;
        const nombre = a.slice(2);
        const siguiente = args[i + 1];
        if (siguiente === undefined || siguiente.startsWith("--")) o[nombre] = true;
        else {
            o[nombre] = siguiente;
            i++;
        }
    }
    return o;
}

/** @param {any} r @param {string} contexto */
function exigir(r, contexto) {
    if (!r?.ok) throw new Parada(`${contexto}: ${r?.motivo ?? "sin respuesta"}`);
    return r;
}

/** Un texto, o el contenido del archivo si lo que se pasa es una ruta que existe. */
async function textoOArchivo(valor) {
    if (typeof valor !== "string") return "";
    if (valor.length < 400 && existsSync(valor)) return await readFile(valor, "utf8");
    return valor;
}

/* ── Órdenes ──────────────────────────────────────────────────────────────── */

export async function estado(log = console.log) {
    const r = exigir(await enElContenedor("estado"), "No se pudo leer el estado");
    const e = r.estado;
    if (!e.hayCliente) {
        log(e.sinDescifrar ? "Hay credenciales guardadas que ya no se pueden abrir (cambió AUTH_SECRET): vuelve a guardarlas." : "Todavía no hay credenciales de Google guardadas.");
        return e;
    }
    log(`Credenciales: cliente de tipo «${e.tipo === "web" ? "Aplicación web" : "Escritorio"}»${e.proyecto ? ` del proyecto «${e.proyecto}»` : ""} (…${e.clienteTermina}).`);
    if (e.conectado) {
        log(`Canal autorizado: «${e.canalTitulo}» (${e.canalId}), desde ${e.conectadoEn}.`);
        log(e.verificado ? "El canal está verificado: admite miniaturas personalizadas." : "El canal NO está verificado: las miniaturas personalizadas pueden fallar (youtube.com/verify).");
    } else {
        log(e.sinDescifrar ? "El permiso guardado ya no se puede abrir: hay que volver a autorizar." : "El canal todavía no está autorizado.");
    }
    if (e.ultimoError) log(`Último error: ${e.ultimoError}`);
    return e;
}

/** @param {string} ruta */
export async function guardarCliente(ruta, log = console.log) {
    if (!ruta) throw new Parada("Falta la ruta del JSON de credenciales.");
    const texto = await readFile(ruta, "utf8");
    const local = leerElCliente(texto);
    if (!local.ok) throw new Parada(local.motivo);
    const r = exigir(await enElContenedor("guardar-cliente", { cliente: texto }), "No se pudieron guardar las credenciales");
    log(`Credenciales guardadas (cifradas) en la App: cliente «${local.cliente.tipo === "web" ? "Aplicación web" : "Escritorio"}»${local.cliente.proyecto ? ` del proyecto «${local.cliente.proyecto}»` : ""}.`);
    log(r.permisoConservado ? "Es el mismo cliente de antes: el permiso del canal se conserva." : "Falta autorizar el canal: `node scripts/youtube/youtube.mjs autorizar`.");
    return r;
}

/**
 * Lo que hay que hacer en el navegador, paso a paso.
 */
export async function autorizar(log = console.log) {
    const r = exigir(await enElContenedor("estado"), "No se pudo leer el estado");
    const e = r.estado;
    if (!e.hayCliente) throw new Parada("Primero hay que guardar el JSON de credenciales (`guardar-cliente`).");
    const proyecto = e.proyecto ? `«${e.proyecto}»` : "de las credenciales";
    const pasos = [
        `En Google Cloud, en el proyecto ${proyecto}: APIs y servicios › Biblioteca › «YouTube Data API v3» › Habilitar.`,
        "APIs y servicios › Pantalla de consentimiento de OAuth (o «Público»): estado de publicación «En producción». En «Prueba» el permiso caduca a los 7 días y habría que volver a autorizar cada semana.",
    ];
    if (e.tipo === "web") {
        const vuelta = `${ORIGEN_DE_LA_APP}${RUTA_DE_VUELTA}`;
        const yaEsta = e.vueltasRegistradas.includes(vuelta);
        pasos.push(
            yaEsta
                ? `La dirección de vuelta ${vuelta} ya está en el cliente: no hay que tocarla.`
                : `APIs y servicios › Credenciales › el cliente de OAuth › «URIs de redireccionamiento autorizados»: añade ${vuelta} y guarda (tarda unos minutos en valer).`,
            `Con tu sesión de súper administrador abierta en la plataforma, abre: ${ORIGEN_DE_LA_APP}${RUTA_DE_CONECTAR}`,
            "Elige la cuenta o la «cuenta de marca» del canal de Verzay. Si Google dice «Google no verificó esta app», pulsa «Configuración avanzada» › «Ir a … (no seguro)».",
            "Marca las dos casillas (subir videos y ver tu cuenta de YouTube) y pulsa «Continuar». La página dirá qué canal quedó conectado.",
        );
    } else {
        const enlace = exigir(await enElContenedor("enlace", { origen: ORIGEN_DE_LA_APP }), "No se pudo armar el enlace");
        pasos.push(
            `Abre este enlace (vale 10 minutos): ${enlace.enlace}`,
            "Elige la cuenta o la «cuenta de marca» del canal de Verzay. Si Google dice «Google no verificó esta app», pulsa «Configuración avanzada» › «Ir a … (no seguro)».",
            "Marca las dos casillas y pulsa «Continuar». El navegador irá a una página de «localhost» que no carga: es lo esperado.",
            "Copia la dirección ENTERA de la barra del navegador y pégamela; con ella termino la conexión (`terminar`).",
        );
    }
    pasos.forEach((p, i) => log(`${i + 1}. ${p}`));
    return { tipo: e.tipo, pasos };
}

/** @param {string} direccion */
export async function terminar(direccion, log = console.log) {
    const r = exigir(await enElContenedor("terminar", { direccion, origen: ORIGEN_DE_LA_APP }), "No se pudo terminar la autorización");
    log(`Canal conectado: «${r.canal.titulo}» (${r.canal.id}).`);
    return r;
}

/** @param {Record<string, string | boolean>} o */
export async function subir(o, log = console.log, { trozo, esperar } = /** @type {any} */ ({})) {
    const videoRuta = typeof o.video === "string" ? o.video : "";
    if (!videoRuta) throw new Parada("Falta --video.");
    const datos = await stat(videoRuta).catch(() => null);
    if (!datos?.isFile()) throw new Parada(`No existe el video «${videoRuta}».`);

    const errores = [];
    const video = elVideo(path.basename(videoRuta), datos.size);
    const titulo = elTitulo(await textoOArchivo(o.titulo));
    const descripcion = laDescripcion(await textoOArchivo(o.descripcion));
    const etiquetas = lasEtiquetas(typeof o.etiquetas === "string" ? o.etiquetas : "");
    const categoria = laCategoria(typeof o.categoria === "string" ? o.categoria : undefined);
    const hora = laHoraDePublicar(typeof o.publicar === "string" ? o.publicar : "");
    for (const r of [video, titulo, descripcion, etiquetas, categoria, hora]) if (!r.ok) errores.push(r.motivo);

    /** @type {{ bytes: Buffer, tipo: string } | null} */
    let miniatura = null;
    if (typeof o.miniatura === "string") {
        const bytes = await readFile(o.miniatura).catch(() => null);
        if (!bytes) errores.push(`No existe la miniatura «${o.miniatura}».`);
        else {
            const m = laMiniatura(bytes);
            if (m.ok) miniatura = { bytes, tipo: m.valor.tipo };
            else errores.push(m.motivo);
        }
    }
    if (errores.length || !video.ok || !titulo.ok || !descripcion.ok || !etiquetas.ok || !categoria.ok || !hora.ok) {
        throw new Parada(`No se subió nada:\n- ${errores.join("\n- ")}`);
    }

    const publicarEn = hora.valor.iso;
    log(`Video: ${path.basename(videoRuta)} (${(datos.size / 1048576).toFixed(1)} MB) · se publica el ${hora.valor.legible}.`);
    const huella = laHuellaDeLaSubida({ videoSha256: await laHuellaDelArchivo(videoRuta), titulo: titulo.valor, publicarEn });

    const previa = exigir(await enElContenedor("buscar-subida", { huella }), "No se pudo consultar las subidas anteriores").subida;
    if (previa && !o.forzar) {
        log(`Este video ya se subió con el mismo título y la misma fecha: https://youtu.be/${previa.videoId} (no se vuelve a subir; usa --forzar si de verdad hace falta).`);
        return { videoId: previa.videoId, repetido: true };
    }

    const permiso = exigir(await enElContenedor("token"), "No hay permiso para subir al canal");
    log(`Canal: «${permiso.canalTitulo}» (${permiso.canalId}).`);

    if (o.probar) {
        const canal = await elCanalAutorizado({ accessToken: permiso.accessToken });
        log(`Prueba hecha: el permiso funciona y da acceso a «${canal.titulo}». No se subió nada.`);
        return { probado: true, canal };
    }

    let usado = false;
    const pedirToken = async () => {
        if (!usado) {
            usado = true;
            return permiso.accessToken;
        }
        return exigir(await enElContenedor("token"), "No se pudo renovar el permiso a mitad de la subida").accessToken;
    };
    let ultimoAviso = -1;
    const subido = await subirElVideo({
        ruta: videoRuta,
        tipo: video.valor.tipo,
        cuerpo: elCuerpoDelVideo({ titulo: titulo.valor, descripcion: descripcion.valor, etiquetas: etiquetas.valor, categoria: categoria.valor, publicarEn }),
        pedirToken,
        avisarSubidas: !o["sin-avisar"],
        alAvanzar: (hechos, total) => {
            const pct = Math.floor((hechos / total) * 10) * 10;
            if (pct > ultimoAviso) {
                ultimoAviso = pct;
                log(`  subido ${pct}%`);
            }
        },
        ...(trozo ? { trozo } : {}),
        ...(esperar ? { esperar } : {}),
    });
    const videoId = String(subido?.id ?? "");
    if (!videoId) throw new Parada("YouTube terminó la subida pero no devolvió el id del video.");
    exigir(
        await enElContenedor("anotar-subida", { subida: { huella, videoId, canalId: permiso.canalId, titulo: titulo.valor, publicarEn, miniatura: false } }),
        "El video se subió pero no se pudo anotar",
    );
    log(`Subido: https://youtu.be/${videoId} · editar en https://studio.youtube.com/video/${videoId}/edit`);

    const token = await pedirToken();
    let miniaturaPuesta = false;
    if (miniatura) {
        try {
            await ponerLaMiniatura({ videoId, bytes: miniatura.bytes, tipo: miniatura.tipo, token });
            await enElContenedor("anotar-miniatura", { videoId });
            miniaturaPuesta = true;
            log("Miniatura puesta.");
        } catch (e) {
            log(`La miniatura NO se puso (el video sigue subido y programado): ${e instanceof Error ? e.message : e}`);
            log(`Para reintentarla: node scripts/youtube/youtube.mjs miniatura --video-id ${videoId} --archivo ${o.miniatura}`);
        }
    }

    const quedo = comoQuedo(await elVideoSubido({ videoId, token }), publicarEn);
    log(quedo.estado === "programado" ? `✔ ${quedo.motivo}` : `⚠ ${quedo.motivo}`);
    if (quedo.estado !== "programado") throw new Parada(`El video se subió (https://youtu.be/${videoId}) pero no quedó programado como se pidió.`, 2);
    return { videoId, miniaturaPuesta, quedo };
}

/** @param {Record<string, string | boolean>} o */
export async function miniatura(o, log = console.log) {
    const videoId = typeof o["video-id"] === "string" ? o["video-id"] : "";
    if (!/^[\w-]{6,}$/.test(videoId)) throw new Parada("Falta --video-id.");
    const bytes = typeof o.archivo === "string" ? await readFile(o.archivo).catch(() => null) : null;
    if (!bytes) throw new Parada("Falta --archivo con la miniatura.");
    const m = laMiniatura(bytes);
    if (!m.ok) throw new Parada(m.motivo);
    const permiso = exigir(await enElContenedor("token"), "No hay permiso para el canal");
    await ponerLaMiniatura({ videoId, bytes, tipo: m.valor.tipo, token: permiso.accessToken });
    await enElContenedor("anotar-miniatura", { videoId });
    log(`Miniatura puesta en https://youtu.be/${videoId}.`);
    return { videoId };
}

/* ── Arranque ─────────────────────────────────────────────────────────────── */

const AYUDA = `Uso:
  node scripts/youtube/youtube.mjs estado
  node scripts/youtube/youtube.mjs guardar-cliente <credenciales.json>
  node scripts/youtube/youtube.mjs autorizar
  node scripts/youtube/youtube.mjs terminar "<dirección pegada del navegador>"
  node scripts/youtube/youtube.mjs subir --video v.mp4 --titulo "…" --descripcion d.txt --miniatura m.jpg --publicar "2026-10-10 18:00" [--etiquetas "a, b"] [--categoria 22] [--sin-avisar] [--forzar] [--probar]
  node scripts/youtube/youtube.mjs miniatura --video-id ID --archivo m.jpg
Las fechas van en hora de Colombia (${laHoraLegible(new Date().toISOString())} es ahora).`;

export async function principal(argv, log = console.log) {
    const [orden, ...resto] = argv;
    const o = lasOpciones(resto);
    switch (orden) {
        case "estado":
            return estado(log);
        case "guardar-cliente":
            return guardarCliente(resto[0], log);
        case "autorizar":
            return autorizar(log);
        case "terminar":
            return terminar(resto[0], log);
        case "subir":
            return subir(o, log);
        case "miniatura":
            return miniatura(o, log);
        default:
            log(AYUDA);
            return null;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    principal(process.argv.slice(2)).catch((e) => {
        console.error(e instanceof Parada ? e.message : `[youtube] ${e instanceof Error ? e.message : e}`);
        process.exit(e instanceof Parada ? e.salida : 1);
    });
}
