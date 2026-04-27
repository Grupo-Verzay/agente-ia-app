'use client'

import { ColumnDef } from '@tanstack/react-table'
import { UserActionsMenu } from './user-actions-menu'
import { DialogType } from './clients-manager'
import { ClientInterface } from '@/lib/types'
import { StatusCell } from '@/components/StatusCell'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Row } from '@tanstack/react-table'

const resellerFilterFn = (row: Row<any>, columnId: string, filterValue: string) => {
  const resellerName = row.original.reseller?.company?.toLowerCase() ?? ''
  return resellerName.includes(filterValue.toLowerCase())
};

export const getColumns = (openDialogGetUserId: (userId: string, dialog: DialogType, state: boolean) => void, currentUserRol: string): ColumnDef<ClientInterface>[] => [
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Estado
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="flex justify-center"><StatusCell userStatus={row.original.status} /></div>,
  },
  {
    accessorKey: 'role',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Rol
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Nombre
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
  },
  {
    accessorKey: 'company',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Empresa
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Correo
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
  },
  {
    accessorKey: 'reseller',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Marca
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
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
        className="text-sm px-1"
      >
        QR
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="flex justify-center"><StatusCell qrStatus={row.original.qrStatus} /></div>,
  },
  {
    accessorKey: 'isEvoEnabled',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Agente
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="flex justify-center"><StatusCell isEvoEnabled={row.original.isEvoEnabled} /></div>,
  },
  {
    accessorKey: 'enabledSynthesizer',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Sintetizador
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="flex justify-center"><StatusCell enabledSynthesizer={row.original.enabledSynthesizer} /></div>,
  },
  {
    accessorKey: 'enabledLeadStatusClassifier',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Status
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="flex justify-center"><StatusCell enabledLeadStatusClassifier={row.original.enabledLeadStatusClassifier} /></div>,
  },
  {
    accessorKey: 'enabledCrmFollowUps',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="text-sm px-1"
      >
        Follows
        <ArrowUpDown className="ml-0.5 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="flex justify-center"><StatusCell enabledCrmFollowUps={row.original.enabledCrmFollowUps} /></div>,
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
