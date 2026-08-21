# Web-Slinger AI — Workflow

**Purpose:** The approved end-to-end user and system flow.

```text
Stack input
→ research public opportunities
→ choose company
→ choose public issue
→ read context and sources
→ review proposal or attack plan
→ edit and verify
→ receive proof receipt, draft PR, or patch export
```

## Main Flow

| Step | User does | System does | Next state |
|---:|---|---|---|
| 1 | Selects stack chips or enters a short goal | Creates `session_id` and normalizes profile | `created` |
| 2 | Starts research | Runs Bright Data job collection, normalizes results, records health | `researching` |
| 3 | Selects one company | Confirms public GitHub organization and issue availability | `company_selected` |
| 4 | Selects one issue | Retrieves public issue data and assigns Tier A/B | `issue_selected` |
| 5 | Reads the Context Brief | Collects/ranks issue-relevant docs and returns cited explanation | `context_ready` |
| 6 | Reviews patch or attack plan | Generates source-grounded Tier A proposal or Tier B learning plan | `proposal_ready` |
| 7 | Makes an explicit edit and completes checks | Saves edit, verification record, and proof payload | `verification_ready` |
| 8 | Exports patch or opens user-fork flow | Returns source list, edit summary, PR description, and output artifact | `proof_ready` |

## Tier Routing

| Issue type | User experience | Output |
|---|---|---|
| **Tier A: focused, bounded issue** | Reads context, reviews an editable small patch, makes one explicit edit, verifies it | Draft PR in user-owned fork when enabled, otherwise `.patch` export |
| **Tier B: complex or ambiguous issue** | Receives a guided attack plan, inspection steps, and test checkpoints | Learning plan and optional exported notes; no artificial patch is required |

## Async Flow

| Job | Starts when | Produces | UI behavior |
|---|---|---|---|
| `research` | Stack input is submitted | Companies, job sources, health state | One calm progress message; source activity only if opened |
| `issues` | Company is selected | Candidate public issues and Tier labels | Short vertical issue list |
| `context` | Issue is selected | Sources, ranked excerpts, Context Brief | Evidence markers open Source Inspector |
| `proposal` | Context is approved | Patch or attack plan with source IDs | One proposal at a time, editable where applicable |
| `proof` | Verification passes | Proof receipt and export/PR payload | Single completion screen |

Every slow job returns a `job_id` immediately. The frontend reads compact status from the session rather than waiting on a long request.

## Failure Flow

| Failure | User sees | System preserves |
|---|---|---|
| Job collector unavailable | Retry option or clearly labeled cached demo result | Session and earlier choices |
| One field fails | Compact source-health disclosure | Healthy fields and collected sources |
| Docs unavailable | “Context is partial” | Public GitHub issue context |
| AI proposal unavailable | Attack-plan-only, sample, or retry option | Selected issue and source context |
| GitHub push unavailable | Patch export and copyable PR description | Full proof receipt |
| Page refresh | Resume or Discard banner | Durable session stage and stored artifacts |

## Ownership Gate

The system cannot create a Tier A proof artifact until the user has acknowledged sources, reviewed the proposal, acknowledged impact, and made an explicit edit. The goal is credible proof of work—not unattended AI submission.
