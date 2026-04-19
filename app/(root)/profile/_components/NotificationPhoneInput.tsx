// components/custom/NotificationPhoneInput.tsx
'use client';

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Country, CountryCodeSelect } from "@/components/custom/CountryCodeSelect";

export const NotificationPhoneInput = ({
    value,
    countries,
    onChange,
    onBlur,
    disabled,
}: {
    value: string;
    countries: Country[];
    onChange: (val: string) => void;
    onBlur?: () => void;
    disabled?: boolean;
}) => {
    const [countryCode, setCountryCode] = useState<string>('57');
    const [localNumber, setLocalNumber] = useState('');

    // Separar valor inicial en código y número
    useEffect(() => {
        if (!value) return;
        const parts = value.trim().split(' ');
        if (parts.length >= 2) {
            const country = `+${parts[0]}`;
            const phone = parts.slice(1).join(' ');
            setCountryCode(country);
            setLocalNumber(phone);
        }
    }, [value]);

    const handleChange = (newCode: string, number: string) => {
        const full = `${newCode} ${number}`;
        const normalize = full.split('+')[1];

        onChange(normalize);
    };

    return (
        <div className="space-y-2">
            <Label className="text-muted-foreground">Número de notificación</Label>
            <div className="flex gap-2">
                <>
                    <CountryCodeSelect
                        countries={countries}
                        defaultValue={countryCode}
                        onChange={(code) => {
                            setCountryCode(code);
                            handleChange(code, localNumber);
                        }}
                        disabled={disabled}
                    />
                    <Input
                        type="tel"
                        value={localNumber}
                        onChange={(e) => {
                            setLocalNumber(e.target.value);
                            handleChange(countryCode, e.target.value);
                        }}
                        onBlur={onBlur}
                        disabled={disabled}
                        className="bg-background border-border focus-visible:ring-2 focus-visible:ring-primary"
                    />
                </>
            </div>
        </div>
    );
};
