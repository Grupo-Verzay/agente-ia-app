/**
 * Un `.zip` sin comprimir («store»), escrito a mano.
 *
 * Para exportar varias conversaciones de una vez hace falta UN archivo que
 * contenga varios, que es lo que hace WhatsApp. Traer una librería de zip
 * entera para meter unos `.txt` no compensa: el formato sin compresión son
 * dos cabeceras por archivo y un índice al final, y así se prueba entero en el
 * banco sin navegador (se abre con el `zipfile` de Python, que es un lector
 * independiente de este).
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **El bit 11 del indicador va puesto**: dice que los nombres van en UTF-8.
 *    Sin él, «Chat con José.txt» sale como «Chat con JosÃ©.txt» en Windows.
 * 2. **El CRC32 es el de verdad**, no un cero: los lectores estrictos —el del
 *    propio Windows entre ellos— rechazan un archivo cuyo CRC no cuadra.
 */

const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c >>> 0;
    }
    return t;
})();

export function crc32(datos: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function horaDos(fecha: Date): { hora: number; dia: number } {
    const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2);
    const anio = Math.max(1980, fecha.getFullYear());
    const dia = ((anio - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
    return { hora: hora & 0xffff, dia: dia & 0xffff };
}

export interface ArchivoDelZip {
    nombre: string;
    contenido: string | Uint8Array;
}

export function crearZip(archivos: ArchivoDelZip[], fecha: Date = new Date()): Uint8Array {
    const codificar = new TextEncoder();
    const { hora, dia } = horaDos(fecha);
    const locales: Uint8Array[] = [];
    const centrales: Uint8Array[] = [];
    let desplazamiento = 0;

    for (const a of archivos) {
        const nombre = codificar.encode(a.nombre);
        const datos = typeof a.contenido === "string" ? codificar.encode(a.contenido) : a.contenido;
        const crc = crc32(datos);

        const local = new Uint8Array(30 + nombre.length);
        const vl = new DataView(local.buffer);
        vl.setUint32(0, 0x04034b50, true);
        vl.setUint16(4, 20, true);
        vl.setUint16(6, 0x0800, true);
        vl.setUint16(8, 0, true);
        vl.setUint16(10, hora, true);
        vl.setUint16(12, dia, true);
        vl.setUint32(14, crc, true);
        vl.setUint32(18, datos.length, true);
        vl.setUint32(22, datos.length, true);
        vl.setUint16(26, nombre.length, true);
        vl.setUint16(28, 0, true);
        local.set(nombre, 30);

        const central = new Uint8Array(46 + nombre.length);
        const vc = new DataView(central.buffer);
        vc.setUint32(0, 0x02014b50, true);
        vc.setUint16(4, 20, true);
        vc.setUint16(6, 20, true);
        vc.setUint16(8, 0x0800, true);
        vc.setUint16(10, 0, true);
        vc.setUint16(12, hora, true);
        vc.setUint16(14, dia, true);
        vc.setUint32(16, crc, true);
        vc.setUint32(20, datos.length, true);
        vc.setUint32(24, datos.length, true);
        vc.setUint16(28, nombre.length, true);
        vc.setUint32(42, desplazamiento, true);
        central.set(nombre, 46);

        locales.push(local, datos);
        centrales.push(central);
        desplazamiento += local.length + datos.length;
    }

    const tamCentral = centrales.reduce((s, c) => s + c.length, 0);
    const fin = new Uint8Array(22);
    const vf = new DataView(fin.buffer);
    vf.setUint32(0, 0x06054b50, true);
    vf.setUint16(8, archivos.length, true);
    vf.setUint16(10, archivos.length, true);
    vf.setUint32(12, tamCentral, true);
    vf.setUint32(16, desplazamiento, true);

    const total = desplazamiento + tamCentral + fin.length;
    const salida = new Uint8Array(total);
    let p = 0;
    for (const trozo of [...locales, ...centrales, fin]) {
        salida.set(trozo, p);
        p += trozo.length;
    }
    return salida;
}
