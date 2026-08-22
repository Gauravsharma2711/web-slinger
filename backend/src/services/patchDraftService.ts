import { randomUUID } from 'crypto';
import {
  NormalizedIssue,
  ContributionWorkPlanDocument,
  RepositoryFileEvidence,
  ReviewedSourceItem,
  PatchDraftDocument,
  MANDATORY_USER_AFFIRMATION,
} from '@web-slinger/shared';
import { createGeminiClient, geminiModel } from '../lib/gemini.js';
import { config } from '../config.js';
import {
  PatchDraftRepository,
  createDefaultPatchDraftRepository,
} from '../repositories/patchDraftRepository.js';

export const MAX_PATCH_CHANGED_FILES = 3;
export const MAX_PATCH_CHANGED_LINES = 120;

export const FORBIDDEN_PATCH_FILE_PATTERNS: { regex: RegExp; description: string }[] = [
  {
    regex: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/i,
    description: 'Package manager lockfiles are prohibited from patch drafts.',
  },
  {
    regex: /(^|\/)(requirements\.txt|poetry\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/i,
    description: 'Dependency manifest and lockfiles are prohibited from patch drafts.',
  },
  {
    regex: /(^|\/)(package\.json|pom\.xml|build\.gradle.*|Cargo\.toml|pyproject\.toml)$/i,
    description: 'Project dependency manifest files are prohibited from patch drafts.',
  },
  {
    regex: /(^|\/)\.github\/(workflows|actions)\//i,
    description: 'GitHub Actions and CI workflow definitions are prohibited from patch drafts.',
  },
  {
    regex: /(^|\/)\.(env|env\..*)$/i,
    description: 'Environment variable and credential files are prohibited.',
  },
  {
    regex: /\.(pem|key|crt|p12|pfx|jks|passwd|secret)$/i,
    description: 'Cryptographic keys and credential stores are prohibited.',
  },
  {
    regex: /(^|\/)(SECURITY\.md|LICENSE(\..*)?|COPYING|CODE_OF_CONDUCT(\..*)?)$/i,
    description: 'Repository security and licensing policy files are prohibited.',
  },
];

export interface ParsedDiffSummary {
  changedFiles: string[];
  totalChangedLines: number;
  addedLines: number;
  removedLines: number;
  errors: string[];
  warnings: string[];
}

export function parseAndValidateDiff(
  diffContent: string,
  reviewedSourcePaths: Set<string>
): ParsedDiffSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = diffContent.split('\n');
  const changedFileSet = new Set<string>();

  let addedLines = 0;
  let removedLines = 0;

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      const filePath = line.substring(6).trim();
      if (filePath && filePath !== '/dev/null') {
        changedFileSet.add(filePath);
      }
    } else if (line.startsWith('--- a/')) {
      const filePath = line.substring(6).trim();
      if (filePath && filePath !== '/dev/null') {
        changedFileSet.add(filePath);
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines++;
    }
  }

  const changedFiles = Array.from(changedFileSet);
  const totalChangedLines = addedLines + removedLines;

  // 1. Check max changed files
  if (changedFiles.length > MAX_PATCH_CHANGED_FILES) {
    errors.push(
      `Diff exceeds maximum of ${MAX_PATCH_CHANGED_FILES} changed files (found ${changedFiles.length}: ${changedFiles.join(', ')}).`
    );
  }

  // 2. Check max changed lines
  if (totalChangedLines > MAX_PATCH_CHANGED_LINES) {
    errors.push(
      `Diff exceeds maximum of ${MAX_PATCH_CHANGED_LINES} changed lines (found ${totalChangedLines} lines: +${addedLines}, -${removedLines}).`
    );
  }

  // 3. Verify all changed files are reviewed files
  for (const file of changedFiles) {
    if (!reviewedSourcePaths.has(file)) {
      errors.push(
        `File "${file}" was modified in the diff but was not included in the human-reviewed sources list.`
      );
    }
  }

  // 4. Check forbidden file patterns
  for (const file of changedFiles) {
    for (const rule of FORBIDDEN_PATCH_FILE_PATTERNS) {
      if (rule.regex.test(file)) {
        errors.push(`Modification to forbidden file "${file}" detected: ${rule.description}`);
      }
    }
  }

  return {
    changedFiles,
    totalChangedLines,
    addedLines,
    removedLines,
    errors,
    warnings,
  };
}

export class PatchDraftService {
  private repository: PatchDraftRepository;
  private demoMode: boolean;

  constructor(
    repository: PatchDraftRepository = createDefaultPatchDraftRepository(),
    demoMode = config.demoMode
  ) {
    this.repository = repository;
    this.demoMode = demoMode;
  }

  /**
   * Verifies that user-provided reviewed sources match session retrieved file evidence.
   */
  verifyReviewedSources(
    reviewedSources: ReviewedSourceItem[],
    sessionFileEvidence: RepositoryFileEvidence[]
  ): { valid: boolean; error?: string } {
    if (!reviewedSources || reviewedSources.length === 0) {
      return { valid: false, error: 'At least one reviewed source file is required.' };
    }

    const evidenceMap = new Map<string, string>();
    for (const file of sessionFileEvidence) {
      evidenceMap.set(file.path, file.sha);
    }

    for (const src of reviewedSources) {
      const storedSha = evidenceMap.get(src.path);
      if (!storedSha) {
        return {
          valid: false,
          error: `Reviewed source file "${src.path}" was not found in the retrieved evidence for this session.`,
        };
      }
      if (storedSha !== src.sha) {
        return {
          valid: false,
          error: `Reviewed source file "${src.path}" SHA mismatch (provided "${src.sha}", retrieved evidence has "${storedSha}").`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Generates a unified diff patch draft grounded strictly in the reviewed source files.
   */
  async generatePatchDraft(
    sessionId: string,
    issue: NormalizedIssue,
    reviewedSources: ReviewedSourceItem[],
    userAffirmation: boolean,
    workPlan?: ContributionWorkPlanDocument | null,
    sessionFileEvidence: RepositoryFileEvidence[] = []
  ): Promise<PatchDraftDocument> {
    if (!userAffirmation) {
      throw new Error('User affirmative agreement is required before generating a patch draft.');
    }

    const patchId = randomUUID();
    const reviewedAt = new Date().toISOString();
    const reviewedPathSet = new Set(reviewedSources.map((s) => s.path));

    // DEMO_MODE fixture support
    if (this.demoMode || issue.is_fixture) {
      console.log(`[PatchDraftService] DEMO_MODE active: generating fixture patch draft for issue #${issue.number}`);
      const targetPath = reviewedSources[0]?.path || 'curriculum/challenges/lecture.md';
      const fixtureDiff = `--- a/${targetPath}\n+++ b/${targetPath}\n@@ -45,3 +45,3 @@\n-The fs module methods are asynchronous by default, but for every method, there's a synchronous form.\n+The fs module methods are asynchronous by default, but for many methods, there's a synchronous form.\n`;

      const parsed = parseAndValidateDiff(fixtureDiff, reviewedPathSet);

      const fixtureDoc: PatchDraftDocument = {
        patch_id: patchId,
        session_id: sessionId,
        issue_number: issue.number,
        status: 'completed',
        diff_content: fixtureDiff,
        user_affirmation: MANDATORY_USER_AFFIRMATION,
        reviewed_at: reviewedAt,
        reviewed_sources: reviewedSources,
        changed_files: parsed.changedFiles,
        total_changed_lines: parsed.totalChangedLines,
        model_id: 'gemini-3.7-flash',
        generated_at: new Date().toISOString(),
        validation_errors: parsed.errors,
        warnings: parsed.warnings,
        is_user_edited: false,
        is_fixture: true,
      };

      return this.repository.savePatchDraft(fixtureDoc);
    }

    // Filter file contents for reviewed files only
    const reviewedFilesEvidence = sessionFileEvidence.filter((f) => reviewedPathSet.has(f.path));

    const promptPayload = {
      issue: {
        number: issue.number,
        title: issue.title,
        body: issue.body,
      },
      workPlan: {
        confirmedProblem: workPlan?.plan?.confirmedProblem,
        smallestChangePlan: workPlan?.plan?.smallestChangePlan,
      },
      reviewedSourceFiles: reviewedFilesEvidence.map((f) => ({
        path: f.path,
        sha: f.sha,
        content: f.content,
      })),
    };

    const systemInstruction = `You are Web-Slinger's Unified Patch Draft Synthesizer.
Generate a minimal, surgical UNIFIED DIFF patch representing the proposed edits agreed upon in the contribution work plan.

CRITICAL BOUNDARY & SAFETY RULES:
1. OUTPUT FORMAT: Output ONLY the raw unified diff text (standard diff format with "--- a/path", "+++ b/path", "@@ -x,y +x,y @@", and +/- line markers).
   Do NOT wrap the diff in markdown backticks (\`\`\`diff or \`\`\`). Do NOT include any introductory or concluding conversational prose.
2. STRICT FILE BOUNDS: Only modify files present in reviewedSourceFiles. NEVER touch or introduce modifications to package.json, lockfiles, CI workflows, credentials, or policy files.
3. CONCISE EDITS: Keep the patch minimal and focused strictly on the confirmed issue. Do NOT exceed 3 changed files or 120 total changed lines.
4. EXACT ORIGINAL CONTEXT: Ensure the hunk header and unmodified context lines match the exact provided file content.`;

    const userPrompt = `Generate a minimal unified patch draft for issue #${issue.number} using this verified evidence:
${JSON.stringify(promptPayload, null, 2)}`;

    try {
      console.log(
        `[PatchDraftService] Calling Vertex AI model "${geminiModel}" for patch draft on issue #${issue.number} (reviewed sources: ${reviewedSources.length})`
      );

      const ai = createGeminiClient();
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      let rawDiff = (response.text || '').trim();

      // Clean any accidental markdown code fence wrapper
      if (rawDiff.startsWith('```')) {
        rawDiff = rawDiff.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
      }

      const parsed = parseAndValidateDiff(rawDiff, reviewedPathSet);

      if (parsed.changedFiles.length === 0 || parsed.totalChangedLines === 0) {
        parsed.errors.push(
          'Insufficient evidence or no diff hunks produced for the provided reviewed source files.'
        );
      }

      const status = parsed.errors.length === 0 ? 'completed' : 'needs_review';

      const draftDoc: PatchDraftDocument = {
        patch_id: patchId,
        session_id: sessionId,
        issue_number: issue.number,
        status,
        diff_content: rawDiff,
        user_affirmation: MANDATORY_USER_AFFIRMATION,
        reviewed_at: reviewedAt,
        reviewed_sources: reviewedSources,
        changed_files: parsed.changedFiles,
        total_changed_lines: parsed.totalChangedLines,
        model_id: geminiModel,
        generated_at: new Date().toISOString(),
        validation_errors: parsed.errors,
        warnings: parsed.warnings,
        is_user_edited: false,
        is_fixture: false,
      };

      return this.repository.savePatchDraft(draftDoc);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[PatchDraftService] Error invoking Vertex AI for patch draft: ${errorMsg}`);

      const failedDoc: PatchDraftDocument = {
        patch_id: patchId,
        session_id: sessionId,
        issue_number: issue.number,
        status: 'failed',
        diff_content: '',
        user_affirmation: MANDATORY_USER_AFFIRMATION,
        reviewed_at: reviewedAt,
        reviewed_sources: reviewedSources,
        changed_files: [],
        total_changed_lines: 0,
        model_id: geminiModel,
        generated_at: new Date().toISOString(),
        validation_errors: [`Vertex AI generation failed: ${errorMsg}`],
        warnings: [],
        is_user_edited: false,
        is_fixture: false,
      };

      return this.repository.savePatchDraft(failedDoc);
    }
  }

  /**
   * Retrieves an existing patch draft by session and patch ID.
   */
  async getPatchDraft(sessionId: string, patchId: string): Promise<PatchDraftDocument | null> {
    return this.repository.getPatchDraft(sessionId, patchId);
  }

  /**
   * Updates an existing patch draft with user-edited diff content.
   * Never writes to disk, git, or remote.
   */
  async updateUserEditedPatchDraft(
    sessionId: string,
    patchId: string,
    editedDiffContent: string
  ): Promise<PatchDraftDocument | null> {
    const existing = await this.repository.getPatchDraft(sessionId, patchId);
    if (!existing) {
      return null;
    }

    const reviewedPathSet = new Set(existing.reviewed_sources.map((s) => s.path));
    const parsed = parseAndValidateDiff(editedDiffContent, reviewedPathSet);

    return this.repository.updatePatchDraftContent(
      sessionId,
      patchId,
      editedDiffContent,
      parsed.changedFiles,
      parsed.totalChangedLines,
      parsed.errors,
      parsed.warnings
    );
  }
}

export function createDefaultPatchDraftService(): PatchDraftService {
  return new PatchDraftService();
}
