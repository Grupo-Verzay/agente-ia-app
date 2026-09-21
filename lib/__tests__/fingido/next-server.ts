// `next/server` arrastra medio Next dentro del paquete —su `ua-parser` usa
// `__dirname`, que no existe en un modulo ESM— por UNA sola cosa que esta ruta
// necesita: `NextResponse.json`. Aqui es exactamente eso y nada mas, y lo que
// devuelve es un `Response` de verdad, asi que el banco lee su `status` y su
// `json()` como los leeria el backend.
export const NextResponse = {
    json(cuerpo: unknown, init?: { status?: number }) {
        return new Response(JSON.stringify(cuerpo), {
            status: init?.status ?? 200,
            headers: { "content-type": "application/json" },
        });
    },
};
