import OpenAI from "openai";
import { cfg, loadResume, loadSoul } from "../config.js";

const client = new OpenAI({
  apiKey: cfg.deepseek.apiKey,
  baseURL: cfg.deepseek.baseUrl,
});

export async function scoreJob(job: { title: string; company: string; description: string }): Promise<{ score: number; reason: string }> {
  const resume = loadResume();
  if (!resume) return { score: 50, reason: "No resume loaded" };

  const soul = loadSoul();

  const prompt = `You are a job matching expert. Score this job against the candidate's resume from 0 to 100.

RESUME:
${resume}

CANDIDATE PREFERENCES:
${soul}

Use the preferences above to refine scoring: respect the preferred roles, industries, salary range, and hard-no filters listed there.

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}

SCORING RULES:
- Role match (Founding Engineer, Full-Stack, etc.): +0-30
- Tech stack overlap (TypeScript, Next.js, React, Node.js, Python, AWS, PostgreSQL): +0-25
- Company stage (Seed/Series A preferred, enterprise = penalty): +0-15
- Domain relevance (healthtech, fintech, SaaS, climate, logistics, devtools = bonus): +0-10
- Remote policy (must be remote or remote-friendly): +0-10
- Salary range meets $120K+ minimum: +0-10
- Penalties: crypto/blockchain/Web3/NFTs = -30, Go/Rust/Kafka/K8s as primary stack = -20, on-site only = -50, EU-only = -50, 10+ YOE required = -30, large enterprise (500+ people) = -20

Respond with ONLY a JSON object: {"score": <number 0-100>, "reason": "<one-line explanation>"}`;

  const response = await client.chat.completions.create({
    model: cfg.deepseek.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 150,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    return JSON.parse(content.trim());
  } catch {
    return { score: 50, reason: "Failed to parse score" };
  }
}

export async function tailorResume(job: { title: string; company: string; description: string }): Promise<{ tailored: string; summary: string }> {
  const resume = loadResume();
  if (!resume) throw new Error("No resume loaded");

  const soul = loadSoul();

  const prompt = `You are a resume tailoring expert. Rewrite the candidate's resume bullets to match this specific job.

CANDIDATE PREFERENCES:
${soul}

Use the preferences above to guide tailoring: align with preferred roles, highlight relevant industries, and respect hard boundaries.

RULES:
1. Reorder and rephrase existing bullets to highlight relevant experience
2. Use language from the job description where it genuinely matches
3. NEVER invent experience the candidate doesn't have
4. NEVER change company names, dates, or titles
5. Keep it as clean markdown
6. If the job asks for something the candidate clearly lacks, note it in your summary

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}

RESUME (READ-ONLY):
${resume}

Respond with ONLY a JSON object: {"tailored": "<full tailored resume in markdown>", "summary": "<what you changed and why>"}`;

  const response = await client.chat.completions.create({
    model: cfg.deepseek.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 3000,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    return JSON.parse(content.trim());
  } catch {
    throw new Error("Failed to generate tailored resume");
  }
}
