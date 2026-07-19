import express from "express";
import cors from "cors";
import { router } from "./routes.js";

export function createServer(): express.Express {
  const app = express();

  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json());
  app.use(router);

  return app;
}
