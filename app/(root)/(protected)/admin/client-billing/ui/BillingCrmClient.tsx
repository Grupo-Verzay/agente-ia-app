// app/(root)/(protected)/admin/ruta-para-listar-clientes-y-crm-pagos/ui/BillingCrmClient.tsx
"use client";

import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
    ColumnDef,
    SortingState,
    VisibilityState,
    ColumnFiltersState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";

import {
    Card,
    CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
} from "@/components/ui/table";

import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Ellipsis } from "lucide-react";

import {
    activateUserService,
    getUserBillingByUserId,
    markUserAsPaid,
    markUserAsUnpaid,
    setUserBillingDueDate,
    suspendUserService,
    toggleUserStatus,
    upsertUserBillingConfig,
} from "@/actions/billing/billing-actions";

import {
    ClientRow,
    EditDialogState,
    emptyDialog,
    ResponseFormat,
    SOON_DAYS_BILLING,
    UserBilling,
} from "@/types/billing";

import { fmtDateShort, money } from "@/actions/billing/helpers/billing-helpers";
import { COLUMNS_LABELS, daysLeftService, exportExcelAllFiltered, getExportValue, StatusBadgeAccess, StatusBadgePaid } from "../helpers";
import { BillingCrmFiltersCards, BillingSkeletton, DaysLeftCell } from "../components";
import { useBillingLifecyclePreview } from "../hooks/useBillingLifecyclePreview";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BILLING_COLUMN_FILTERS_STORAGE_KEY = "billing-crm-column-filters";
const BILLING_COLUMN_VISIBILITY_STORAGE_KEY = "billing-crm-column-visibility";

function getDaysRemaining(dueDate?: string | Date | null) {
    const daysRemaining = Number.parseInt(daysLeftService(dueDate ?? null), 10);
    return Number.isFinite(daysRemaining) ? daysRemaining : null;
}

export function BillingCrmClient({
    initial,
}: {
    initial: ResponseFormat<ClientRow[]>;
}) {
    const [data, setData] = useState<ClientRow[]>(initial.data ?? []);
    const [dialog, setDialog] = useState<EditDialogState>(emptyDialog);

    // DataTable state (shadcn style)
    const [globalFilter, setGlobalFilter] = useState("");
    const [sorting, setSorting] = useState<SortingState>([
        { id: "daysLeft", desc: false },
    ]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = useState({})
    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 9,
    });
    const [hasLoadedPersistedFilters, setHasLoadedPersistedFilters] = useState(false);
    const billingLifecyclePreview = useBillingLifecyclePreview(
        dialog.form.dueDate,
        dialog.form.graceDays
    );

    React.useEffect(() => {
        if (typeof window === "undefined") return;

        try {
            const rawColumnFilters = localStorage.getItem(BILLING_COLUMN_FILTERS_STORAGE_KEY);
            if (rawColumnFilters) {
                const parsedColumnFilters = JSON.parse(rawColumnFilters);
                if (Array.isArray(parsedColumnFilters)) {
                    setColumnFilters(parsedColumnFilters);
                }
            }

            const rawColumnVisibility = localStorage.getItem(BILLING_COLUMN_VISIBILITY_STORAGE_KEY);
            if (rawColumnVisibility) {
                const parsedColumnVisibility = JSON.parse(rawColumnVisibility);
                if (
                    parsedColumnVisibility &&
                    typeof parsedColumnVisibility === "object" &&
                    !Array.isArray(parsedColumnVisibility)
                ) {
                    setColumnVisibility(parsedColumnVisibility);
                }
            }
        } catch {
            // ignore corrupted localStorage payloads
        } finally {
            setHasLoadedPersistedFilters(true);
        }
    }, []);

    React.useEffect(() => {
        if (typeof window === "undefined" || !hasLoadedPersistedFilters) return;

        try {
            localStorage.setItem(
                BILLING_COLUMN_FILTERS_STORAGE_KEY,
                JSON.stringify(columnFilters)
            );
        } catch {
            // localStorage may be unavailable
        }
    }, [columnFilters, hasLoadedPersistedFilters]);

    React.useEffect(() => {
        if (typeof window === "undefined" || !hasLoadedPersistedFilters) return;

        try {
            localStorage.setItem(
                BILLING_COLUMN_VISIBILITY_STORAGE_KEY,
                JSON.stringify(columnVisibility)
            );
        } catch {
            // localStorage may be unavailable
        }
    }, [columnVisibility, hasLoadedPersistedFilters]);



    const refreshBillingForUser = useCallback(async (userId: string) => {
        const res = await getUserBillingByUserId(userId);
        if (!res.success) {
            toast.error(res.message);
            return;
        }

        setData((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, billing: res.data ?? null } : u))
        );
    }, []);

    const canSave = (() => {
        if (!dialog.open) return false;
        if (dialog.loading) return false;
        if (!dialog.user) return false;
        if (!dialog.original) return true;
        return hasChanges(dialog.form, dialog.original);
    })();

    const handleMarkPaid = useCallback(async (userId: string) => {
        const res = await markUserAsPaid(userId);
        if (!res.success) return toast.error(res.message);
        toast.success(res.message);
        await refreshBillingForUser(userId);
    }, [refreshBillingForUser]);

    const handleMarkUnpaid = useCallback(async (userId: string) => {
        const res = await markUserAsUnpaid(userId);
        if (!res.success) return toast.error(res.message);
        toast.success(res.message);
        await refreshBillingForUser(userId);
    }, [refreshBillingForUser]);

    const handleSuspend = useCallback(async (userId: string) => {
        const res = await suspendUserService(userId, "Vencido sin pago");
        if (!res.success) return toast.error(res.message);
        toast.success(res.message);
        await refreshBillingForUser(userId);
    }, [refreshBillingForUser]);

    const handleActivate = useCallback(async (userId: string) => {
        const res = await activateUserService(userId);
        if (!res.success) return toast.error(res.message);
        toast.success(res.message);
        await refreshBillingForUser(userId);
    }, [refreshBillingForUser]);

    const handleToggleStatus = useCallback(async (userId: string, enable: boolean) => {
        setData((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, status: enable } : u))
        );
        const res = await toggleUserStatus(userId, enable);
        if (!res.success) {
            toast.error(res.message);
            setData((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, status: !enable } : u))
            );
            return;
        }
        toast.success(res.message);
    }, []);

    const openEdit = useCallback(async (u: ClientRow) => {
        setDialog((s) => ({ ...s, open: true, user: u, loading: true }));

        const res = await getUserBillingByUserId(u.id);

        await sleep(600);

        if (!res.success) {
            toast.error(res.message);
            setDialog((s) => ({ ...s, loading: false }));
            return;
        }

        const b: UserBilling | null = res.data ?? null;

        const original = {
            dueDate: b?.dueDate ? fmtDateShort(b.dueDate) : "",
            price: b?.price ?? "",
            currencyCode: b?.currencyCode ?? "COP",
            paymentMethodLabel: b?.paymentMethodLabel ?? "",
            paymentNotes: b?.paymentNotes ?? "",
            graceDays: String(b?.graceDays ?? 0),
            licenseDays: String(b?.licenseDays ?? 30),
            serviceName: b?.serviceName ?? "",
            notifyRemoteJid: b?.notifyRemoteJid ?? "",
            serviceStartAt: b?.serviceStartAt ? fmtDateShort(b.serviceStartAt) : "",
            serviceEndsAt: b?.serviceEndsAt ? fmtDateShort(b.serviceEndsAt) : "",
        };

        setDialog({
            open: true,
            user: u,
            loading: false,
            form: original,
            original,
        });
    }, []);

    function normalizeEditForm(f: any) {
        return {
            dueDate: (f?.dueDate ?? "").trim(),
            price: String(f?.price ?? "").trim(),
            currencyCode: (f?.currencyCode ?? "COP").trim(),
            paymentMethodLabel: (f?.paymentMethodLabel ?? "").trim(),
            paymentNotes: (f?.paymentNotes ?? "").trim(),
            graceDays: String(f?.graceDays ?? "0").trim(),
            licenseDays: String(f?.licenseDays ?? "30").trim(),
            serviceName: (f?.serviceName ?? "").trim(),
            notifyRemoteJid: (f?.notifyRemoteJid ?? "").trim(),
            serviceStartAt: (f?.serviceStartAt ?? "").trim(),
            serviceEndsAt: (f?.serviceEndsAt ?? "").trim(),
        };
    }

    function hasChanges(current: any, original: any) {
        const a = normalizeEditForm(current);
        const b = normalizeEditForm(original);
        return JSON.stringify(a) !== JSON.stringify(b);
    }

    async function saveEdit() {
        const u = dialog.user;
        if (!u) return;

        const original = dialog.original ?? null;

        if (original && !hasChanges(dialog.form, original)) {
            toast.message("No hay cambios para guardar.");
            setDialog((s) => ({ ...s, loading: false }));
            return;
        }

        try {
            setDialog((s) => ({ ...s, loading: true }));
            let saveMessage = "Pagos actualizados.";

            // Solo actualiza config si cambio algo del config (sin contar dueDate)
            const curr = normalizeEditForm(dialog.form);
            const prev = original ? normalizeEditForm(original) : null;

            const configChanged =
                !prev ||
                curr.price !== prev.price ||
                curr.currencyCode !== prev.currencyCode ||
                curr.paymentMethodLabel !== prev.paymentMethodLabel ||
                curr.paymentNotes !== prev.paymentNotes ||
                curr.graceDays !== prev.graceDays ||
                curr.licenseDays !== prev.licenseDays ||
                curr.serviceName !== prev.serviceName ||
                curr.notifyRemoteJid !== prev.notifyRemoteJid ||
                curr.serviceStartAt !== prev.serviceStartAt ||
                curr.serviceEndsAt !== prev.serviceEndsAt;

            const dueChanged = !prev || curr.dueDate !== prev.dueDate;

            if (configChanged) {
                const cfg = await upsertUserBillingConfig({
                    userId: u.id,
                    price: curr.price || null,
                    currencyCode: curr.currencyCode || "COP",
                    paymentMethodLabel: curr.paymentMethodLabel || null,
                    paymentNotes: curr.paymentNotes || null,
                    graceDays: Number(curr.graceDays || 0),
                    licenseDays: Number(curr.licenseDays || 30),
                    serviceName: curr.serviceName || null,
                    notifyRemoteJid: curr.notifyRemoteJid || null,
                    serviceStartAt: curr.serviceStartAt || null,
                    serviceEndsAt: curr.serviceEndsAt || null,
                });

                if (!cfg.success) {
                    toast.error(cfg.message);
                    setDialog((s) => ({ ...s, loading: false }));
                    return;
                }
            }

            if (dueChanged) {
                if (curr.dueDate) {
                    const parsedDue = new Date(`${curr.dueDate}T00:00:00`);
                    if (Number.isNaN(parsedDue.getTime())) {
                        toast.error("La fecha de pago no es valida.");
                        setDialog((s) => ({ ...s, loading: false }));
                        return;
                    }
                }

                const due = curr.dueDate ? curr.dueDate : null;
                const dueRes = await setUserBillingDueDate(u.id, due);

                if (!dueRes.success) {
                    toast.error(dueRes.message);
                    setDialog((s) => ({ ...s, loading: false }));
                    return;
                }

                if (dueRes.message) saveMessage = dueRes.message;
            }

            toast.success(saveMessage);
            await refreshBillingForUser(u.id);
            setDialog(emptyDialog);
        } catch (e: any) {
            console.error("[saveEdit]", e);
            toast.error("Error guardando cambios.");
            setDialog((s) => ({ ...s, loading: false }));
        }
    }

    const columns = useMemo<ColumnDef<ClientRow>[]>(() => {
        const sortableHeader = (title: string) => {
            const Header = ({ column }: any) => (
                <Button
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    {title}
                    <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                </Button>
            );

            Header.displayName = `SortableHeader(${title})`;
            return Header;
        };

        return [
            {
                id: "userStatus",
                header: "Usuario",
                enableSorting: false,
                cell: ({ row }) => {
                    const u = row.original;
                    return (
                        <Switch
                            checked={u.status}
                            onCheckedChange={(checked) => handleToggleStatus(u.id, checked)}
                        />
                    );
                },
            },
            {
                id: "service",
                header: sortableHeader("Servicio"),
                accessorFn: (row) => row.billing?.serviceName ?? "",
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return <div className="py-2">{b?.serviceName ?? "—"}</div>;
                },
            },
            {
                id: "notify",
                header: sortableHeader("Notificación"),
                accessorFn: (row) =>
                    row.billing?.notifyRemoteJid ?? row.notificationNumber ?? "",
                cell: ({ row }) => {
                    const u = row.original;
                    const b = u.billing ?? null;
                    return (
                        <div className="py-2 truncate max-w-[160px]">
                            {b?.notifyRemoteJid ?? u.notificationNumber ?? "—"}
                        </div>
                    );
                },
            },
            {
                id: "start",
                header: sortableHeader("Inicio"),
                accessorFn: (row) => row.billing?.serviceStartAt ?? null,
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return (
                        <div className="py-2">
                            {fmtDateShort(b?.serviceStartAt ?? null)}
                        </div>
                    );
                },
            },
            {
                id: "due",
                header: sortableHeader("Vence"),
                accessorFn: (row) => row.billing?.dueDate ?? null,
                filterFn: (row, _columnId, filterValue) => {
                    if (filterValue !== "SOON") return true;

                    const b = row.original.billing ?? null;
                    const due = b?.dueDate ?? null;

                    const left = parseInt(daysLeftService(due));
                    if (!Number.isFinite(left)) return false;

                    return left >= 0 && left <= SOON_DAYS_BILLING;
                },
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return <div className="py-2">{fmtDateShort(b?.dueDate ?? null)}</div>;
                },
            },
            {
                id: "daysLeft",
                header: sortableHeader("Días restantes"),
                accessorFn: (row) =>
                    getDaysRemaining(row.billing?.dueDate ?? null) ?? Number.MAX_SAFE_INTEGER,
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    const dueDate = getDaysRemaining(b?.dueDate ?? null);
                    return (
                        <div className="py-2">
                            <DaysLeftCell dueDate={dueDate} />
                        </div>
                    );
                },
            },
            {
                id: "client",
                header: sortableHeader("Cliente"),
                accessorFn: (row) =>
                    `${row.name ?? ""} ${row.email ?? ""} ${row.company ?? ""} ${row.plan ?? ""}`,
                cell: ({ row }) => {
                    const u = row.original;
                    return (
                        <div className="py-2">
                            <div className="leading-tight">
                                <div className="font-medium truncate max-w-[260px]">
                                    {u.name ?? "Sin nombre"}
                                </div>
                                <div className="text-muted-foreground truncate max-w-[260px]">
                                    {u.email}
                                </div>
                            </div>
                        </div>
                    );
                },
            },
            {
                id: "price",
                header: sortableHeader("Precio"),
                accessorFn: (row) => Number(row.billing?.price ?? 0),
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return (
                        <div className="py-2">
                            {money(b?.price ?? null, b?.currencyCode ?? "COP")}
                        </div>
                    );
                },
            },
            {
                id: "method",
                header: sortableHeader("Medio"),
                accessorFn: (row) => row.billing?.paymentMethodLabel ?? "",
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return (
                        <div className="py-2 truncate max-w-[180px]">
                            {b?.paymentMethodLabel ?? "—"}
                        </div>
                    );
                },
            },
            {
                id: "licenseDays",
                header: sortableHeader("Licencia"),
                accessorFn: (row) => row.billing?.licenseDays ?? "",
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return (
                        <div className="py-2 truncate">
                            {b?.licenseDays ?? "—"}
                        </div>
                    );
                },
            },
            {
                id: "paid",
                header: "Pago",
                accessorFn: (row) => row.billing?.billingStatus ?? "UNPAID",
                filterFn: (row, columnId, filterValue) => {
                    if (!filterValue) return true;
                    return String(row.getValue(columnId)) === String(filterValue);
                },
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return (
                        <div className="py-2">
                            {StatusBadgePaid(b?.billingStatus ?? "UNPAID")}
                        </div>
                    );
                },
            },
            {
                id: "access",
                header: "Acceso",
                accessorFn: (row) => row.billing?.accessStatus ?? "ACTIVE",
                filterFn: (row, columnId, filterValue) => {
                    if (!filterValue) return true;
                    return String(row.getValue(columnId)) === String(filterValue);
                },
                cell: ({ row }) => {
                    const b = row.original.billing ?? null;
                    return (
                        <div className="py-2">
                            {StatusBadgeAccess(b?.accessStatus ?? "ACTIVE")}
                        </div>
                    );
                },
            },
            {
                id: "actions",
                header: () => <div className="text-right">Acciones</div>,
                enableSorting: false,
                enableHiding: false,
                cell: ({ row }) => {
                    const u = row.original;
                    return (
                        <div className="py-2 flex justify-end">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <Ellipsis className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>

                                    <DropdownMenuItem onClick={() => openEdit(u)}>
                                        Editar pagos
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={() => handleMarkPaid(u.id)}>
                                        Marcar pagó
                                    </DropdownMenuItem>

                                    <DropdownMenuItem onClick={() => handleMarkUnpaid(u.id)}>
                                        Marcar no pagó
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={() => handleSuspend(u.id)}>
                                        Suspender servicio
                                    </DropdownMenuItem>

                                    <DropdownMenuItem onClick={() => handleActivate(u.id)}>
                                        Activar servicio
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                },
            },
        ];
    }, [openEdit, handleMarkPaid, handleMarkUnpaid, handleSuspend, handleActivate, handleToggleStatus]);

    const globalFilterFn = React.useCallback(
        (row: any, _columnId: string, filterValue: string) => {
            const term = String(filterValue ?? "").trim().toLowerCase();
            if (!term) return true;

            const u: ClientRow = row.original;
            const b = u.billing ?? null;

            const haystack = [
                u.name ?? "",
                u.email ?? "",
                u.company ?? "",
                u.plan ?? "",
                b?.serviceName ?? "",
                b?.notifyRemoteJid ?? "",
                u.notificationNumber ?? "",
                b?.paymentMethodLabel ?? "",
                b?.paymentNotes ?? "",
                b?.currencyCode ?? "",
                b?.billingStatus ?? "",
                b?.accessStatus ?? "",
            ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(term);
        },
        []
    );

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            columnVisibility,
            columnFilters,
            globalFilter,
            rowSelection,
            pagination
        },
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onRowSelectionChange: setRowSelection,
        globalFilterFn,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    return (
        <div className="flex flex-col h-full gap-2">
            {/* Header fijo */}
            <div className="sticky top-0 z-1">
                <div className="flex justify-between items-center gap-2">
                    <div className="flex flex-row flex-1 gap-2">
                        <div className="flex flex-col gap-2 flex-1">
                            <BillingCrmFiltersCards table={table} data={data} soonDays={SOON_DAYS_BILLING} />
                            <div className="flex flex-row gap-1">
                                <Input
                                    value={globalFilter}
                                    onChange={(e) => setGlobalFilter(e.target.value)}
                                    placeholder="Buscar por nombre, email, empresa, plan…"
                                    className="h-9"
                                />

                                {/* Filtros columnas */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="ml-auto">
                                            <Ellipsis className="h-4 w-4 md:hidden" />
                                            <span className="hidden md:inline">Filtrar</span>
                                            <ChevronDown className="ml-2 h-4 w-4 hidden md:inline" />
                                        </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent align="end">
                                        {table
                                            .getAllColumns()
                                            .filter((column) => column.getCanHide())
                                            .map((column) => {
                                                return (
                                                    <DropdownMenuCheckboxItem
                                                        key={column.id}
                                                        checked={column.getIsVisible()}
                                                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                                    >
                                                        {COLUMNS_LABELS[column.id] || column.id}
                                                    </DropdownMenuCheckboxItem>
                                                );
                                            })}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Table actions */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="ml-auto">
                                            <Ellipsis />
                                        </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                        <DropdownMenuSeparator />

                                        <DropdownMenuItem onClick={() => exportExcelAllFiltered(table)}>
                                            Exportar Excel
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            {/* Scroll interno para el content */}
            <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 gap-4">
                    <Card className="border-border">
                        <CardContent>
                            <Table className="w-full border-border table-auto">
                                <TableHeader>
                                    {table.getHeaderGroups().map((hg) => (
                                        <TableRow key={hg.id} className="border-border">
                                            {hg.headers.map((header) => (
                                                <TableHead key={header.id}>
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(header.column.columnDef.header, header.getContext())}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableHeader>

                                <TableBody>
                                    {table.getRowModel().rows?.length ? (
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id} className="h-10 border-border">
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id} className="py-0 align-middle">
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={table.getAllColumns().length}
                                                className="py-6 text-center"
                                            >
                                                No hay resultados.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            <div className="mt-3 flex items-center justify-between gap-2">
                                <div className="text-xs text-muted-foreground">
                                    Mostrando{" "}
                                    <b>{table.getRowModel().rows.length}</b> de{" "}
                                    <b>{table.getFilteredRowModel().rows.length}</b> resultados
                                </div>

                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => table.setPageIndex(0)}
                                        disabled={!table.getCanPreviousPage()}
                                    >
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => table.previousPage()}
                                        disabled={!table.getCanPreviousPage()}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>

                                    <div className="px-2 text-xs">
                                        Página <b>{table.getState().pagination.pageIndex + 1}</b> /{" "}
                                        <b>{table.getPageCount()}</b>
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => table.nextPage()}
                                        disabled={!table.getCanNextPage()}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                                        disabled={!table.getCanNextPage()}
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <Dialog
                                open={dialog.open}
                                onOpenChange={(open) => setDialog((s) => (open ? s : emptyDialog))}
                            >
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Editar pagos</DialogTitle>
                                        <DialogDescription>
                                            Configura precio, medio y fecha de vencimiento.
                                        </DialogDescription>
                                    </DialogHeader>

                                    {dialog.loading ? (
                                        <BillingSkeletton />
                                    ) : (
                                        <ScrollArea className="max-h-[75vh] pr-3">
                                            <div className="grid gap-2 p-2">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="grid gap-1">
                                                        <label className="text-muted-foreground">Precio</label>
                                                        <Input
                                                            value={dialog.form.price}
                                                            onChange={(e) =>
                                                                setDialog((s) => ({
                                                                    ...s,
                                                                    form: { ...s.form, price: e.target.value },
                                                                }))
                                                            }
                                                            placeholder="Ej: 129000"
                                                            className="h-9"
                                                        />
                                                    </div>

                                                    <div className="grid gap-1">
                                                        <label className="text-muted-foreground">Moneda</label>
                                                        <Input
                                                            value={dialog.form.currencyCode}
                                                            onChange={(e) =>
                                                                setDialog((s) => ({
                                                                    ...s,
                                                                    form: { ...s.form, currencyCode: e.target.value },
                                                                }))
                                                            }
                                                            placeholder="COP"
                                                            className="h-9"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid gap-1">
                                                    <label className="text-muted-foreground">Metodo de pago</label>
                                                    <Input
                                                        value={dialog.form.paymentMethodLabel}
                                                        onChange={(e) =>
                                                            setDialog((s) => ({
                                                                ...s,
                                                                form: { ...s.form, paymentMethodLabel: e.target.value },
                                                            }))
                                                        }
                                                        placeholder="Ej: Transferencia / Nequi / Stripe"
                                                        className="h-9"
                                                    />
                                                </div>

                                                <div className="grid gap-1">
                                                    <label className="text-muted-foreground">
                                                        Medio de pago
                                                    </label>
                                                    <Input
                                                        value={dialog.form.paymentNotes}
                                                        onChange={(e) =>
                                                            setDialog((s) => ({
                                                                ...s,
                                                                form: { ...s.form, paymentNotes: e.target.value },
                                                            }))
                                                        }
                                                        placeholder="Ej: Cuenta, link, referencia, etc."
                                                        className="h-9"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="grid gap-1">
                                                        <label className="text-muted-foreground">Días de licencia</label>
                                                        <Input
                                                            value={dialog.form.licenseDays}
                                                            onChange={(e) =>
                                                                setDialog((s) => ({
                                                                    ...s,
                                                                    form: { ...s.form, licenseDays: e.target.value },
                                                                }))
                                                            }
                                                            placeholder="30"
                                                            className="h-9"
                                                        />
                                                    </div>

                                                    <div className="grid gap-1">
                                                        <label className="text-muted-foreground">Días de gracia</label>
                                                        <Input
                                                            value={dialog.form.graceDays}
                                                            onChange={(e) =>
                                                                setDialog((s) => ({
                                                                    ...s,
                                                                    form: { ...s.form, graceDays: e.target.value },
                                                                }))
                                                            }
                                                            placeholder="0"
                                                            className="h-9"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="mt-2 grid gap-3">
                                                    <div className="grid gap-1">
                                                        <label className="text-muted-foreground">Servicio</label>
                                                        <Input
                                                            value={dialog.form.serviceName}
                                                            onChange={(e) =>
                                                                setDialog((s) => ({
                                                                    ...s,
                                                                    form: { ...s.form, serviceName: e.target.value },
                                                                }))
                                                            }
                                                            placeholder="Ej: Agente IA / CRM / Licencia"
                                                            className="h-9"
                                                        />
                                                    </div>

                                                    <div className="grid gap-1">
                                                        <label className="text-muted-foreground">
                                                            Número notificación
                                                        </label>
                                                        <Input
                                                            value={dialog.form.notifyRemoteJid}
                                                            onChange={(e) =>
                                                                setDialog((s) => ({
                                                                    ...s,
                                                                    form: { ...s.form, notifyRemoteJid: e.target.value },
                                                                }))
                                                            }
                                                            placeholder="Si queda vacío, se usará el número del usuario."
                                                            className="h-9"
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="grid gap-1">
                                                            <label className="text-muted-foreground">Fecha inicio</label>
                                                            <Input
                                                                type="date"
                                                                value={dialog.form.serviceStartAt}
                                                                onChange={(e) =>
                                                                    setDialog((s) => ({
                                                                        ...s,
                                                                        form: { ...s.form, serviceStartAt: e.target.value },
                                                                    }))
                                                                }
                                                                className="h-9"
                                                            />
                                                        </div>

                                                        <div className="grid gap-1">
                                                            <label className="text-muted-foreground">
                                                                Fecha de pago (vence)
                                                            </label>
                                                            <Input
                                                                type="date"
                                                                value={dialog.form.dueDate}
                                                                onChange={(e) =>
                                                                    setDialog((s) => ({
                                                                        ...s,
                                                                        form: { ...s.form, dueDate: e.target.value },
                                                                    }))
                                                                }
                                                                className="h-9"
                                                            />
                                                            {/* <p className="text-[11px] text-muted-foreground">
                                                                {billingLifecyclePreview.summary}
                                                            </p> */}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </ScrollArea>
                                    )}

                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() => setDialog(emptyDialog)}
                                            disabled={!!dialog.loading}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button onClick={saveEdit} disabled={!canSave}>
                                            Guardar
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}



