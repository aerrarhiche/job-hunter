import { z } from "zod";
import { SALARY_FLOOR_USD, DEFAULT_MIN_SCORE } from "./constants.js";

const commaSeparated = (fallback: string) =>
  z
    .string()
    .optional()
    .default(fallback)
    .transform((s) =>
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    );

const commaSeparatedLower = (fallback: string) =>
  z
    .string()
    .optional()
    .default(fallback)
    .transform((s) =>
      s
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    );

const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  DEEPSEEK_BASE_URL: z.string().url().optional().default("https://api.deepseek.com"),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_CHAT_ID: z.string().optional().default(""),
  APIFY_TOKEN: z.string().optional().default(""),
  YC_EMAIL: z.string().optional().default(""),
  YC_PASSWORD: z.string().optional().default(""),
  POSTGRES_HOST: z.string().optional().default("localhost"),
  POSTGRES_PORT: z.coerce.number().int().positive().optional().default(5432),
  POSTGRES_DB: z.string().optional().default("jobagent"),
  POSTGRES_USER: z.string().optional().default("jobagent"),
  POSTGRES_PASSWORD: z.string().optional().default("change-me"),
  DAILY_RUN_HOUR: z.coerce.number().int().min(0).max(23).optional().default(7),
  DAILY_RUN_MINUTE: z.coerce.number().int().min(0).max(59).optional().default(0),
  SEARCH_REMOTE_ONLY: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v !== "false"),
  SEARCH_LOCATIONS: commaSeparated("United States,Canada,Remote"),
  SEARCH_EXCLUDE_KEYWORDS: commaSeparatedLower(
    "crypto,blockchain,web3,nft,solidity,rust,go,golang,kafka,kubernetes,devops"
  ),
  SEARCH_MUST_HAVE: commaSeparatedLower("typescript,next.js,react,python,node.js,aws"),
  SEARCH_ROLE_TITLES: commaSeparated(
    "Founding Engineer,Founding Full-Stack,Full-Stack Engineer,Product Engineer,Founding Software Engineer"
  ),
  SEARCH_MIN_SALARY: z.coerce.number().int().positive().optional().default(SALARY_FLOOR_USD),
  SEARCH_MIN_SCORE: z.coerce.number().int().min(0).max(100).optional().default(DEFAULT_MIN_SCORE),
});

export interface EnvConfig {
  deepseek: { apiKey: string; baseUrl: string };
  telegram: { botToken: string; chatId: string };
  apify: { token: string };
  yc: { email: string; password: string };
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  schedule: { hour: number; minute: number };
  search: {
    remoteOnly: boolean;
    locations: string[];
    excludeKeywords: string[];
    mustHave: string[];
    roleTitles: string[];
    minSalary: number;
    minScore: number;
  };
}

/**
 * Parse and validate environment variables, applying the documented defaults.
 * Throws a descriptive Zod error if any value is malformed.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): EnvConfig {
  const env = envSchema.parse(raw);

  return {
    deepseek: {
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL,
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
    },
    apify: { token: env.APIFY_TOKEN },
    yc: { email: env.YC_EMAIL, password: env.YC_PASSWORD },
    postgres: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
    },
    schedule: { hour: env.DAILY_RUN_HOUR, minute: env.DAILY_RUN_MINUTE },
    search: {
      remoteOnly: env.SEARCH_REMOTE_ONLY,
      locations: env.SEARCH_LOCATIONS,
      excludeKeywords: env.SEARCH_EXCLUDE_KEYWORDS,
      mustHave: env.SEARCH_MUST_HAVE,
      roleTitles: env.SEARCH_ROLE_TITLES,
      minSalary: env.SEARCH_MIN_SALARY,
      minScore: env.SEARCH_MIN_SCORE,
    },
  };
}
