import { config } from "dotenv";
import { resolve } from "path";

const apiRoot = resolve(__dirname, "..");
config({ path: resolve(apiRoot, ".env") });
config({ path: resolve(apiRoot, ".env.local") });
