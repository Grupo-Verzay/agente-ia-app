/** SMTP de mentira: apunta lo que se manda. `MailComposer` sigue siendo el de verdad. */
const g = globalThis as any;
export function createTransport(opciones: any) {
    return {
        async sendMail(mensaje: any) {
            (g.__smtpEnviados ??= []).push({ opciones, mensaje });
            return { messageId: "<banco@local>" };
        },
        async verify() {
            return true;
        },
    };
}
export default { createTransport };
