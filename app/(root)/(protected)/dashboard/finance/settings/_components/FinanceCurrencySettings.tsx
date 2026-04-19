'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

import { updatePreferredCurrencyCode } from '@/actions/finance-settings-actions';

type Currency = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
};

export default function FinanceCurrencySettings({
  currentCode,
  currencies,
}: {
  currentCode: string;
  currencies: Currency[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState(currentCode);

  const options = useMemo(() => {
    if (!currencies?.length) {
      return [
        { code: 'COP', name: 'Peso Colombiano', symbol: 'COP$', decimals: 2 },
        { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
      ];
    }
    return currencies;
  }, [currencies]);

  const onSave = () => {
    startTransition(async () => {
      const res = await updatePreferredCurrencyCode(code);
      if (!res?.success) {
        toast.error(res?.message ?? 'Error al guardar');
        return;
      }
      toast.success('Moneda guardada');
      router.refresh(); // clave
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Moneda preferida</Label>

        <Select value={code} onValueChange={setCode}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecciona una moneda" />
          </SelectTrigger>

          <SelectContent>
            {options.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.symbol})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={onSave}
        disabled={isPending || code === currentCode}
        className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
      >
        Guardar
      </Button>
    </div>
  );
}