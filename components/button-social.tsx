"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils"; // Si no tienes esta función, puedo pasártela.

interface ButtonSocialProps {
  children: React.ReactNode;
  provider: string;
  className?: string;
}

const ButtonSocial = ({ children, provider, className }: ButtonSocialProps) => {
  const handleClick = async () => {
    await signIn(provider);
  };

  return (
    <Button
      disabled
      onClick={handleClick}
      variant="outline"
      className={cn(
        "flex items-center justify-center w-full gap-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition",
        className
      )}
    >
      {children}
    </Button>
  );
};

export default ButtonSocial;
