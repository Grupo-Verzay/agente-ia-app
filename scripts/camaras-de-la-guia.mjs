/**
 * Las CÁMARAS y los MICRÓFONOS de mentira de la guía de Reuniones.
 *
 * Chromium deja sustituir la cámara y el micrófono por un fichero
 * (`--use-file-for-fake-video-capture` y `--use-file-for-fake-audio-capture`),
 * y los repite en bucle. Sin ellos la reunión saldría con el patrón de pruebas
 * de Chromium —un fondo verde con un contador— y con un pitido cada segundo
 * que el reparto de orador tomaría por alguien hablando. Una guía con eso no
 * enseña cómo se ve una reunión: enseña una prueba.
 *
 * Así que cada participante lleva una persona ILUSTRADA (no una foto: la guía
 * es pública y no puede llevar la cara de nadie) con su nombre, su fondo y su
 * ropa, y un micrófono:
 *
 * - quien HABLA lleva una voz de mentira —un tono que sube y baja como una
 *   frase—, que es lo que el reparto de orador (`lib/voz-activa.ts`) mide para
 *   ponerla en grande. Su boca se mueve en la imagen;
 * - los demás, SILENCIO de verdad. Sin fichero Chromium mete su pitido, y el
 *   pitido también «habla».
 *
 * El audio no llega al vídeo de la guía: la narración va aparte. Solo sirve
 * para decidir quién sale en grande.
 *
 * Los ficheros se generan cada vez (van a una carpeta de usar y tirar): son
 * `.y4m` sin comprimir, decenas de megas cada uno, y no tienen por qué vivir en
 * el repositorio.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ANCHO = 640;
const ALTO = 480;
const FPS = 12;
const SEGUNDOS = 4;

/**
 * Las personas de la reunión de ejemplo. `habla` decide la voz y la boca.
 * Colores sobrios: una reunión de trabajo, no un dibujo animado.
 */
export const PERSONAS = {
    anfitriona: {
        nombre: "Andrea Torres",
        fondo: ["#dbe7f3", "#b9cde2"],
        piel: "#e7b995",
        pelo: "#3b2a20",
        peloLargo: true,
        ropa: "#2f5d8a",
        habla: false,
    },
    equipo: {
        nombre: "Sofía Rojas",
        fondo: ["#e8e1f2", "#cfc2e3"],
        piel: "#c98f6b",
        pelo: "#1f1a17",
        peloLargo: true,
        ropa: "#6b4f8f",
        habla: false,
    },
    invitado: {
        nombre: "Carlos Díaz",
        fondo: ["#e3efe4", "#bfd8c2"],
        piel: "#d7a27c",
        pelo: "#4a3222",
        peloLargo: false,
        ropa: "#3f6b4a",
        habla: true,
    },
};

/** El HTML de un fotograma: la persona en su despacho, con `t` en segundos. */
function elFotograma(persona) {
    const [f1, f2] = persona.fondo;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;width:${ANCHO}px;height:${ALTO}px;overflow:hidden;background:${f1}}
    </style></head><body>
    <svg id="s" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="pared" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${f1}"/><stop offset="1" stop-color="${f2}"/>
            </linearGradient>
        </defs>
        <rect width="${ANCHO}" height="${ALTO}" fill="url(#pared)"/>
        <!-- Una estantería y una planta, para que se lea como un despacho. -->
        <rect x="430" y="70" width="160" height="10" rx="3" fill="#ffffff" opacity=".55"/>
        <rect x="445" y="36" width="18" height="34" rx="2" fill="#ffffff" opacity=".45"/>
        <rect x="468" y="44" width="14" height="26" rx="2" fill="#ffffff" opacity=".35"/>
        <rect x="488" y="30" width="22" height="40" rx="2" fill="#ffffff" opacity=".5"/>
        <rect x="430" y="150" width="160" height="10" rx="3" fill="#ffffff" opacity=".55"/>
        <circle cx="560" cy="130" r="18" fill="#ffffff" opacity=".4"/>
        <path d="M70 330 q-6 -60 14 -110 q10 50 -4 110z" fill="#6f9a6c" opacity=".55"/>
        <path d="M80 330 q14 -70 50 -100 q-12 56 -40 100z" fill="#5f8a5c" opacity=".55"/>
        <rect x="60" y="326" width="56" height="60" rx="8" fill="#ffffff" opacity=".5"/>
        <g id="persona">
            <!-- Hombros y ropa -->
            <path d="M150 ${ALTO} q10 -120 170 -130 q160 10 170 130z" fill="${persona.ropa}"/>
            <path d="M290 352 l30 34 l30 -34z" fill="#ffffff" opacity=".85"/>
            <!-- Cuello -->
            <rect x="296" y="300" width="48" height="56" rx="18" fill="${persona.piel}"/>
            ${persona.peloLargo ? `<path d="M222 210 q0 -118 98 -118 q98 0 98 118 l6 150 q-40 16 -52 -8 l-6 -120 h-92 l-6 120 q-12 24 -52 8z" fill="${persona.pelo}"/>` : ""}
            <!-- Cabeza -->
            <ellipse cx="320" cy="212" rx="86" ry="100" fill="${persona.piel}"/>
            <!-- Pelo de arriba -->
            <path d="M232 196 q-4 -104 88 -106 q94 2 90 106 q-20 -50 -90 -56 q-66 4 -88 56z" fill="${persona.pelo}"/>
            <!-- Orejas -->
            <ellipse cx="236" cy="222" rx="12" ry="20" fill="${persona.piel}"/>
            <ellipse cx="404" cy="222" rx="12" ry="20" fill="${persona.piel}"/>
            <!-- Ojos -->
            <g id="ojos">
                <ellipse cx="288" cy="214" rx="8" ry="9" fill="#2b2522"/>
                <ellipse cx="352" cy="214" rx="8" ry="9" fill="#2b2522"/>
            </g>
            <path d="M270 192 q18 -10 36 -2" stroke="${persona.pelo}" stroke-width="5" fill="none" stroke-linecap="round"/>
            <path d="M334 190 q18 -8 36 2" stroke="${persona.pelo}" stroke-width="5" fill="none" stroke-linecap="round"/>
            <path d="M320 222 q-8 26 2 34" stroke="#b07a58" stroke-width="3" fill="none" stroke-linecap="round"/>
            <!-- Boca: la mueve \`pintar\` cuando la persona habla -->
            <ellipse id="boca" cx="320" cy="276" rx="22" ry="4" fill="#8a3b33" ${persona.habla ? "" : 'display="none"'}/>
            ${persona.habla ? "" : '<path d="M298 270 q22 20 44 0" stroke="#8a3b33" stroke-width="6" fill="none" stroke-linecap="round"/>'}
        </g>
    </svg>
    <script>
        const HABLA = ${persona.habla ? "true" : "false"};
        window.pintar = (t) => {
            // Un vaivén suave: una persona sentada nunca está quieta del todo.
            const dx = Math.sin(t * 1.3) * 4;
            const dy = Math.sin(t * 0.9) * 2.5;
            document.getElementById("persona").setAttribute("transform", "translate(" + dx + " " + dy + ")");
            // Parpadea una vez por vuelta.
            const parpado = (t % ${SEGUNDOS}) > 1.6 && (t % ${SEGUNDOS}) < 1.72;
            document.getElementById("ojos").setAttribute("transform", parpado ? "translate(0 214) scale(1 .15) translate(0 -214)" : "");
            const boca = document.getElementById("boca");
            if (HABLA) {
                const abierta = Math.abs(Math.sin(t * 9)) * (0.6 + 0.4 * Math.sin(t * 2.3));
                boca.setAttribute("ry", String(3 + abierta * 13));
            }
        };
    </script>
    </body></html>`;
}

/**
 * Genera la cámara (`.y4m`) de una persona. Se pinta cada fotograma en el
 * navegador y ffmpeg los junta: el `.y4m` es lo único que Chromium acepta como
 * cámara de mentira, y va en `yuv420p` o no lo lee.
 */
async function laCamara(navegador, persona, destino) {
    const tmp = fs.mkdtempSync(path.join(path.dirname(destino), "fotogramas-"));
    const p = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
    await p.setContent(elFotograma(persona));
    const total = FPS * SEGUNDOS;
    for (let i = 0; i < total; i += 1) {
        await p.evaluate((t) => window.pintar(t), i / FPS);
        await p.screenshot({ path: path.join(tmp, `f${String(i).padStart(3, "0")}.png`) });
    }
    await p.close();
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-framerate", String(FPS),
        "-i", path.join(tmp, "f%03d.png"),
        "-pix_fmt", "yuv420p",
        destino,
    ]);
    fs.rmSync(tmp, { recursive: true, force: true });
}

/**
 * El micrófono de una persona. Quien habla: un tono con envolvente de frase
 * (sube, baja, respira). Quien no: silencio de verdad, a 16 bits.
 */
function elMicrofono(persona, destino) {
    const fuente = persona.habla
        ? "sine=frequency=190:sample_rate=48000:duration=8"
        : "anullsrc=r=48000:cl=mono";
    const filtro = persona.habla
        ? "volume='0.08+0.55*abs(sin(2*PI*t*1.7))*gt(sin(2*PI*t*0.35)\\,-0.6)':eval=frame,aformat=channel_layouts=mono"
        : "aformat=channel_layouts=mono";
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", fuente,
        ...(persona.habla ? [] : ["-t", "8"]),
        "-af", filtro,
        "-c:a", "pcm_s16le",
        destino,
    ]);
}

/**
 * Las cámaras y micrófonos de todas las personas, en `carpeta`. Devuelve, por
 * persona, los argumentos de Chromium que la ponen delante de la cámara.
 */
export async function lasCamaras(navegador, carpeta) {
    fs.mkdirSync(carpeta, { recursive: true });
    const args = {};
    for (const [clave, persona] of Object.entries(PERSONAS)) {
        const video = path.join(carpeta, `${clave}.y4m`);
        const audio = path.join(carpeta, `${clave}.wav`);
        if (!fs.existsSync(video)) await laCamara(navegador, persona, video);
        if (!fs.existsSync(audio)) elMicrofono(persona, audio);
        args[clave] = [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-video-capture=${video}`,
            `--use-file-for-fake-audio-capture=${audio}`,
            "--autoplay-policy=no-user-gesture-required",
        ];
    }
    return args;
}
