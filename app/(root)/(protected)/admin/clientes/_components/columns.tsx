'use client'

import { ColumnDef } from '@tanstack/react-table'
import { UserActionsMenu } from './user-actions-menu'
import { DialogType } from './clients-manager'
import { ClientInterface } from '@/lib/types'
import { StatusCell } from '@/components/StatusCell'
import { ArrowUpDown } from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { Button } from '@/components/ui/button'
import { Row } from '@tanstack/react-table'

const resellerFilterFn = (row: Row<any>, columnId: string, filterValue: string) => {
  const resellerName = row.original.reseller?.company?.toLowerCase() ?? ''
  return resellerName.includes(filterValue.toLowerCase())
};

const renderFeatureBadge = (enabled: boolean) => (
  <Badge
    variant="outline"
    className={enabled ? "border-emerald-200 text-emerald-700" : "border-rose-200 text-rose-700"}
  >
    {enabled ? "Activo" : "Inactivo"}
  </Badge>
);

export const getColumns = (openDialogGetUserId: (userId: string, dialog: DialogType, state: boolean) => void, currentUserRol: string): ColumnDef<ClientInterface>[] => [
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Estado
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <StatusCell userStatus={row.original.status} />,
  },
  {
    accessorKey: 'role',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Rol
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Nombre
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Correo
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'company',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Empresa
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'reseller',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Marca
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    filterFn: resellerFilterFn, // Aquí se usa

    cell: ({ row }) => (
      row.original.reseller?.company ?? ''
    ),
  },
  {
    accessorKey: 'qrStatus',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        QR
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <StatusCell qrStatus={row.original.qrStatus} />,
  },
  {
    accessorKey: 'isEvoEnabled',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Agente
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <StatusCell isEvoEnabled={row.original.isEvoEnabled} />,
  },
  {
    accessorKey: 'enabledSynthesizer',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Sintetizador
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <StatusCell enabledSynthesizer={row.original.enabledSynthesizer} />,
  },
  {
    accessorKey: 'enabledLeadStatusClassifier',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Lead status
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => renderFeatureBadge(row.original.enabledLeadStatusClassifier),
  },
  {
    accessorKey: 'enabledCrmFollowUps',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm"
      >
        Follow-ups IA
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => renderFeatureBadge(row.original.enabledCrmFollowUps),
  },
  // {
  //   accessorKey: 'messagePause',
  //   header: 'Frase',
  //   cell: ({ row }) => (
  //     <span className="italic text-muted-foreground text-sm">
  //       {row.original.pausar.filter(pausas => pausas.tipo === 'abrir')[0]?.mensaje || '—'}
  //     </span>
  //   ),
  // },
  // {
  //   accessorKey: 'webhookUrl',
  //   header: ({ column }) => (
  //     <Button
  //       variant="ghost"
  //       onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
  //       className="text-sm"
  //     >
  //       Webhook
  //       <ArrowUpDown className="ml-2 h-4 w-4" />
  //     </Button>
  //   ),
  //   cell: ({ row }) => {
  //     const url = row.original.webhookUrl;

  //     if (/https:\/\/n8n-?pro\.verzay\.co\/webhook\//.test(url ?? "")) {
  //       return <Badge className="bg-green-600 text-white">Avanzado</Badge>;
  //     }

  //     if (url?.startsWith("http://82.29.152.30:5001/webhook")) {
  //       return <Badge className="bg-blue-500 text-white">Estándar</Badge>;
  //     }

  //     return <Badge variant="outline">—</Badge>;
  //   },
  // },
  // {
  //   accessorKey: 'credits',
  //   header: ({ column }) => (
  //     <Button
  //       variant="ghost"
  //       onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
  //       className="text-sm"
  //     >
  //       Créditos
  //       <ArrowUpDown className="ml-2 h-4 w-4" />
  //     </Button>
  //   ),
  //   cell: ({ row }) => (
  //     row.original.credits?.total ?? '0'
  //   ),
  // },
  {
    id: 'acciones',
    enableHiding: false,
    cell: ({ row }) => (
      <UserActionsMenu
        currentUserRol={currentUserRol}
        user={row.original}
        openDialogGetUserId={openDialogGetUserId}
      />
    )
  }
]
