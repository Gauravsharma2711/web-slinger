# Day 3 Source-Grounded Context Brief Walkthrough

## Summary
Implemented the Day 3 source-grounded Gemini context brief service and REST routes for Web-Slinger. The context brief enables developers to analyze and understand session-discovered candidate issues using evidence-grounded generative AI while strictly upholding human-in-the-loop boundaries and prompt injection defenses.

---

## 1. Architecture & Security Contract

```mermaid
flowchart TD
    Client[Human Developer / Frontend] -->|POST /sessions/:sessionId/issues/:num/context-brief| Router[Session Router]
    Router -->|1. Validate 24h Session TTL| SessionRepo[(Session Repository)]
    Router -->|2. Selected-Issue Authorization| IssueAuth{In Discovered Issues?}
    IssueAuth -->|No| Reject404[404 Reject Unauthorized Issue]
    IssueAuth -->|Yes| PackBuilder[SourcePackBuilder]
    PackBuilder -->|Fetch bounded issue, comments, repo, contributing, readme| GitHubAPI[GitHub API (Read-Only)]
    PackBuilder -->|Construct bounded SourcePack| BriefService[ContextBriefService]
    BriefService -->|Call with untrusted source delimiters & system instruction| VertexAI[Vertex AI gemini-3.7-flash]
    VertexAI -->|Strict JSON Response| Validator[Brief Validator]
    Validator -->|Check Schema, Exact URLs, No Autonomy Language| Decision{Valid?}
    Decision -->|Pass| CompletedDoc[Status: completed]
    Decision -->|Fail| NeedsReviewDoc[Status: needs_review]
    CompletedDoc -->|Persist Subcollection| BriefRepo[(Firestore context_briefs)]
    NeedsReviewDoc -->|Persist Subcollection| BriefRepo
    BriefRepo -->|Return ContextBriefResponse| Client
```

### Key Security & Integrity Guarantees
1. **Selected-Issue Authorization:** Rejects any issue number not present in `session.discovered_issues`. Arbitrary repository URLs and issue numbers from clients are denied.
2. **Strict Source Caps:**
   - Selected issue description: included with structured metadata
   - Comments: strictly capped at most recent 10 comments
   - `CONTRIBUTING.md`: capped at 12,000 characters
   - `README.md`: capped at 8,000 characters
3. **Untrusted Content Demarcation:** All GitHub content is wrapped in explicit source delimiters and marked as untrusted input.
4. **Human-in-the-Loop Constraint:** Prompt instructions and regex validators forbid automated patch diffs, git commit/push/branch instructions, and claims of guaranteed acceptance.
5. **Exact URL Citation Validation:** Every citation URL in `sourceCitations` and reading directive in `whatToReadFirst` must be an exact match in the source pack's allowlist.
6. **No Token / Secret Leakage:** Only public URLs, non-secret metadata, and model IDs are stored.

---

## 2. Shared Contracts & Schemas

Created [shared/src/schemas/contextBrief.ts](file:///c:/web-slinger/web-slinger/shared/src/schemas/contextBrief.ts):
- `WhatToReadFirstItemSchema`: `{ instruction: string, sourceUrl: string }`
- `SourceCitationItemSchema`: `{ claim: string, sourceUrl: string }`
- `ContextBriefContentSchema`: `{ summary, likelyContributionShape, whatToReadFirst, unknownsToVerify, suggestedFirstQuestion, sourceCitations }`
- `SourcePackItemSchema`: `{ title, url, retrievedAt, content? }`
- `ContextBriefDocumentSchema`: Document schema stored in Firestore subcollection `sessions/{sessionId}/context_briefs/{issueNumber}`
- `ContextBriefResponseSchema`: API response format

---

## 3. Backend Implementation

- [backend/src/repositories/contextBriefRepository.ts](file:///c:/web-slinger/web-slinger/backend/src/repositories/contextBriefRepository.ts): Firestore subcollection and in-memory persistence with undefined-safety.
- [backend/src/services/sourcePackBuilder.ts](file:///c:/web-slinger/web-slinger/backend/src/services/sourcePackBuilder.ts): Bounded source pack aggregation with 10-comment, 12k-contributing, and 8k-readme caps.
- [backend/src/services/contextBriefService.ts](file:///c:/web-slinger/web-slinger/backend/src/services/contextBriefService.ts): Vertex AI integration using `gemini-3.7-flash` via Application Default Credentials (ADC), strict JSON validation, allowlist check, forbidden language filtering, and fallback persistence.
- [backend/src/routes/session.ts](file:///c:/web-slinger/web-slinger/backend/src/routes/session.ts):
  - `POST /api/sessions/:sessionId/issues/:issueNumber/context-brief`
  - `GET /api/sessions/:sessionId/issues/:issueNumber/context-brief`

---

## 4. Verification & Live Test Results

### Workspace Quality Checks
- **Vitest Suites:** 111 tests passed across 3 packages (25 shared, 61 backend, 25 frontend).
- **TypeScript Typecheck:** 0 errors across `@web-slinger/shared`, `@web-slinger/backend`, and `@web-slinger/frontend`.
- **ESLint:** 0 errors, 0 warnings across all packages.
- **Production Build:** `pnpm build` succeeded in all workspaces.

### Live End-to-End Test Execution
- **Target Repository:** `freeCodeCamp/freeCodeCamp`
- **Selected Candidate Issue:** `#69622` ("fs lesson incorrectly states that every method has a synchronous version")
- **Issue Tier & Score:** Tier A (Score 95)
- **Source Count:** 3 sources in pack (`#69622`, repository metadata, `README.md`)
- **Model Invocation:** Vertex AI `gemini-3.7-flash` (ADC credentials)
- **Citation Validation Result:** 100% valid (0 validation errors, all cited URLs in exact allowlist)
- **Persistence Status:** `status: 'completed'` stored in Firestore subcollection `context_briefs/69622`
- **GET Endpoint:** HTTP 200 returned matching persisted context brief.
