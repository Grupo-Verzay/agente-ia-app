"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { UserFormValues, userSchema } from "@/schema/user";
import { ApiKey, Role } from "@prisma/client";
import {
    SelectGroup
} from "@radix-ui/react-select";
import { PLAN_LABELS, PLANS } from "@/types/plans";
import { toast } from "sonner";
import { Country } from "@/components/custom/CountryCodeSelect";
import { useState } from "react";
import { TimezoneCombobox } from "@/components/shared/TimezoneCombobox";

export const FormUser = ({ onSubmit, apikeys, countries }: { onSubmit: (values: UserFormValues) => void, apikeys: ApiKey[], countries: Country[] }) => {

    const ROLES = Object.values(Role);
    const ROLE_LABELS: Record<Role, string> = {
        user: 'Usuario',
        admin: 'Administrador',
        reseller: 'Reseller',
        super_admin: 'Super administrador',
    };

    // const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "SERVER_TIME_ZONE";

    const form = useForm<UserFormValues>({
        resolver: zodResolver(userSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            company: "",
            timezone: "",
            notificationNumber: "",
            role: "user",
            plan: "basico",
            apiKeyId: "",
        },
    });

    const onError = (errors: typeof form.formState.errors) => {
        const messages = Object.values(errors).map(err => err?.message).filter(Boolean)
        toast.error("Revisa los campos obligatorios", {
            description: (
                <ul className="text-xs mt-2 space-y-1 list-disc list-inside">
                    {messages.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
            )
        })
    };

    return (
        <div className="p-2">
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-6 w-full">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre</FormLabel>
                            <FormControl><Input {...field} placeholder="Ej. Juan Pérez" /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Correo electrónico</FormLabel>
                            <FormControl><Input {...field} placeholder="usuario@correo.com" /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Contraseña</FormLabel>
                            <FormControl><Input type="password" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Empresa</FormLabel>
                            <FormControl><Input {...field} placeholder="Nombre de empresa" /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="notificationNumber"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Teléfono</FormLabel>
                            <FormControl><Input {...field} placeholder="573005214574" /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {form.formState.errors.notificationNumber && (
                    <p className="text-sm text-red-500">
                        {form.formState.errors.notificationNumber.message}
                    </p>
                )}

                <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Zona horaria</FormLabel>
                            <FormControl>
                                <TimezoneCombobox
                                    value={field.value}
                                    onChange={(v) => field.onChange(v)}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="delSeguimiento"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Frase de seguimiento</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="Ej. Estamos para servirle." />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="webhookUrl"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Webhook (n8n)</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="http://tu-ip:puerto/webhook" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="apiUrl"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>API Key (OpenAI)</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="https://api.openai.com/v1" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Rol</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Selecciona un rol" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectGroup>
                                        {ROLES.map(role => (
                                            <SelectItem key={role} value={role}>
                                                {ROLE_LABELS[role]}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="plan"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Plan</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Selecciona un rol" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectGroup>
                                        {PLANS.map(plan => (
                                            <SelectItem key={plan} value={plan}>
                                                {PLAN_LABELS[plan]}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="apiKeyId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Evo URL</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecciona una API Key" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {apikeys.map(({ id, url }) => (
                                        <SelectItem key={id} value={id}>
                                            {url}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full">Crear usuario</Button>
            </form>
        </Form>
        </div>
    );
}
