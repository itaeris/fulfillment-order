import "reflect-metadata";
import "./load-env";
import compression from "compression";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Request, type Response } from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

const server = express();
let ready: Promise<void> | null = null;

function corsOrigins() {
  const extra = String(process.env.API_CORS_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://fulfillment-fti.aerisbeaute.com",
    ...extra,
  ];
}

function bootstrap() {
  if (!ready) {
    ready = NestFactory.create(AppModule, new ExpressAdapter(server), {
      logger: ["error", "warn"],
    }).then(async (app) => {
      app.use(compression());
      app.enableCors({ origin: corsOrigins(), credentials: true });
      app.setGlobalPrefix("v1");
      await app.init();
    });
  }
  return ready;
}

export default async function handler(req: Request, res: Response) {
  await bootstrap();
  server(req, res);
}
