import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Sign-in links, the owner's password login, sessions and signing out. See src/lib/auth.ts.
export const { GET, POST } = toNextJsHandler(auth);
