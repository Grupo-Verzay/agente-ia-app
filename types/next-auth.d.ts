import { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      role?: string;
      plan?: string;
      tokenVersion?: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    plan?: string;
    tokenVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    plan?: string;
    tokenVersion?: number;
  }
}
