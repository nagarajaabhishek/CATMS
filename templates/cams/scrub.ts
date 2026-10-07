/**
 * Redacts secret-like strings before anything is written to the query log.
 * Deliberately over-eager: a mangled question costs nothing, a leaked key does.
 * Decision ids (D-20260902-some-slug) and ordinary words must survive.
 */
const RULES: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[REDACTED:private-key]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED:jwt]"],
  [/\b(sk|pk|rk)[-_](live|test|proj|ant|or)?[-_]?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED:api-key]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED:aws-key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED:github-token]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED:github-token]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED:slack-token]"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[REDACTED:google-key]"],
  [/\bdp\.(st|pt|sa|ct|scim|audit)\.[A-Za-z0-9._-]{10,}/g, "[REDACTED:doppler-token]"],
  [/\bsbp_[A-Za-z0-9]{20,}\b/g, "[REDACTED:supabase-token]"],
  // scheme://user:password@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi, (_m, pre) => `${pre}:[REDACTED]@`],
  // KEY=value / "secret": "value" / token: value
  [
    /\b([A-Za-z0-9_.-]*(?:key|secret|token|passw(?:or)?d|pwd|credential|auth)[A-Za-z0-9_.-]*)(\s*["']?\s*[:=]\s*["']?)([^\s"',;]{6,})/gi,
    (_m, k, sep) => `${k}${sep}[REDACTED]`,
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [REDACTED]"],
  // long opaque tokens: 32+ chars of base64/hex alphabet (no hyphens, so decision ids are untouched), with a digit and a letter
  [/\b(?=[A-Za-z0-9+/=]*\d)(?=[A-Za-z0-9+/=]*[A-Za-z])[A-Za-z0-9+/=]{32,}\b/g, "[REDACTED:opaque]"],
];

// Cap before the regexes run: the key=value rule backtracks per start position (quadratic on long alphanumeric runs).
const MAX_SCRUB_CHARS = 4000;

export function scrub(text: string): string {
  let out = text.length > MAX_SCRUB_CHARS ? text.slice(0, MAX_SCRUB_CHARS) + "…[truncated]" : text;
  for (const [re, rep] of RULES) out = out.replace(re, rep as never);
  return out;
}
