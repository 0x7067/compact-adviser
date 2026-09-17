import type { Judgment } from "../src/judge.ts";

export interface ContinuationAnswer {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

/** Historical two-question judges attached a continuation answer; the shipped judge does not. */
export function continuationOf(j: Judgment): ContinuationAnswer | undefined {
  const value = (j as Judgment & { continuation?: ContinuationAnswer }).continuation;
  return value && typeof value.choice === "string" ? value : undefined;
}
