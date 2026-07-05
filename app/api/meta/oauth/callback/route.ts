export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Meta conectado</title>
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 24px;">
    <p>Conexión autorizada. Puedes cerrar esta ventana.</p>
  </body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}
