import * as XLSX from 'xlsx'
import { toast } from 'sonner'

interface ExportToExcelOptions {
    data?: [] | null
    filename?: string
    sheetName?: string
}

export const exportToExcel = ({ data, filename = 'export.xlsx', sheetName = 'Hoja1' }: ExportToExcelOptions) => {
    // if (!data || !Array.isArray(data) || data.length === 0) {
    //     toast.error('No hay datos para exportar.')
    //     return
    // }

    const table = document.querySelector("table") // O usa un selector más específico si hay varias tablas


    const toastId = 'excel-export'

    toast.loading('Procesando archivo Excel...', { id: toastId })

    try {
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
