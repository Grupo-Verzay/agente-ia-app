'use client'

import { PromptTemplate, Role } from '@prisma/client'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, Pencil, Trash2 } from 'lucide-react'

interface TemplateListProps {
    templates: PromptTemplate[]
    onEdit: (template: PromptTemplate) => void
    onDelete: (idTemplate: string) => void
    userRole: Role
}

export const TemplateList = ({ templates, onEdit, userRole, onDelete }: TemplateListProps) => {
    if (!templates.length) {
        return (
            <p className="text-muted-foreground text-center mt-6">
                No hay plantillas registradas.
            </p>
        )
    }

    return (
        <>
            {templates.map((template) => (
                <Card
                    key={template.id}
                    className="flex flex-col border-border transition-all duration-300 hover:shadow-lg hover:scale-[1.015] hover:border-primary w-64">
                    <CardHeader>
                        <CardTitle>{template.name}</CardTitle>
                    </CardHeader>

                    <CardContent className="flex flex-1 justify-stretch items-center">
                        <div className="text-sm text-muted-foreground">
                            <strong>Categoría:</strong> {template.category || 'No definida'}
                            {/* <br />
                            <strong>Estado:</strong> {template.isActive ? 'Activa' : 'Inactiva'} */}
                        </div>
                    </CardContent>

                    <CardFooter className="flex mt-auto gap-2">
                        <>
                            {template.content ? (
                                <Button
                                    className="w-full"
                                    onClick={() => window.open(template.content, "_blank")}
                                    rel="noopener noreferrer"
                                >
                                   {(userRole === 'admin' || userRole === 'super_admin') ? <Eye /> : 'Ver'}
                                </Button>
                            ) : (
                                <p className="text-muted-foreground">Sin descripción.</p>
                            )}
                        </>
                        {
                            (userRole === 'admin' || userRole === 'super_admin') &&
                            <>
                                <Button
                                    variant="secondary"
                                    className="w-full"
                                    onClick={() => onEdit(template)}
                                >
                                    <Pencil />
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={() => onDelete(template.id)}
                                >
                                    <Trash2 />
                                </Button>
                            </>
                        }
                    </CardFooter>
                </Card>
            ))}
        </>
    )
}
