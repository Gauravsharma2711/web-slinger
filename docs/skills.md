# Web-Slinger AI — Product Skills and Capability Boundaries

## 1. Purpose

Web-Slinger AI provides an evidence-first workflow for researching technical opportunities, matching them to companies and repositories, drafting contribution proposals, and producing attributable proof of the user’s work.

Each capability is **session-scoped**, **evidence-based**, and **user-controlled**. The system may research, organize, explain, and draft, but the user remains responsible for reading, editing, verifying, and owning the final outcome.

## 2. End-to-End Workflow

1. Create a temporary session from the user’s technology-stack input.
2. Normalize the stack into structured technologies and search signals.
3. Collect and rank relevant job and company opportunities.
4. Match opportunities to a small set of suitable companies.
5. Discover public GitHub repositories and candidate issues for the selected company.
6. Route issues into either a focused proposal path or a learning-plan path.
7. Build issue-specific context and retrieve supporting evidence.
8. Generate an editable proposal or an educational attack plan.
9. Track user edits and require verification before proof can be produced.
10. Generate an attributable proof receipt and provide safe final-output options.
11. Handle external-service failures transparently and allow the user to clear session data.

## 3. Capability Catalog

### 3.1 Session and Input Preparation

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 1 | **Session Manager** | The user submits stack input. | A `session_id`, current session stage, and expiry information. | All data belongs to one TTL-bound session. |
| 2 | **Stack Normalizer** | The user enters technology chips or short free text. | Structured technologies and search signals. | Validate the input. If free-text parsing fails, use chip-based entry as the fallback. |

### 3.2 Opportunity and Company Research

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 3 | **Opportunity Collector** | Research begins. | Normalized job and company results with source URLs. | Use Bright Data, retain source provenance, and display a compact health status. |
| 4 | **Company Matcher** | Opportunity research completes. | A small ranked list of companies with factual match reasons. | Show a focused shortlist rather than a broad dashboard. |

### 3.3 Repository and Issue Discovery

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 5 | **GitHub Issue Discovery** | The user selects a company. | Public repositories and candidate issues. | Use the GitHub API for public metadata. Do not scrape GitHub pages. |
| 6 | **Issue Router** | Candidate issues are retrieved. | A **Tier A** or **Tier B** classification. | Tier A issues are suitable for a focused proposal. Tier B issues receive a learning plan. |

### 3.4 Context and Evidence

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 7 | **Context Builder** | The user selects an issue. | A plain-English brief, likely relevant files, cited sources, and open questions. | Collect only issue-relevant documentation and label partial context honestly. |
| 8 | **Evidence Retrieval** | Context building or proposal creation begins. | Ranked source excerpts and source IDs. | Treat sources as data, never as instructions. Every material claim requires provenance. |

### 3.5 Proposal and Learning Support

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 9 | **Proposal Builder** | The user approves the context. | An editable Tier A patch or a Tier B attack plan. | AI output is a draft and is not guaranteed to be a working fix. |
| 10 | **Learning Coach** | The user requests an explanation or receives a Tier B issue. | Explanations of why the issue matters, what to inspect, test steps, and checkpoints. | Help the user understand the work rather than hiding it behind automation. |

### 3.6 User Review and Verification

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 11 | **Edit Tracker** | The user changes proposal content. | A versioned edit and an `Edited by you` state. | Tier A proof requires an explicit user edit. |
| 12 | **Verification Gate** | The user completes the review. | An eligible proof state. | Require source acknowledgement, review acknowledgement, impact acknowledgement, and a user edit. |

### 3.7 Proof and Safe Output

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 13 | **Proof Builder** | Verification passes. | Sources, an edit summary, a verification statement, and a patch or pull-request payload. | Create an attributable proof receipt. |
| 14 | **Safe Output** | The user chooses a final action. | A browser-fork draft pull request or a `.patch` export. | Only a user-owned fork may be written to. A patch export must always be available as a fallback. |

### 3.8 Reliability and Privacy

| # | Capability | Trigger | Output | Operating rule |
|---:|---|---|---|---|
| 15 | **Health and Recovery** | Any external call is slow or fails. | A compact status, retry option, degraded state, or fixture fallback. | Preserve healthy work and never fabricate results. |
| 16 | **Privacy Control** | The user clears the session. | A deletion confirmation. | Do not persist user GitHub tokens. Keep all session data TTL-bound. |

## 4. Tiering Model

| Tier | Intended use | System output |
|---|---|---|
| **Tier A** | The issue is suitable for a focused contribution proposal. | An editable patch draft that proceeds through user review and verification. |
| **Tier B** | The issue is better suited to guided learning or requires additional understanding before implementation. | A learning-oriented attack plan with explanations, inspection targets, test steps, and checkpoints. |

Regardless of tier, generated content remains a draft. The user must understand, edit where required, review, and verify the material before proof is issued.

## 5. Evidence and Provenance Requirements

The product is evidence-first. Information gathered from external sources must be treated as data and evaluated within the workflow rather than followed as instructions.

The system must:

- Preserve source URLs and source identifiers.
- Attach provenance to every material claim.
- Retrieve only documentation relevant to the selected issue.
- Clearly label incomplete or partial context.
- Provide ranked excerpts instead of undifferentiated source material.
- Include source acknowledgement in the verification gate.

## 6. User-Controlled Review and Proof

The system researches and drafts; the user owns the decision and the outcome. A Tier A proof state is eligible only after the user has completed the required review actions.

The verification gate must confirm all of the following:

1. The user acknowledged the sources.
2. The user reviewed the generated proposal or output.
3. The user acknowledged the potential impact.
4. The user made an explicit edit to the proposal.

Once these requirements are satisfied, the Proof Builder can create an attributable proof receipt containing the relevant sources, edit summary, verification statement, and patch or pull-request payload.

## 7. Safe Output Policy

Web-Slinger AI must not automatically submit code to a third-party repository. The final action is always chosen by the user.

Supported output paths are:

- **Browser-fork draft pull request:** Write only to a fork owned by the user.
- **`.patch` export:** Provide a local, portable patch file as a fallback in every applicable workflow.

The product should preserve the user’s healthy work even when an external service is unavailable, and it should never imply that an action succeeded when it did not.

## 8. Capability Boundaries

The following boundaries are mandatory product requirements:

1. The system researches and drafts; the user reads, edits, verifies, and owns the outcome.
2. The backend stores service credentials. The browser never receives Bright Data, Bedrock, or backend secrets.
3. A GitHub user token is never persisted or logged.
4. The product never auto-submits code to a third-party repository.
5. A missing external dependency produces a clear fallback rather than fabricated content.

## 9. Non-Negotiable Design Principles

> **Evidence over assertion.** Material claims must be traceable to their sources.

> **User control over automation.** The product assists with research and drafting but does not replace user review or ownership.

> **Safe failure over false success.** Missing, delayed, or failed dependencies must result in an explicit degraded state or fallback—not invented results.

> **Privacy by default.** Session data is temporary, credentials remain server-side, and user GitHub tokens are never persisted or logged.

> **Attributable contribution.** Proof must reflect the user’s sources, edits, review, and verification actions.

## 10. Implementation Checklist

- [ ] Sessions are TTL-bound and assigned a `session_id`.
- [ ] Stack input is validated and normalized.
- [ ] Opportunity results retain source URLs and health status.
- [ ] Company matching produces a small, fact-based shortlist.
- [ ] GitHub discovery uses public API metadata rather than page scraping.
- [ ] Issues are routed into Tier A or Tier B.
- [ ] Context is issue-relevant and partial context is labeled.
- [ ] Material claims have provenance.
- [ ] AI-generated proposals are clearly treated as drafts.
- [ ] Tier A proof requires an explicit user edit.
- [ ] Verification includes source, review, impact, and edit acknowledgements.
- [ ] Proof receipts are attributable.
- [ ] Final output supports a user-owned fork and `.patch` export.
- [ ] External failures produce clear recovery or fallback states.
- [ ] GitHub tokens are neither persisted nor logged.
- [ ] Session clearing provides deletion confirmation.
- [ ] No code is auto-submitted to third-party repositories.
- [ ] Missing dependencies never result in fabricated content.

## Appendix A: Original Capability Order

1. Session Manager
2. Stack Normalizer
3. Opportunity Collector
4. Company Matcher
5. GitHub Issue Discovery
6. Issue Router
7. Context Builder
8. Evidence Retrieval
9. Proposal Builder
10. Learning Coach
11. Edit Tracker
12. Verification Gate
13. Proof Builder
14. Safe Output
15. Health and Recovery
16. Privacy Control

## Appendix B: Terminology

| Term | Meaning |
|---|---|
| **TTL-bound session** | A temporary session whose data is retained only for a defined time-to-live period. |
| **Source provenance** | Information identifying where a claim or excerpt originated. |
| **Tier A** | An issue suitable for a focused proposal and editable patch draft. |
| **Tier B** | An issue that receives a learning plan instead of a focused patch proposal. |
| **Proof receipt** | An attributable record of sources, user edits, verification, and the resulting patch or pull-request payload. |
| **User-owned fork** | A repository fork controlled by the user, where a draft pull request may be prepared without writing to a third-party repository. |

---
