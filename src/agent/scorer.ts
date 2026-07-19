import OpenAI from "openai";
import { cfg, loadResume, loadSoul } from "../config.js";
import { researchCompany, formatResearchForPrompt } from "./research.js";
import type { ScrapedJobMetadata } from "../scrapers/types.js";

const client = new OpenAI({
  apiKey: cfg.deepseek.apiKey,
  baseURL: cfg.deepseek.baseUrl,
});

// ── Job input type used by both scoring functions ──────────────────

export interface JobForScoring {
  title: string;
  company: string;
  description: string;
  metadata?: ScrapedJobMetadata | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  location?: string | null;
}

// ── Prompt builder ─────────────────────────────────────────────────

/**
 * Build a rich, structured job description block for LLM prompts.
 * Goes far beyond a flat description — includes salary, equity, YC batch,
 * structured sections, tags, and scraper flow info.
 */
function buildJobBlock(job: JobForScoring): string {
  const m = job.metadata;
  const parts: string[] = [];

  parts.push(`Title: ${job.title}`);
  parts.push(`Company: ${job.company}`);
  if (job.location) parts.push(`Location: ${job.location}`);

  // Salary
  if (job.salaryMin != null || job.salaryMax != null) {
    const min = job.salaryMin != null ? `$${(job.salaryMin / 1000).toFixed(0)}K` : "?";
    const max = job.salaryMax != null ? `$${(job.salaryMax / 1000).toFixed(0)}K` : "?";
    parts.push(`Salary: ${min} - ${max}`);
  }

  if (m) {
    // Equity
    if (m.equityMin != null || m.equityMax != null) {
      parts.push(
        `Equity: ${m.equityMin ?? "?"}% - ${m.equityMax ?? "?"}%`
      );
    }

    // YC batch
    if (m.ycBatch) parts.push(`YC Batch: ${m.ycBatch}`);

    // Employment type
    if (m.employmentType) parts.push(`Employment: ${m.employmentType}`);

    // Visa
    if (m.visaSponsorship) parts.push(`Visa Sponsorship: Yes`);

    // Experience
    if (m.experienceLevel) parts.push(`Experience Required: ${m.experienceLevel}`);

    // Tags
    if (m.tags && m.tags.length > 0) {
      parts.push(`Tags: ${m.tags.join(", ")}`);
    }

    // Scraper flow
    if (m.scraperFlow) parts.push(`Discovered via: ${m.scraperFlow}`);

    // Structured descriptions
    if (m.companyDescription) {
      parts.push(`\n--- About ${job.company} ---\n${m.companyDescription}`);
    }
    if (m.roleDescription) {
      parts.push(`\n--- About the Role ---\n${m.roleDescription}`);
    } else {
      // Fallback to flat description
      parts.push(`\n--- Job Description ---\n${job.description}`);
    }
    if (m.interviewProcess) {
      parts.push(`\n--- Interview Process ---\n${m.interviewProcess}`);
    }
  } else {
    // No metadata — use flat description
    parts.push(`\n--- Job Description ---\n${job.description}`);
  }

  return parts.join("\n");
}

// ── Pipeline scoring (quick, used during cron runs) ────────────────

export async function scoreJob(
  job: JobForScoring
): Promise<{ score: number; reason: string }> {
  const resume = loadResume();
  if (!resume) return { score: 50, reason: "No resume loaded" };

  const soul = loadSoul();

  const jobBlock = buildJobBlock(job);

  const prompt = `You are a job matching expert. Score this job against the candidate's resume from 0 to 100.

RESUME:
${resume}

CANDIDATE PREFERENCES:
${soul}

Use the preferences above to refine scoring: respect the preferred roles, industries, salary range, and hard-no filters listed there.

JOB:
${jobBlock}

SCORING RULES:
- Role match (Founding Engineer, Founding Full-Stack, Full-Stack Engineer, Product Engineer, Founding Software Engineer, Senior Full-Stack): +0-30
  IMPORTANT: Only award points in this category if the title clearly matches one of these exact roles or a very close variant. "Backend Engineer", "Infrastructure Engineer", "Platform Engineer", "Data Engineer", "ML Engineer", "DevOps Engineer", "QA Engineer", "Mobile Engineer" are NOT target roles and should get 0-5 points maximum in this category.
- Tech stack overlap (TypeScript, Next.js, React, Node.js, Python, AWS, PostgreSQL): +0-25
- Company stage (Seed/Series A preferred, enterprise = penalty): +0-15
- Domain relevance (healthtech, fintech, SaaS, climate, logistics, devtools = bonus): +0-10
- Remote policy (must be remote or remote-friendly): +0-10
- Salary range meets $120K+ minimum: +0-10
- Penalties: crypto/blockchain/Web3/NFTs = -30, Go/Rust/Kafka/K8s as primary stack = -20, on-site only = -50, EU-only = -50, 10+ YOE required = -30, large enterprise (500+ people) = -20, non-target role (backend/infra/platform/data/ML/devops/QA/mobile only) = -25

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

// ── Detailed scoring report (used by the job detail page) ──────────

export interface ScoringReport {
  overall_score: number;
  categories: Array<{
    name: string;
    score: number;
    max: number;
    explanation: string;
  }>;
  summary: string;
  company_size?: string;
}

export async function generateScoringReport(
  job: JobForScoring
): Promise<ScoringReport> {
  const resume = loadResume();
  const soul = loadSoul();

  // Web research for company context
  const research = await researchCompany(job.company, job.title);
  const researchBlock = formatResearchForPrompt(research);

  const jobBlock = buildJobBlock(job);

  const prompt = `You are a senior technical recruiter and job matching expert. Score this job against the candidate's resume and preferences, and produce a detailed, category-by-category breakdown.

RESUME:
${resume}

CANDIDATE PREFERENCES (soul.md):
${soul}

COMPANY RESEARCH (from web search):
${researchBlock}

Use this research to better understand the company's stage, size, funding, industry, and reputation. This should heavily influence the Company Stage, Domain Relevance, and Salary categories. Reference specific facts from the research in your explanations.

JOB:
${jobBlock}

CATEGORIES TO SCORE (each with max points shown):
1. Role Match (max 30): How well does the title align with these target roles exactly: "Founding Engineer, Founding Full-Stack, Senior Full-Stack, Full-Stack Engineer, Product Engineer, Founding Software Engineer"? ONLY award high scores for close matches. "Backend Engineer", "Infrastructure Engineer", "Platform Engineer", "Data Engineer", "ML Engineer", "DevOps", "QA", "Mobile Engineer" are NOT target roles — give them 0-5 points.
2. Tech Stack Overlap (max 25): Overlap with TypeScript, Next.js, React, Node.js, Python, AWS, PostgreSQL, Java, Swift, etc.
3. Company Stage & Size (max 15): Seed/Series A startup preferred. Penalize enterprise (500+ people) or 10+ YOE requirements.
4. Domain Relevance (max 10): Bonus for healthtech, fintech, SaaS, climate, logistics, devtools.
5. Remote Policy (max 10): Must be remote or remote-friendly. Penalize on-site or relocation-required.
6. Salary (max 10): Meets $120K+ USD minimum. Bonus for $150K+. Consider equity info if available.

PENALTIES (apply as negative scores within relevant categories):
- Crypto/blockchain/Web3/NFTs: -30 (in Tech Stack or Role Match)
- Go, Rust, Kafka, Kubernetes as primary stack: -20 (in Tech Stack)
- On-site only or relocation required: -50 (in Remote Policy)
- EU-only location: -50 (in Remote Policy)
- 10+ years experience required: -30 (in Company Stage)
- Large enterprise (500+ people): -20 (in Company Stage)
- Non-target role (backend/infrastructure/platform/data/ML/DevOps/QA/mobile-only): -25 (in Role Match)

Respond with ONLY a JSON object:
{
  "overall_score": <number 0-100>,
  "categories": [
    {"name": "Role Match", "score": <number>, "max": 30, "explanation": "<2-3 sentence specific analysis referencing the job title, required experience, and how it maps to the candidate's target roles>"},
    {"name": "Tech Stack Overlap", "score": <number>, "max": 25, "explanation": "<2-3 sentences listing specific matching and missing technologies>"},
    {"name": "Company Stage & Size", "score": <number>, "max": 15, "explanation": "<2-3 sentences about company size/stage/experience requirements, referencing YC batch info or research if available>"},
    {"name": "Domain Relevance", "score": <number>, "max": 10, "explanation": "<2-3 sentences about industry alignment>"},
    {"name": "Remote Policy", "score": <number>, "max": 10, "explanation": "<2-3 sentences about remote policy and location constraints>"},
    {"name": "Salary", "score": <number>, "max": 10, "explanation": "<2-3 sentences about compensation range including equity if available>"}
  ],
  "summary": "<2-3 sentence overall verdict, whether this is worth applying, and the single biggest pro and con>",
  "company_size": "<10" | "10-50" | "50-200" | "200+" | "unknown"
}`;

  const response = await client.chat.completions.create({
    model: cfg.deepseek.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 1200,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.trim());
    return {
      overall_score: parsed.overall_score ?? 50,
      categories: parsed.categories ?? [],
      summary: parsed.summary ?? "No summary available.",
      company_size: parsed.company_size ?? undefined,
    };
  } catch {
    return {
      overall_score: 50,
      categories: [],
      summary: "Failed to generate scoring report.",
    };
  }
}

export async function tailorResume(job: {
  title: string;
  company: string;
  description: string;
}): Promise<{ tailored: string; summary: string }> {
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
