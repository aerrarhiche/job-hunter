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

// ── Deep Review (on-demand, resume-weighted) ─────────────────────

export interface DeepReview {
  strengths: string[];
  gaps: string[];
  overall_fit: string;
  recommendation: string;
  key_talking_points: string[];
  skills_to_learn?: Array<{ name: string; category: string }>;
}

export async function deepReview(job: {
  title: string;
  company: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  scoringReport?: Record<string, unknown> | null;
  location?: string | null;
  salaryMin?: number | null;
}): Promise<DeepReview> {
  const resume = loadResume();
  if (!resume) throw new Error("No resume loaded");

  const soul = loadSoul();

  // Build rich context
  const contextParts: string[] = [];
  contextParts.push(`JOB: ${job.title} at ${job.company}`);
  if (job.location) contextParts.push(`Location: ${job.location}`);
  if (job.salaryMin) contextParts.push(`Salary: $${(job.salaryMin / 1000).toFixed(0)}K+`);
  contextParts.push(`\nDESCRIPTION:\n${job.description}`);

  if (job.metadata) {
    const m = job.metadata as any;
    if (m.ycBatch) contextParts.push(`YC Batch: ${m.ycBatch}`);
    if (m.companySize) contextParts.push(`Company Size: ${m.companySize}`);
    if (m.companyDescription) contextParts.push(`\nABOUT COMPANY:\n${m.companyDescription}`);
    if (m.roleDescription) contextParts.push(`\nABOUT ROLE:\n${m.roleDescription}`);
    if (m.interviewProcess) contextParts.push(`\nINTERVIEW PROCESS:\n${m.interviewProcess}`);
  }

  if (job.scoringReport) {
    const r = job.scoringReport as any;
    contextParts.push(`\nAI SCORING REPORT:`);
    contextParts.push(`Overall Score: ${r.overall_score}/100`);
    contextParts.push(`Summary: ${r.summary}`);
  }

  const context = contextParts.join("\n");

  const prompt = `You are a career coach and job fit analyst. Do a deep, honest review of whether this job is a good fit for the candidate's RESUME (primary weight) and PREFERENCES (secondary weight).

RESUME (PRIMARY — weigh this most heavily):
${resume}

PREFERENCES (secondary):
${soul}

JOB CONTEXT:
${context}

YOUR TASK:
1. Identify 3-5 specific strengths — where does the candidate's actual experience directly map to this role?
2. Identify 2-4 specific gaps — what is the candidate clearly missing or weak on? Be honest, even if it hurts.
3. Give an overall fit: "strong" (great match, apply now), "good" (solid fit, apply), "maybe" (borderline, apply if interested), "skip" (poor fit, don't waste time).
4. Write a 2-3 sentence recommendation.
5. List 3-5 key talking points the candidate should emphasize in an interview.
6. List specific skills/tools/concepts the candidate is missing and should learn to be a 100% fit. Each entry needs a name and a category (framework, language, tool, cloud, concept). Be specific — use canonical names like "LangGraph", "Kubernetes", "GraphQL", "Azure", "React Native". Deduplicate — if multiple gaps refer to the same skill, list it once.

IMPORTANT: Be honest and critical. If the candidate doesn't have the required experience, say so. Don't sugar-coat. The resume is the source of truth — don't assume skills that aren't listed.

Respond with ONLY a JSON object:
{
  "strengths": ["<specific strength 1>", "<specific strength 2>", ...],
  "gaps": ["<specific gap 1>", "<specific gap 2>", ...],
  "overall_fit": "<strong|good|maybe|skip>",
  "recommendation": "<2-3 sentence honest recommendation>",
  "key_talking_points": ["<point 1>", "<point 2>", ...],
  "skills_to_learn": [
    {"name": "<canonical skill name>", "category": "<framework|language|tool|cloud|concept>"}
  ]
}`;

  const response = await client.chat.completions.create({
    model: cfg.deepseek.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 1500,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    return JSON.parse(content.trim());
  } catch {
    return {
      strengths: ["Unable to generate review"],
      gaps: [],
      overall_fit: "maybe",
      recommendation: "Review generation failed. Please try again.",
      key_talking_points: [],
    };
  }
}

// ── Cover Letter Generator (on-demand) ───────────────────────────

export interface CoverLetter {
  subject: string;
  body: string;
  tone: string;
}

export async function generateCoverLetter(job: {
  title: string;
  company: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  scoringReport?: Record<string, unknown> | null;
  location?: string | null;
}): Promise<CoverLetter> {
  const resume = loadResume();
  if (!resume) throw new Error("No resume loaded");

  const soul = loadSoul();

  // Build rich context for the letter
  const contextParts: string[] = [];
  if (job.metadata) {
    const m = job.metadata as any;
    if (m.companyDescription) contextParts.push(`About ${job.company}: ${m.companyDescription}`);
    if (m.roleDescription) contextParts.push(`About the role: ${m.roleDescription}`);
    if (m.companySize) contextParts.push(`Company size: ${m.companySize}`);
    if (m.ycBatch) contextParts.push(`YC Batch: ${m.ycBatch}`);
  }
  const extraContext = contextParts.length > 0 ? "\n\nADDITIONAL COMPANY CONTEXT:\n" + contextParts.join("\n") : "";

  const prompt = `You are a professional cover letter writer. Write a concise, honest cover letter for this job application. The tone should be professional and relaxed — confident but not over-eager.

CANDIDATE RESUME:
${resume}

CANDIDATE PREFERENCES:
${soul}

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}${extraContext}

RULES:
1. Address it to "Hiring Team at ${job.company}"
2. Open by stating the role you're applying for and briefly why you're interested — reference the company's product/mission ONLY using facts from the job description or company context provided above. Do NOT claim to have followed the company, admired their work for a long time, or tracked their journey. You just came across this listing.
3. Highlight 2-3 specific experiences from the resume that directly match this role. Keep it factual.
4. Keep it to 3-4 short paragraphs (200-300 words total). Be direct.
5. Professional, relaxed tone — confident without enthusiasm. No exclamation marks. No words like "love", "passionate", "thrilled", "excited", "resonates deeply", "dream role".
6. Include a simple call to action at the end.
7. NEVER invent experience not in the resume. NEVER claim to know the company or its founders personally.
8. Use markdown formatting.

Respond with ONLY a JSON object:
{
  "subject": "<email subject line>",
  "body": "<full cover letter in markdown>",
  "tone": "professional"
}`;

  const response = await client.chat.completions.create({
    model: cfg.deepseek.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 1500,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    return JSON.parse(content.trim());
  } catch {
    throw new Error("Failed to generate cover letter");
  }
}
