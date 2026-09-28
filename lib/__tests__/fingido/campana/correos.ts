// Los correos sin leer, fingidos. El banco decide el número con
// `window.__correosSinLeer` (número o `null`, «algún buzón no contestó»).
export async function correosSinLeerAction() {
    const w = window as any;
    const sinLeer = "__correosSinLeer" in w ? w.__correosSinLeer : 7;
    return { success: true, sinLeer };
}
