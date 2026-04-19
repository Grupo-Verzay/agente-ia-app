export function denormalizeBusiness(sections: any) {
    // seguro contra shape parcial
    const business = sections?.business ?? {};
    return {
        businessName: (business?.nombre ?? "").trim() || null,
        businessSector: (business?.sector ?? "").trim() || null,
    };
}