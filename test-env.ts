import * as dotenv from "dotenv";
import { resolve } from "path";

// force-load .env.local from the project root
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

console.log("STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY);
console.log("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
