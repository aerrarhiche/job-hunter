import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env") });

export const cfg = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
  },
  apify: {
    token: process.env.APIFY_TOKEN || "",
  },
  yc: {
    email: process.env.YC_EMAIL || "",
    password: process.env.YC_PASSWORD || "",
  },
  postgres: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    database: process.env.POSTGRES_DB || "jobagent",
    user: process.env.POSTGRES_USER || "jobagent",
    password: process.env.POSTGRES_PASSWORD || "change-me",
  },
  schedule: {
    hour: parseInt(process.env.DAILY_RUN_HOUR || "7"),
    minute: parseInt(process.env.DAILY_RUN_MINUTE || "0"),
  },
  search: {
    remoteOnly: process.env.SEARCH_REMOTE_ONLY !== "false",
    locations: (process.env.SEARCH_LOCATIONS || "United States,Canada,Remote").split(","),
    excludeKeywords: (process.env.SEARCH_EXCLUDE_KEYWORDS || "crypto,blockchain,web3,nft,solidity,rust,go,golang,kafka,kubernetes,devops")
      .split(",")
      .map((k) => k.trim().toLowerCase()),
    mustHave: (process.env.SEARCH_MUST_HAVE || "typescript,next.js,react,python,node.js,aws")
      .split(",")
      .map((k) => k.trim().toLowerCase()),
    roleTitles: (process.env.SEARCH_ROLE_TITLES || "Founding Engineer,Founding Full-Stack,Full-Stack Engineer,Product Engineer,Founding Software Engineer")
      .split(",")
      .map((k) => k.trim()),
    minSalary: parseInt(process.env.SEARCH_MIN_SALARY || "120000"),
    minScore: parseInt(process.env.SEARCH_MIN_SCORE || "70"),
  },
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
