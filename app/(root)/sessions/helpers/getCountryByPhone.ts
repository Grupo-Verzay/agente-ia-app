export const getCountryByPhone = (phoneNumber: string): string | null => {
    const match = phoneNumber.match(/^(\\d{1,3})/);
    return match ? match[1] : null;
};