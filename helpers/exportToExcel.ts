import { toast } from 'sonner'

interface ExportToExcelOptions {
    data?: [] | null
    filename?: string
    sheetName?: string
}

// La librería de hojas de cálculo pesa unos 400 kB y solo hace falta al pulsar
// Exportar. Se pide en ese momento, no al abrir la pantalla: quien nunca exporta
// no la descarga nunca. El aviso de "Procesando" ya estaba, así que la espera de
// la descarga queda cubierta por él.
export const exportToExcel = async ({ data, filename = 'export.xlsx', sheetName = 'Hoja1' }: ExportToExcelOptions) => {
    // if (!data || !Array.isArray(data) || data.length === 0) {
    //     toast.error('No hay datos para exportar.')
    //     return
    // }

    const table = document.querySelector("table") // O usa un selector más específico si hay varias tablas


    const toastId = 'excel-export'

    toast.loading('Procesando archivo Excel...', { id: toastId })

    try {
        const XLSX = await import('xlsx')
        const worksheet = XLSX.utils.table_to_sheet(table)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        XLSX.writeFile(workbook, filename)

        toast.success('Archivo exportado correctamente.', { id: toastId })
    } catch (error) {
        console.error('Error al exportar a Excel:', error)
        toast.error('Ocurrió un error al exportar.', { id: toastId })
    }
}
