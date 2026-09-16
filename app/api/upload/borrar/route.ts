import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { minioClient } from '@/lib/minio';
import { llaveDelArchivoSubido } from '@/lib/llave-del-bucket';

/**
 * Borrar del bucket un archivo que se subió y al final no se usó.
 *
 * Existe por un caso concreto: al crear una tarea se puede adjuntar antes de
 * que la tarea exista, así que el archivo sube primero y se engancha después.
 * Si se cancela el diálogo, ese archivo se queda huérfano — y sin esta ruta no
 * había forma de quitarlo, porque `quitarAdjuntoDeTareaAction` solo borra la
 * fila de la base y nunca tocó el bucket.
 *
 * ## Lo único delicado: qué se deja borrar
 *
 * Una ruta que borra lo que le digan es una ruta para vaciarle el bucket a
 * otro. Aquí solo pasa lo que cumple **las tres cosas a la vez**:
 *
 * 1. La dirección empieza por el prefijo público de NUESTRO bucket. Cualquier
 *    otra cosa —otro dominio, otro bucket— no se mira siquiera.
 * 2. La llave tiene la forma exacta que escribe `/api/upload`:
 *    `userID/workflowID/fichero`, tres trozos y ni uno más. Sin esto, un `..`
 *    o una llave más profunda podría salirse de la carpeta.
 * 3. Ese `userID` es una cuenta sobre la que quien llama manda
 *    (`assertCanAccessTargetUser`). Es la misma puerta que la subida, y es la
 *    que impide borrar en la carpeta de otro.
 *
 * Y **no confía solo en el middleware**: el middleware se pudo saltar (H02) y
 * volverá a poder. Comprueba la sesión por su cuenta.
 */
export async function POST(req: Request) {
    const quien = await currentUser();
    if (!quien) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const cuerpo = await req.json().catch(() => null);
    const url = typeof cuerpo?.url === 'string' ? cuerpo.url : '';
    if (!url) {
        return NextResponse.json({ error: 'Falta la dirección del archivo.' }, { status: 400 });
    }

    const bucketName = process.env.S3_BUCKET_NAME || 'verzay-media';
    // Qué se deja borrar lo decide `llaveDelArchivoSubido`, que es pura y está
    // probada aparte: es lo único que separa «borrar un archivo mío» de
    // «vaciarle el bucket a otro».
    const destino = llaveDelArchivoSubido(url, process.env.S3_PUBLIC_URL, bucketName);
    if (!destino) {
        return NextResponse.json(
            { error: 'Esa dirección no es de un archivo que se pueda borrar.' },
            { status: 400 },
        );
    }
    const { llave, userID } = destino;

    try {
        await assertCanAccessTargetUser(userID);
    } catch {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    }

    try {
        await minioClient.removeObject(bucketName, llave);
        return NextResponse.json({ ok: true });
    } catch (error) {
        // No puede tumbar nada: quien llama está cancelando un diálogo y eso
        // tiene que cerrarse igual. Pero tampoco es mudo — un archivo que se
        // queda en el bucket sin decirlo es espacio que nadie sabe de dónde
        // salió.
        console.warn('[upload] no se pudo borrar el archivo del bucket', {
            llave,
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: 'No se pudo borrar el archivo.' }, { status: 500 });
    }
}
