import { NextResponse } from "next/server";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const comprimir = promisify(gzip);

/**
 * Por debajo de esto comprimir cuesta mas de lo que ahorra (la cabecera de
 * gzip sola son ~20 bytes, y el viaje ya esta pagado).
 */
const DESDE_CUANTOS_BYTES = 1024;

/**
 * Una respuesta JSON que viaja COMPRIMIDA cuando el navegador puede.
 *
 * ## Por que hace falta escribir esto
 *
 * `next.config.js` no declara `compress`, asi que va en `true`: el servidor de
 * Next comprime. Probado en local contra el build de produccion —el 404 baja de
 * 16.527 a 5.241 bytes y la respuesta gana `Vary: Accept-Encoding`—.
 *
 * En produccion NO pasa. Medido en DevTools sobre `/api/chats/lista`: el
 * navegador manda `accept-encoding: gzip, deflate, br, zstd`, la respuesta
 * vuelve en crudo (753 kB) y su `Vary` dice `RSC, Next-Router-State-Tree,
 * Next-Router-Prefetch` **sin** `Accept-Encoding`. Esa ausencia es la firma:
 * la capa que comprime no llego a ejecutarse.
 *
 * Encaja con que delante hay un proxy (Traefik) que no reenvia
 * `Accept-Encoding` aguas arriba y que tampoco lleva su propio `compress`
 * puesto en ese router: ni Next comprime —no ve que el cliente pueda— ni el
 * proxy comprime. Eso se arregla en la infraestructura, y hay que arreglarlo;
 * pero esta App no puede depender de una etiqueta de un panel que nadie ve al
 * desplegar. Aqui la compresion es nuestra y viaja con el codigo.
 *
 * ## Como decide
 *
 * Mira `accept-encoding` de la PETICION, no la cabecera que haya puesto el
 * proxy: si el navegador no dice que acepta gzip, se contesta en crudo. Y por
 * debajo de un kilobyte no se comprime, que ahi la cabecera cuesta mas que lo
 * que ahorra.
 *
 * Es `gzip` y no `br`: lo entienden todos los navegadores desde hace una decada
 * y comprimir con Brotli en el hilo de Node es mucho mas caro para lo mismo.
 *
 * ## Y no bloquea el hilo
 *
 * `zlib.gzip` asincrono, no `gzipSync`. El proceso de Node es de UNO, y
 * comprimir 753 kB de forma sincrona deja parada cada otra peticion que haya en
 * vuelo -incluido el envio de un mensaje-. La version asincrona corre en el
 * grupo de hilos de libuv y no toca el bucle de eventos.
 *
 * Si comprimir falla, se contesta en crudo: una respuesta grande es mejor que
 * ninguna. Y se dice, porque un fallo mudo aqui se ve como «la App va lenta».
 */
export async function responderJson(
  request: Request,
  cuerpo: unknown,
  init?: { status?: number },
): Promise<NextResponse> {
  const texto = JSON.stringify(cuerpo);
  const acepta = (request.headers.get("accept-encoding") ?? "").toLowerCase();

  if (!acepta.includes("gzip") || texto.length < DESDE_CUANTOS_BYTES) {
    return NextResponse.json(cuerpo as never, { status: init?.status });
  }

  try {
    const comprimido = await comprimir(texto);
    return new NextResponse(comprimido, {
      status: init?.status ?? 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Encoding": "gzip",
        "Content-Length": String(comprimido.byteLength),
        // Sin esto una cache intermedia puede servirle lo comprimido a quien no
        // lo acepta.
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    console.warn("[api] no se pudo comprimir la respuesta; va en crudo", {
      bytes: texto.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(cuerpo as never, { status: init?.status });
  }
}
