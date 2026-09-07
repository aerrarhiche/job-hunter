import TelegramBot from "node-telegram-bot-api";
import { cfg } from "../config.js";
import { getTopJobs, recordDecision } from "../db/client.js";
import { tailorResume, scoreJob } from "../agent/scorer.js";
import { pool } from "../db/client.js";
import { logger } from "../logger.js";

let bot: TelegramBot | null = null;

export function startBot(): TelegramBot | null {
  if (!cfg.telegram.botToken) {
    logger.warn("Telegram bot token not set, skipping Telegram integration");
    return null;
  }

  bot = new TelegramBot(cfg.telegram.botToken, { polling: true });

  bot.onText(/\/start/, (msg) => {
    bot!.sendMessage(
      msg.chat.id,
      "Job Agent active. Daily brief at 7 AM.\n\nCommands:\n/brief — top matches\n/tailor <job_id> — tailor resume for a saved job\n/skip <job_id> — dismiss a job\n/tailor_url <url> — quick-score a job listing URL"
    );
  });

  bot.onText(/\/brief/, async (msg) => {
    await sendDailyBrief(String(msg.chat.id));
  });

  bot.onText(/\/tailor (\d+)/, async (msg, match) => {
    const jobId = parseInt(match![1]);
    const chatId = msg.chat.id;

    bot!.sendMessage(chatId, "Crafting your tailored resume...");

    try {
      const result = await pool.query("SELECT * FROM jobs WHERE id = $1", [jobId]);
      const job = result.rows[0];
      if (!job) {
        bot!.sendMessage(chatId, "Job not found.");
        return;
      }

      const tailored = await tailorResume({
        title: job.title,
        company: job.company,
        description: job.description || "",
      });

      await recordDecision(jobId, "tailored", `Tailored for ${job.company} - ${job.title}`);

      bot!.sendMessage(
        chatId,
        `**Tailored Resume for ${job.title} at ${job.company}**\n\n${tailored.summary}\n\n\`\`\`\n${tailored.tailored.substring(0, 3500)}\n\`\`\``,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      bot!.sendMessage(chatId, `Failed: ${(err as Error).message}`);
    }
  });

  bot.onText(/\/skip (\d+)/, async (msg, match) => {
    const jobId = parseInt(match![1]);
    await recordDecision(jobId, "skipped");
    bot!.sendMessage(msg.chat.id, `Job #${jobId} skipped. Noted.`);
  });

  bot.onText(/\/tailor_url (.+)/, async (msg, match) => {
    const url = match![1].trim();
    const chatId = msg.chat.id;
    bot!.sendMessage(chatId, `Fetching job from ${url}...`);
    try {
      const axios = (await import("axios")).default;
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const html = typeof data === "string" ? data : JSON.stringify(data);
      // Extract title from HTML or JSON
      const titleMatch = html.match(/<title>(.+?)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, "").trim() : "Job from URL";
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .substring(0, 4000);

      const { score, reason } = await scoreJob({ title, company: "Unknown", description: text });

      bot!.sendMessage(
        chatId,
        `Score: ${score}/100\n${reason}\n\nThis listing isn't saved. Use /brief for saved matches or /tailor <job_id> to tailor a saved job.`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      bot!.sendMessage(chatId, `Failed: ${(err as Error).message}`);
    }
  });

  logger.info("Telegram bot started");
  return bot;
}

export async function sendDailyBrief(chatId?: string): Promise<void> {
  const targetChat = chatId || cfg.telegram.chatId;
  if (!targetChat || !bot) {
    logger.info("No Telegram chat configured, printing brief to console");
    await printBriefToConsole();
    return;
  }

  const jobs = await getTopJobs(5);
  if (jobs.length === 0) {
    bot.sendMessage(targetChat, "No new matching jobs this morning.");
    return;
  }

  const lines = jobs.map((j, i) => {
    const salary = j.salary_min ? ` ($${(j.salary_min / 1000).toFixed(0)}K)` : "";
    return `${i + 1}. **${j.title}** at *${j.company}* — ${j.location}${salary} — Score: ${j.score}/100\n   ${j.score_reason}\n   /tailor ${j.id} | /skip ${j.id}`;
  });

  bot.sendMessage(targetChat, `Top ${jobs.length} matches this morning:\n\n${lines.join("\n\n")}`, {
    parse_mode: "Markdown",
  });
}

async function printBriefToConsole(): Promise<void> {
  const jobs = await getTopJobs(5);
  if (jobs.length === 0) {
    logger.info("\nNo new matching jobs.\n");
    return;
  }
  logger.info(`\n=== Top ${jobs.length} Matches ===\n`);
  jobs.forEach((j, i) => {
    logger.info(`${i + 1}. ${j.title} at ${j.company} — ${j.location} — Score: ${j.score}/100`);
    logger.info(`   ${j.score_reason}`);
    logger.info(`   ${j.url}\n`);
  });
}
