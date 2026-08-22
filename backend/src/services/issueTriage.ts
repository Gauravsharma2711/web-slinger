import { OpportunityTier } from '@web-slinger/shared';

export interface IssueTriageInput {
  title: string;
  body: string | null;
  state: string;
  labels: string[];
  assignees: string[];
  comments_count: number;
}

export interface IssueTriageResult {
  tier: OpportunityTier;
  score: number;
  reasons: string[];
}

/**
 * Standard onboarding label patterns commonly used in open-source projects.
 * Matched case-insensitively.
 */
const ONBOARDING_LABEL_REGEX =
  /^(good[ -_]?first[ -_]?issue|help[ -_]?wanted|first[ -_]?timers[ -_]?only|up[ -_]?for[ -_]?grabs|starter|beginner|contributions[ -_]?welcome|easy[ -_]?pick)$/i;

/**
 * Determines whether a label qualifies as an onboarding label.
 */
export function isOnboardingLabel(label: string): boolean {
  if (!label || typeof label !== 'string') return false;
  const normalized = label.trim();
  return ONBOARDING_LABEL_REGEX.test(normalized);
}

/**
 * Deterministic issue triage engine.
 * Pure code: Gemini is NEVER called and does not influence tiering or rank.
 *
 * Tier A and Tier B are product classification labels, not guarantees of ease or acceptance.
 */
export function triageIssue(input: IssueTriageInput): IssueTriageResult {
  const isOpen = input.state.toLowerCase() === 'open';
  const matchedOnboardingLabels = input.labels.filter(isOnboardingLabel);
  const hasOnboardingLabel = matchedOnboardingLabels.length > 0;

  const titleTrimmed = (input.title || '').trim();
  const bodyTrimmed = (input.body || '').trim();
  const hasTitleContext = titleTrimmed.length >= 5;
  const hasBodyContext = bodyTrimmed.length >= 30;
  const hasSufficientContext = hasTitleContext && hasBodyContext;

  const isUnassigned = input.assignees.length === 0;
  const commentsCount = Math.max(0, input.comments_count || 0);

  const reasons: string[] = [];

  if (isOpen && hasOnboardingLabel && hasSufficientContext) {
    // --- TIER A OPPORTUNITY ---
    const tier: OpportunityTier = 'A';
    let score = 50; // Base score for Tier A

    // 1. Onboarding label evaluation
    score += 20;
    reasons.push(
      `Matched onboarding label: "${matchedOnboardingLabels[0]}" (intended for external contributors).`
    );

    // 2. Assignee preference
    if (isUnassigned) {
      score += 15;
      reasons.push('No active assignees; open for immediate contributor claim.');
    } else {
      reasons.push(
        `Currently assigned to: ${input.assignees.join(', ')} (may indicate work in progress).`
      );
    }

    // 3. Context richness
    if (bodyTrimmed.length >= 200) {
      score += 10;
      reasons.push(
        `Comprehensive issue description with detailed context (${bodyTrimmed.length} characters).`
      );
    } else {
      score += 5;
      reasons.push('Sufficient issue description and context provided.');
    }

    // 4. Discussion signal
    if (commentsCount > 0 && commentsCount <= 10) {
      score += 5;
      reasons.push(
        `Active discussion with ${commentsCount} community comment${commentsCount === 1 ? '' : 's'}.`
      );
    } else if (commentsCount > 10) {
      score += 2;
      reasons.push(`Extensive discussion thread (${commentsCount} comments).`);
    } else {
      reasons.push('Fresh issue with no existing comments.');
    }

    return {
      tier,
      score: Math.min(100, Math.max(0, score)),
      reasons,
    };
  } else {
    // --- TIER B OPPORTUNITY ---
    const tier: OpportunityTier = 'B';
    let score = 10; // Base score for Tier B

    // 1. Explain missing onboarding label or state
    if (!isOpen) {
      reasons.push(`Issue state is "${input.state}" (closed or non-open issues classified as Tier B).`);
    } else if (!hasOnboardingLabel) {
      reasons.push(
        "No standard onboarding label (e.g. 'good first issue' or 'help wanted') found."
      );
    }

    // 2. Context evaluation
    if (!input.body || bodyTrimmed.length < 30) {
      reasons.push(
        `Thin or missing issue description (${
          !input.body ? 'no body text provided' : `only ${bodyTrimmed.length} characters`
        }).`
      );
    } else if (bodyTrimmed.length >= 200) {
      score += 20;
      reasons.push(
        `Comprehensive problem description provided (${bodyTrimmed.length} characters).`
      );
    } else {
      score += 10;
      reasons.push('Basic issue description provided.');
    }

    // 3. Assignee status
    if (isUnassigned) {
      score += 15;
      reasons.push('No assignees currently attached.');
    } else {
      score += 5;
      reasons.push(`Assigned to contributor(s): ${input.assignees.join(', ')}.`);
    }

    // 4. Discussion signal
    if (commentsCount > 0) {
      score += 5;
      reasons.push(
        `Has ${commentsCount} discussion comment${commentsCount === 1 ? '' : 's'} from community.`
      );
    } else {
      reasons.push('No discussion comments yet.');
    }

    return {
      tier,
      score: Math.min(100, Math.max(0, score)),
      reasons,
    };
  }
}
