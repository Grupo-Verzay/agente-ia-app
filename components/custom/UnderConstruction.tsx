"use client";

import { Wrench, Sparkles, Construction, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils"; // Asegúrate de tener este helper de ShadCN

export function UnderConstruction() {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
                "relative border backdrop-blur-xl rounded-md shadow-xl p-4 max-w-96 w-full text-center space-y-6",
                "bg-white/60 border-white/30 dark:bg-black/40 dark:border-white/20"
            )}
        >
            {/* Iconos decorativos */}
            <div className="flex justify-center items-center gap-3 text-blue-500 dark:text-blue-400">
                <Wrench className="w-6 h-6 animate-spin-slow" />
                <Construction className="w-8 h-8" />
                <Sparkles className="w-6 h-6 animate-pulse" />
            </div>

            <h2 className="text-xl font-bold text-foreground drop-shadow-sm">
                ¡Estamos construyendo algo increíble!
            </h2>

            <p className="text-sm text-muted-foreground">
                Este componente aún no está disponible. Estamos trabajando en su desarrollo para ofrecerte una experiencia única. 🚀
            </p>

            <div className="flex justify-center items-center gap-2 text-blue-600 dark:text-blue-300">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-xs font-medium">Gracias por tu paciencia</span>
            </div>
        </motion.div>
    );
}
