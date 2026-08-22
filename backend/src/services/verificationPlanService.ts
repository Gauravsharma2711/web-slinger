import {
  NormalizedIssue,
  ContributionWorkPlanDocument,
  VerificationPlanContent,
  VerificationPlanDocument,
  MANDATORY_VERIFICATION_DISCLAIMER,
} from '@web-slinger/shared';
import { createGeminiClient, geminiModel } from '../lib/gemini.js';
import { config } from '../config.js';
import {
  VerificationPlanRepository,
  createDefaultVerificationPlanRepository,
} from '../repositories/verificationPlanRepository.js';

export class VerificationPlanService {
  private repository: VerificationPlanRepository;
  private demoMode: boolean;

  constructor(
    repository: VerificationPlanRepository = createDefaultVerificationPlanRepository(),
    demoMode = config.demoMode
  ) {
    this.repository = repository;
    this.demoMode = demoMode;
  }

  /**
   * Synthesizes and persists a manual verification checklist for the human contributor.
   */
  async generateVerificationPlan(
    sessionId: string,
    issue: NormalizedIssue,
    workPlan?: ContributionWorkPlanDocument | null
  ): Promise<VerificationPlanDocument> {
    const generatedAt = new Date().toISOString();

    // DEMO_MODE fixture support
    if (this.demoMode || issue.is_fixture) {
      console.log(`[VerificationPlanService] DEMO_MODE active: generating fixture verification plan for issue #${issue.number}`);
      const fixtureContent: VerificationPlanContent = {
        checklist: [
          {
            id: 'check-1',
            title: 'Verify curriculum markdown formatting and linting',
            description: 'Run the repository curriculum linter to ensure markdown syntax adheres to style rules.',
            suggestedCommand: 'pnpm test:curriculum',
            status: 'not_verified',
          },
          {
            id: 'check-2',
            title: 'Local curriculum preview and readability check',
            description: 'Preview the modified lesson in the local documentation viewer to ensure clarity and formatting.',
            suggestedCommand: 'pnpm develop',
            status: 'not_verified',
          },
          {
            id: 'check-3',
            title: 'Confirm adjacent challenges remain consistent',
            description: 'Verify that downstream challenges in the module do not rely on the outdated asynchronous phrasing.',
            status: 'not_verified',
          },
        ],
        disclaimer: MANDATORY_VERIFICATION_DISCLAIMER,
        sourceCitations: workPlan?.plan?.sourceCitations || [
          {
            claim: `Issue #${issue.number} reports inaccurate fs documentation.`,
            sourceUrl: issue.html_url,
          },
        ],
      };

      const fixtureDoc: VerificationPlanDocument = {
        session_id: sessionId,
        issue_number: issue.number,
        plan: fixtureContent,
        model_id: 'gemini-3.7-flash',
        generated_at: generatedAt,
        is_fixture: true,
      };

      return this.repository.saveVerificationPlan(fixtureDoc);
    }

    const promptPayload = {
      issue: {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        htmlUrl: issue.html_url,
      },
      workPlan: {
        confirmedProblem: workPlan?.plan?.confirmedProblem,
        smallestChangePlan: workPlan?.plan?.smallestChangePlan,
        manualVerificationPlan: workPlan?.plan?.manualVerificationPlan,
        sourceCitations: workPlan?.plan?.sourceCitations,
      },
    };

    const systemInstruction = `You are Web-Slinger's Manual Verification Preparation Synthesizer.
Synthesize a structured manual checklist for the human developer to test and verify their proposed changes locally.

CRITICAL BOUNDARY RULES:
1. MANUAL ONLY: All checklist items are instructions for the HUMAN developer to execute manually.
2. EVERY ITEM MUST HAVE status: "not_verified". Never mark any item as passed or verified.
3. NEVER claim that any test ran or passed.
4. RETURN STRICT JSON conforming to the VerificationPlanContent schema.`;

    const userPrompt = `Synthesize a manual verification plan for issue #${issue.number} using this plan context:
${JSON.stringify(promptPayload, null, 2)}

Required JSON Schema:
{
  "checklist": [
    {
      "id": "check-1",
      "title": "Title of manual verification step",
      "description": "Specific instruction for the human developer to run locally",
      "suggestedCommand": "Optional terminal command (e.g. npm test or pnpm test:curriculum)",
      "status": "not_verified"
    }
  ],
  "disclaimer": "${MANDATORY_VERIFICATION_DISCLAIMER}",
  "sourceCitations": [
    {
      "claim": "Claim text",
      "sourceUrl": "https://github.com/exact-source-url"
    }
  ]
}`;

    try {
      console.log(
        `[VerificationPlanService] Calling Vertex AI model "${geminiModel}" for verification plan on issue #${issue.number}`
      );

      const ai = createGeminiClient();
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      const responseText = response.text || '';
      let parsedPlan: VerificationPlanContent;

      try {
        const rawJson = JSON.parse(responseText);
        // Guarantee every item has status: 'not_verified' and disclaimer is exact
        const sanitizedChecklist = (rawJson.checklist || []).map((item: Record<string, unknown>, idx: number) => ({
          id: String(item.id || `check-${idx + 1}`),
          title: String(item.title || 'Verification Step'),
          description: String(item.description || 'Perform manual review.'),
          suggestedCommand: item.suggestedCommand ? String(item.suggestedCommand) : undefined,
          status: 'not_verified' as const,
          prerequisiteUrl: item.prerequisiteUrl ? String(item.prerequisiteUrl) : undefined,
        }));

        parsedPlan = {
          checklist: sanitizedChecklist.length > 0 ? sanitizedChecklist : [
            {
              id: 'check-1',
              title: 'Manual local verification',
              description: 'Run local test suite and preview changes.',
              status: 'not_verified' as const,
            },
          ],
          disclaimer: MANDATORY_VERIFICATION_DISCLAIMER,
          sourceCitations: rawJson.sourceCitations || workPlan?.plan?.sourceCitations || [],
        };
      } catch (parseErr) {
        console.warn(`[VerificationPlanService] Could not parse model JSON, using deterministic plan: ${parseErr}`);
        parsedPlan = {
          checklist: (workPlan?.plan?.manualVerificationPlan || ['Run local test suite to verify changes.']).map((v, i) => ({
            id: `check-${i + 1}`,
            title: `Verification step ${i + 1}`,
            description: v,
            status: 'not_verified' as const,
          })),
          disclaimer: MANDATORY_VERIFICATION_DISCLAIMER,
          sourceCitations: workPlan?.plan?.sourceCitations || [],
        };
      }

      const doc: VerificationPlanDocument = {
        session_id: sessionId,
        issue_number: issue.number,
        plan: parsedPlan,
        model_id: geminiModel,
        generated_at: generatedAt,
        is_fixture: false,
      };

      return this.repository.saveVerificationPlan(doc);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[VerificationPlanService] Vertex AI error, falling back to deterministic plan: ${errorMsg}`);

      const fallbackContent: VerificationPlanContent = {
        checklist: (workPlan?.plan?.manualVerificationPlan || ['Run local test suite and preview changes.']).map((v, i) => ({
          id: `check-${i + 1}`,
          title: `Verification step ${i + 1}`,
          description: v,
          status: 'not_verified' as const,
        })),
        disclaimer: MANDATORY_VERIFICATION_DISCLAIMER,
        sourceCitations: workPlan?.plan?.sourceCitations || [],
      };

      const doc: VerificationPlanDocument = {
        session_id: sessionId,
        issue_number: issue.number,
        plan: fallbackContent,
        model_id: geminiModel,
        generated_at: generatedAt,
        is_fixture: false,
      };

      return this.repository.saveVerificationPlan(doc);
    }
  }

  async getVerificationPlan(
    sessionId: string,
    issueNumber: number
  ): Promise<VerificationPlanDocument | null> {
    return this.repository.getVerificationPlan(sessionId, issueNumber);
  }
}

export function createDefaultVerificationPlanService(): VerificationPlanService {
  return new VerificationPlanService();
}
