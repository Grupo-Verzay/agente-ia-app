import { sendingMessages } from "@/actions/sending-messages-actions";

export const testAPISendMessages = async () => {
    try {
        const url = 'https://evoapi.ia-app.com/message/sendText/Admin Verzay'
        const apikey = '55A68B7D-86A1-4028-B8CC-097904E5F9DB'
        // const remoteJid = '573107964105@s.whatsapp.net'
        const remoteJid = '18299360504@s.whatsapp.net'
        const text = '👋 ¡Hola **Usuario Verzay*!.* Tu reunión previa para el requerimiento del servicio ha sido agendada con éxito.\n\nTe estaremos contactando por este medio para recordarte la cita y atenderte puntualmente en la hora establecida.'
        const result = await sendingMessages({ url, apikey, remoteJid, text });
        if (result.success) alert(result.message);
        else alert(`No se pudo enviar el mensaje: ${result.message} ${remoteJid}`);

    } catch (error) {
        console.error("Error en notificación:", error);
        alert("Ocurrió un error al intentar notificar la cita.");
    }
};
