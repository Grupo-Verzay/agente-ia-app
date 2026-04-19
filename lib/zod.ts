import { object, string } from "zod";

export const loginSchema = object({
  email: string({ required_error: "Correo electronico requerido" }),
  // .min(1, "Correo electronico requerido")
  // .email("Correo electrónico no válido"),
  password: string({ required_error: "Password is required" })
    .min(1, "Contraseña es requerida")
    .min(6, "La contraseña debe tener más de 6 caracteres.")
    .max(32, "Password must be less than 32 characters"),
});

export const registerSchema = object({
  email: string({ required_error: "Correo electronico requerido" })
    .min(1, "Correo electronico requerido")
    .email("Correo electrónico no válido"),
  password: string({ required_error: "Password is required" })
    .min(1, "Contraseña es requerida")
    .min(6, "La contraseña debe tener más de 6 caracteres.")
    .max(32, "Password must be less than 32 characters"),
  name: string({ required_error: "Name is required" })
    .min(1, "Name is required")
    .max(32, "Name must be less than 32 characters"),
});

export const fullRegisterSchema = object({
  name: string({ required_error: "El nombre es requerido" })
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(64, "El nombre no puede superar 64 caracteres."),
  email: string({ required_error: "El correo es requerido" })
    .min(1, "El correo es requerido")
    .email("Ingresa un correo electrónico válido."),
  password: string({ required_error: "La contraseña es requerida" })
    .min(6, "La contraseña debe tener al menos 6 caracteres.")
    .max(32, "La contraseña no puede superar 32 caracteres."),
  company: string({ required_error: "El nombre de tu empresa es requerido" })
    .min(2, "El nombre de la empresa debe tener al menos 2 caracteres.")
    .max(80, "El nombre de la empresa no puede superar 80 caracteres."),
  notificationNumber: string({ required_error: "El número de WhatsApp es requerido" })
    .min(7, "Ingresa un número válido.")
    .max(20, "El número no puede superar 20 caracteres.")
    .regex(/^[0-9+\-\s()]+$/, "Solo se permiten números y caracteres +, -, (, )."),
  timezone: string().optional(),
});

export const workflowShema = object({
  name: string().max(200),
  description: string().max(500),
});