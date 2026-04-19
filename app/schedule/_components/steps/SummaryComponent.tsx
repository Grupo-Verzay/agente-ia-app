import { formatDateLabel } from "../../helpers"
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button";
import { SummaryItem } from "../";
import { SummaryComponentInterface } from "@/types/schedule";

export const SummaryComponent = ({
  user,
  timezone,
  nameClient,
  areaCode,
  phone,
  loading,
  selectedService,
  selectedSlot,
  selectedDate,
  setStep,
  setOpenDialog,
}: SummaryComponentInterface) => {
  return (
    <Card className="border-muted/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Revisión y confirmación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <SummaryItem label="Servicio" value={user.services.find((s) => s.id === selectedService)?.name} />
          <SummaryItem
            label="Fecha y hora"
            value={
              selectedSlot
                ? `${formatDateLabel(selectedDate)} · ${format(
                  toZonedTime(new Date(selectedSlot.split("|")[0]), timezone),
                  "hh:mm a"
                )} (${timezone})`
                : "—"
            }
          />
          <SummaryItem label="Nombre" value={nameClient} />
          <SummaryItem label="Contacto" value={`${areaCode} ${phone}`} />
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="outline" onClick={() => setStep(2)}>
            Atrás
          </Button>
          <Button className="px-8" onClick={() => setOpenDialog(true)} disabled={loading}>
            {loading ? "Agendando..." : "Confirmar cita"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
