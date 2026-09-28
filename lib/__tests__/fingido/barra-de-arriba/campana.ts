// La campanita en el arnés de la barra: vacía, pero con la FORMA de verdad.
// Con la respuesta genérica de las acciones mudas (`data: []`) la campanita lee
// `res.data.items` y revienta el árbol entero, así que la barra no se pinta.
export const getNotificationCenterData = async () => ({
    success: true,
    data: { items: [], counts: {}, total: 0 },
});
