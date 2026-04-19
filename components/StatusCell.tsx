"use client"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BotIcon, PowerIcon, QrCodeIcon, UserIcon } from "lucide-react"
import { Button } from "./ui/button"

interface StatusCellProps {
  isEvoEnabled?: boolean
  qrStatus?: boolean
  enabledSynthesizer?: boolean
  userStatus?: boolean
}

export const StatusCell = ({ qrStatus, isEvoEnabled, enabledSynthesizer, userStatus }: StatusCellProps) => {
  const qrColor = qrStatus ? "text-red-600" : "text-green-600"
  const evoColor = isEvoEnabled ? "text-green-600" : "text-red-600"
  const synthesizerColor = enabledSynthesizer ? "text-green-600" : "text-red-600"

  const userColor = userStatus ? "text-green-600" : "text-red-600"

  const qrTooltip = qrStatus ? "QR desconectado" : "QR conectado"
  const evoTooltip = isEvoEnabled ? "Robot encendido" : "Robot apagado"
  const synthesizerTooltip = enabledSynthesizer ? "Encendido" : "Apagado"

  const userTooltip = userStatus ? "Usuario activo" : "Usuario inactivo"

  return (
    <>
      {qrStatus !== undefined && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={"outline"}>
              <QrCodeIcon className={`${qrColor} size-5`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{qrTooltip}</TooltipContent>
        </Tooltip>
      )}

      {isEvoEnabled !== undefined && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={"outline"}>
              <PowerIcon className={`${evoColor} size-5`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{evoTooltip}</TooltipContent>
        </Tooltip>
      )}

      {enabledSynthesizer !== undefined && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={"outline"}>
              <BotIcon className={`${synthesizerColor} size-5`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{synthesizerTooltip}</TooltipContent>
        </Tooltip>
      )}

      {userStatus !== undefined && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={"outline"}>
              <UserIcon className={`${userColor} size-5`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{userTooltip}</TooltipContent>
        </Tooltip>
      )}
    </>
  )
}