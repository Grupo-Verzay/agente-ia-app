import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

function NotFoundPage () {
  return (
    <div className='flex flex-col items-center justify-center min-h-screen p-4'>
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-4">Pagina No Encontrada.</h2>
        <p className="text-muted-foreground mb-8 max-w-md ">No te preocupes, incluso los mejores datos a veces se pierden en Internet.</p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link 
                href={"/"} 
                className='flex items-center justify-center
                px-4 py-2 bg-primary text-white rounded-md hover:bg:primary/80 transition-colors'>
                <ArrowLeft className='w-4 h-4 mr-2'/>
                Volver al Dashboard
            </Link>
        </div>
      </div>
      <div className="mt-12 text-center">
        <p className='text-sm text-muted-foreground'>Por favor valida el error o pongase en contacto con el equipo de soporte.</p>
      </div>
    </div>
  )
}

export default NotFoundPage
