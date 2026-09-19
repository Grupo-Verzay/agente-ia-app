import { NextResponse } from "next/server";
import { Readable } from "stream";
import { randomUUID } from "crypto";

import { minioClient } from "@/lib/minio";
import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";
import { laCuentaDelCodigo } from "@/lib/tickets-db";

/**
 * Los archivos de la ficha pública de tickets: subir y quitar.
 *
 * `/api/upload` no sirve aquí, y no por capricho: empieza por `currentUser()`,
 * y quien llena esta ficha **no tiene cuenta**. Aflojar aquella ruta para que
 * pase sin sesión sería abrirle el bucket a cualquiera; lo que se hace es una
 * ruta propia cuya puerta es **el código del enlace**.
 *
 * ## Lo que decide todo es el código, no el cuerpo de la petición
 *
 * La carpeta en la que se escribe sale de `laCuentaDelCodigo`, nunca de un
 * `userID` que mande el navegador. Ese fue el agujero que se cerró en
 * `/api/upload` (H02 de la auditoría): una cuenta dejando archivos en la
 * carpeta de otra.
 *
 * Y la carpeta es **siempre** `tickets-publico`, escrita aquí: así lo que entra
 * por el enlace queda separado de lo que sube la propia cuenta, y el borrado de
 * abajo puede negarse a tocar nada de fuera de ahí.
 *
 * ## Por qué esta ruta SÍ tiene tope de tamaño y `/api/upload` no
 *
 * Aquella la llama alguien con sesión, a quien se le puede pedir cuentas. Esta
 * la puede llamar cualquiera que tenga el enlace, así que un archivo sin techo
 * es la forma más barata de llenarle el bucket a una cuenta. El tope no es «un
 * tope de envíos» —los tickets no lo tienen, el enlace lo reparte el dueño
 * entre sus clientes—: es lo que impide que **un solo** envío pese lo que
 * quiera.
 */

/** Veinticinco megas, lo mismo que admite un adjunto del chat de equipo. */
const TOPE_DE_BYTES = 25 * 1024 * 1024;

/** Dónde caen. Escrito aquí y en ningún otro sitio. */
const CARPETA = "tickets-publico";

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const codigo = String(formData.get("codigo") ?? "").trim();
  const cuentaId = await laCuentaDelCodigo(codigo);
  if (!cuentaId) {
    return NextResponse.json({ error: "Este enlace ya no está disponible." }, { status: 403 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "No se proporcionó un archivo." }, { status: 400 });
  }
  if (file.size > TOPE_DE_BYTES) {
    // Se dice el número: «demasiado grande» sin decir cuánto cabe obliga a
    // probar a ciegas.
    return NextResponse.json(
      { error: `El archivo pasa de ${Math.round(TOPE_DE_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  try {
    const bucketName = process.env.S3_BUCKET_NAME || "verzay-media";
    const nombre = file.name.replaceAll(" ", "_");
    // La MISMA forma de llave que escribe `/api/upload`:
    // `userID/workflowID/fichero`, tres trozos. Es lo que deja que
    // `llaveDelArchivoSubido` la reconozca después, al borrar y al guardar el
    // ticket — con otra forma, esas dos comprobaciones la rechazarían.
    const llave = `${cuentaId}/${CARPETA}/${randomUUID()}-${nombre}`;

    await minioClient.putObject(
      bucketName,
      llave,
      Readable.fromWeb(file.stream() as never),
      file.size,
      { "Content-Type": file.type },
    );

    return NextResponse.json({
      message: "Archivo subido con éxito.",
      url: `${process.env.S3_PUBLIC_URL}/${bucketName}/${llave}`,
    });
  } catch (error) {
    console.error("[tickets-publico] no se pudo subir el archivo", error);
    return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 500 });
  }
}

/**
 * Quitar uno que se subió y al final no se mandó.
 *
 * Es la contrapartida de poder adjuntar antes de que el ticket exista: sin
 * esto, cada archivo que alguien quita de la lista se queda en el bucket para
 * siempre. Y solo borra lo que cumple **las tres a la vez**: es de nuestro
 * bucket, tiene la forma exacta de una llave de subida, y está en la carpeta
 * pública **de la cuenta de este código**.
 */
export async function DELETE(req: Request) {
  const cuerpo = await req.json().catch(() => null);
  const codigo = String(cuerpo?.codigo ?? "").trim();
  const url = typeof cuerpo?.url === "string" ? cuerpo.url : "";

  const cuentaId = await laCuentaDelCodigo(codigo);
  if (!cuentaId) {
    return NextResponse.json({ error: "Este enlace ya no está disponible." }, { status: 403 });
  }
  if (!url) {
    return NextResponse.json({ error: "Falta la dirección del archivo." }, { status: 400 });
  }

  const bucketName = process.env.S3_BUCKET_NAME || "verzay-media";
  const destino = llaveDelArchivoSubido(url, process.env.S3_PUBLIC_URL, bucketName);
  // La cuenta **y la carpeta**: con solo la cuenta, este código serviría para
  // borrar cualquier adjunto de cualquier tarea suya.
  if (!destino || destino.userID !== cuentaId || !destino.llave.startsWith(`${cuentaId}/${CARPETA}/`)) {
    return NextResponse.json(
      { error: "Esa dirección no es de un archivo que se pueda borrar." },
      { status: 400 },
    );
  }

  try {
    await minioClient.removeObject(bucketName, destino.llave);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // No puede tumbar nada —quien llama está quitando un archivo de una lista—
    // pero tampoco es mudo: espacio que se queda sin que nadie sepa de dónde.
    console.warn("[tickets-publico] no se pudo borrar el archivo", {
      llave: destino.llave,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo borrar el archivo." }, { status: 500 });
  }
}
