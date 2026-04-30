'use client'

import { ModuleForm } from './'
import { Button } from "@/components/ui/button"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormModuleValues } from '@/schema/module'
import { SubmitHandler } from 'react-hook-form'
import { X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ModuleCreator({ onSave, openModule = false, setOpenModule }: {
    onSave: SubmitHandler<FormModuleValues>;
    openModule: boolean
    setOpenModule: (state: boolean) => void
}) {

    return (
        <>
            <Button onClick={() => setOpenModule(true)}>
                Crear módulo
            </Button>
            <AnimatePresence>
                {openModule && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="w-full max-w-md p-2"
                        >
                            <Card className="relative shadow-2xl border-border rounded-md bg-background">
                                <CardHeader className="flex items-center justify-between flex-row">
                                    <CardTitle>
                                        {!openModule ? "Edición de módulo" : "Crear módulo"}
                                    </CardTitle>
                                    <p>
                                        Este formulario está diseñado para la gestión de módulos. Es de suma importancia que el modulo exista antes de ser creado aquí
                                    </p>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setOpenModule(false)}
                                    >
                                        <X className="w-5 h-5" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ScrollArea className="max-h-[70vh] overflow-y-auto">
                                        <ModuleForm onSubmit={onSave} />
                                    </ScrollArea>
                                </CardContent>
                                <CardFooter>
                                    <Button form="module-form" type="submit" className="w-full">Guardar módulo</Button>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    )
}