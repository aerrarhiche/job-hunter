import { config as loadDotenv } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseEnv } from "./env.js";

loadDotenv({ path: resolve(__dirname, "../.env") });

const env = parseEnv(process.env);

export const cfg = {
  deepseek: { ...env.deepseek, model: "deepseek-chat" },
  telegram: env.telegram,
  apify: env.apify,
  yc: env.yc,
  postgres: env.postgres,
  schedule: env.schedule,
  search: env.search,
  resumePath: resolve(__dirname, "../resume/master.md"),
  soulPath: resolve(__dirname, "../resume/soul.md"),
};

export function loadResume(): string {
  try {
    return readFileSync(cfg.resumePath, "utf-8");
  } catch {
    console.warn("No resume found at", cfg.resumePath);
    return "";
  }
}

export function loadSoul(): string {
  try {
    return readFileSync(cfg.soulPath, "utf-8");
  } catch {
    console.warn("No soul.md found at", cfg.soulPath);
    return "";
  }
}
