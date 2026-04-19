"use client";

import { redirect, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { loginSchema } from "@/lib/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { loginAction } from "@/actions/auth-action";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

interface FormLoginProps {
  isVerified: boolean;
  OAuthAccountNotLinked: boolean;
}

const FormLogin = ({ isVerified, OAuthAccountNotLinked }: FormLoginProps) => {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);


  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onChange",
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setError(null);
    startTransition(async () => {
      const response = await loginAction(values);

      if (response?.error) {
        setError(
          response.error === "CredentialsSignin"
            ? "Credenciales inválidas"
            : response.error
        );
      } else {
        router.refresh();
        redirect("/");
      }
    });
  }

  return (
    <div className="flex justify-center items-center w-screen h-screen bg-white dark:bg-gray-950">
      <div className="w-full max-w-md p-8 bg-gray-50 dark:bg-gray-900 rounded-xl shadow-md">
        <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">Inicia sesión</h1>
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">
          Ingresa tus credenciales para continuar
        </p>

        {/* Mensajes informativos */}
        {isVerified && (
          <p className="text-center text-green-500 bg-green-100 dark:bg-green-900 text-sm py-2 px-4 rounded mb-4">
            Email verificado. Ya puedes iniciar sesión.
          </p>
        )}
        {OAuthAccountNotLinked && (
          <p className="text-center text-red-500 bg-red-100 dark:bg-red-900 text-sm py-2 px-4 rounded mb-4">
            Para confirmar tu identidad, inicia sesión con la misma cuenta que usaste originalmente.
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Campo Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 dark:text-gray-300">Correo electrónico o usuario</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Tu correo"
                      type="text"
                      {...field}
                      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Campo Contraseña */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 dark:text-gray-300">Contraseña</FormLabel>

                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="Tu contraseña"
                        type={showPassword ? "text" : "password"}
                        {...field}
                        className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white pr-10"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Error general */}
            {error && (
              <p className="text-center text-red-600 text-sm">{error}</p>
            )}

            {/* Botón de Ingreso */}
            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {isPending ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </Form>

        {/* Divider */}
        {/* <div className="flex items-center my-6">
          <hr className="flex-grow border-gray-300 dark:border-gray-600" />
          <span className="mx-4 text-gray-500 dark:text-gray-400 text-sm">o</span>
          <hr className="flex-grow border-gray-300 dark:border-gray-600" />
        </div> */}

        {/* Social Buttons */}
        {/* <div className="space-y-3">
          <ButtonSocial provider="github" className="w-full">
            <FaGithub className="mr-2 h-4 w-4" />
            Ingresar con Github
          </ButtonSocial>
          <ButtonSocial provider="google" className="w-full">
            <FaGoogle className="mr-2 h-4 w-4" />
            Ingresar con Google
          </ButtonSocial>
        </div> */}

        {/* Enlace de recuperación */}
        {/* <div className="text-center mt-6">
          <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            ¿Olvidaste tu contraseña?
          </Link>
        </div> */}
      </div>
    </div>
  );
};

export default FormLogin;
