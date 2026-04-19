'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SafeImage } from '@/components/custom/SafeImage';

type ExpenseRow = {
    id: string;
    occurredAt: string | Date;
    amount: any;
    currencyCode: string;
    title?: string | null;
    counterparty?: string | null;

    accountId: string;
    categoryId?: string | null;

    account?: { name: string } | null;
    category?: { name: string } | null;
    attachments?: { url: string }[];
};

function iso(d: string | Date) {
    const date = typeof d === 'string' ? new Date(d) : d;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

//  regla simple para “Fijo/Variable” (ajústala a tu negocio)
function expenseKind(categoryName?: string | null) {
    const fixed = new Set(['Nomina', 'Nómina', 'Salarios', 'Servidores', 'API', 'Herramientas']);
    if (!categoryName) return 'Variable';
    return fixed.has(categoryName) ? 'Fijo' : 'Variable';
}

export function buildExpenseColumns(opts: {
    onEdit: (row: ExpenseRow) => void;
    onDelete: (id: string) => void;
    busy?: boolean;
}): ColumnDef<ExpenseRow>[] {
    return [
        {
            id: 'name',
            accessorFn: (row) => row.counterparty || row.title || '',
            header: 'Nombre',
            cell: ({ row }) => {
                const original = row.original;
                const name = original.counterparty || original.title || '—';
                return <span className="truncate">{name}</span>;
            },
        },
        {
            id: 'tipo',
            header: 'Tipo de gasto',
            cell: ({ row }) => {
                const kind = expenseKind(row.original.category?.name ?? null);
                return (
                    <Badge variant="secondary" className="h-5 rounded-md px-2 text-[13px] font-medium">
                        {kind}
                    </Badge>
                );
            },
        },
        {
            id: 'conceptos',
            header: 'Conceptos',
            cell: ({ row }) => {
                const cat = row.original.category?.name || '—';
                return <span className="truncate">{cat}</span>;
            },
        },
        {
            id: 'total',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    className="h-8 px-2 text-sm"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                >
                    Total gasto
                    <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                </Button>
            ),
            cell: ({ row }) => {
                const amt = Number(row.original.amount);
                return (
                    <div className="text-right tabular-nums">
                        {isNaN(amt) ? '—' : amt.toFixed(2)} {row.original.currencyCode}
                    </div>
                );
            },
        },
        {
            id: 'fecha',
            header: 'Fecha de gasto',
            cell: ({ row }) => <span className="text-muted-foreground">{iso(row.original.occurredAt)}</span>,
        },
        {
            id: 'archivos',
            header: 'Archivos',
            cell: ({ row }) => {
                const atts = row.original.attachments || [];
                if (!atts.length) return <span className="text-muted-foreground">—</span>;

                // mini previews (hasta 2)
                const show = atts.slice(0, 2);
                return (
                    <div className="flex items-center gap-1">
                        {show.map((a, idx) => (
                            <SafeImage
                                key={idx}
                                src={a.url}
                                alt="support"
                                width={24}
                                height={24}
                                className="h-6 w-6 rounded-md border object-cover"
                            />
                        ))}
                        {atts.length > 2 ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">+{atts.length - 2}</span>
                        ) : null}
                    </div>
                );
            },
        },
        {
            id: 'cuenta',
            header: 'Cuenta',
            cell: ({ row }) => {
                const account = row.original.account?.name || '—';
                return <span className="truncate">{account}</span>;
            },
        },
        {
            id: 'actions',
            enableHiding: false,
            header: '',
            cell: ({ row }) => {
                const original = row.original;

                return (
                    <div className="flex justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0" disabled={opts.busy}>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        opts.onEdit(original);
                                    }}
                                >
                                    Editar
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        opts.onDelete(original.id);
                                    }}
                                >
                                    Eliminar
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
        },
    ];
}
