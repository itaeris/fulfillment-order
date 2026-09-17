import { config } from "dotenv";
import { resolve } from "path";

const root = resolve(__dirname, "../../..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local") });
