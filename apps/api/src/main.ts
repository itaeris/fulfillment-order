import "reflect-metadata";
import "./load-env";
import compression from "compression";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { corsOrigins } from "./cors";

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.use(compression());
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
  app.setGlobalPrefix("v1");
  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.API_PORT || process.env.PORT || 4000);
  await app.listen(port);
  console.log(`FTI API http://localhost:${port}/v1/health`);
}

if (require.main === module) {
  void bootstrap();
}
