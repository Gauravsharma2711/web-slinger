# Web-Slinger AI — Design System

**Status:** Approved implementation baseline  
**Design direction:** Calm Proof Flow  
**Use this document for:** Every approved Web-Slinger frontend screen, component, state, and responsive implementation.

> **Design premise:** Web-Slinger is a calm, credible developer product—not an AI command center. Each screen presents one question, one dominant task, one primary action, and at most one quiet secondary action. Detail appears only when the user asks for it.

---

## 1. Design Personality

| Attribute | Implementation meaning |
|---|---|
| **Calm** | Large whitespace, short copy, one task per screen, no visual urgency unless an action is blocked. |
| **Credible** | Real source citations, direct language, technical metadata only where it helps a decision. |
| **Developer-native** | Precise type hierarchy, mono metadata, dark code surface, evidence markers, factual system states. |
| **Human-owned** | The UI highlights user review, editing, verification, and proof—not automatic submission. |
| **Restrained** | One chartreuse signal color, violet for evidence only, and no generic SaaS decoration. |

### Non-negotiable rules

1. Do not use a permanent sidebar or a command-center dashboard.
2. Do not show multiple competing panels or primary actions on one screen.
3. Do not use gradients, glassmorphism, floating blobs, particles, or decorative motion.
4. Do not use lorem ipsum, fake analytics, fake testimonials, or fake system activity.
5. Do not expose all source, health, and technical metadata by default; use progressive disclosure.
6. The calm dotted-canvas Entry screen is the visual reference baseline for every future screen.

---

## 2. Foundation Tokens

### 2.1 Color

| Token | Value | Use | Do not use for |
|---|---:|---|---|
| `--ws-canvas` | `#FBFBF7` | Default page background | Dark code areas |
| `--ws-surface` | `#FFFFFF` | Inputs, excerpts, small elevated surfaces | Whole-page background by default |
| `--ws-ink` | `#121512` | Headings, primary buttons, critical text | Muted metadata |
| `--ws-ink-soft` | `#344038` | Body emphasis, labels | Disabled states |
| `--ws-muted` | `#737B74` | Supporting copy, timestamps, inactive UI | Headings or important actions |
| `--ws-rule` | `#E1E5DD` | 1px dividers and quiet control borders | Heavy boxed card outlines |
| `--ws-signal` | `#D9FF4A` | Selected stack chips, confirmed completion, one success moment | General decoration or all buttons |
| `--ws-signal-ink` | `#3F4B08` | Text on chartreuse | Normal body text |
| `--ws-evidence` | `#7D6DB2` | Source IDs and citations only | Generic action color |
| `--ws-safe` | `#3F8B61` | Confirmed healthy state | Generic success marketing copy |
| `--ws-warning` | `#B88418` | Attention / verification still required | Decorative emphasis |
| `--ws-danger` | `#C45646` | Blocked or failed state | Default destructive hover |
| `--ws-code` | `#151A16` | Code and diff surface only | Page canvas |
| `--ws-code-ink` | `#E7EEE7` | Code text | Light surfaces |

### 2.2 CSS token reference

```css
:root {
  --ws-canvas: #fbfbf7;
  --ws-surface: #ffffff;
  --ws-ink: #121512;
  --ws-ink-soft: #344038;
  --ws-muted: #737b74;
  --ws-rule: #e1e5dd;
  --ws-signal: #d9ff4a;
  --ws-signal-ink: #3f4b08;
  --ws-evidence: #7d6db2;
  --ws-safe: #3f8b61;
  --ws-warning: #b88418;
  --ws-danger: #c45646;
  --ws-code: #151a16;
  --ws-code-ink: #e7eee7;
}
```

### 2.3 Dark mode

Dark mode may invert the primary canvas, surface, and text hierarchy, but the semantic colors must remain recognizable. Do not introduce new neon hues, gradients, or glass surfaces. The code surface remains near-black in either theme.

---

## 3. Typography

| Role | Family | Size | Line height | Weight | Use |
|---|---|---:|---:|---:|---|
| Display | Space Grotesk | 48–64px | 0.98 | 600 | One page question; maximum two desktop lines |
| Section title | Space Grotesk | 28–36px | 1.05 | 600 | Secondary page section only |
| Choice / issue title | Space Grotesk | 16–20px | 1.2 | 600 | Company or issue option title |
| Body | Inter | 14–16px | 1.55 | 400 | Explanations and source context |
| Interface label | Inter | 12–13px | 1.3 | 600 | Buttons, selected tags, short UI labels |
| System metadata | IBM Plex Mono | 9–11px | 1.4 | 500–700 | Source IDs, timestamps, stage labels, statuses |
| Code | IBM Plex Mono | 12–13px | 1.55 | 400 | Diffs, patches, file paths, technical snippets |

### Type rules

- Use all caps only for short operational metadata, such as `STEP 3 OF 8`, `SOURCE S1`, or `SESSION ACTIVE`.
- Never use a text size smaller than 12px for essential controls or body information.
- Keep prose blocks within a 60–68 character line measure.
- Do not use Inter as the only font; Space Grotesk provides the product’s primary editorial character.

---

## 4. Spacing, Geometry, and Layout

### 4.1 Spacing scale

| Token | Value | Typical use |
|---|---:|---|
| `--ws-space-1` | 4px | Hairline inline correction |
| `--ws-space-2` | 8px | Icon/label gaps |
| `--ws-space-3` | 12px | Compact padding |
| `--ws-space-4` | 16px | Default control padding |
| `--ws-space-6` | 24px | Small section gap |
| `--ws-space-8` | 32px | Main grouped-content gap |
| `--ws-space-12` | 48px | Question-to-action distance |
| `--ws-space-16` | 64px | Large screen whitespace |
| `--ws-space-20` | 80px | Desktop page breathing room |

### 4.2 Geometry tokens

| Token | Value | Use |
|---|---:|---|
| `--ws-radius-xs` | 4px | Tags, citations, small status items |
| `--ws-radius-sm` | 6px | Inputs, buttons, quiet content blocks |
| `--ws-radius-lg` | 10px | Source drawer and rare modal surfaces |
| `--ws-rule-width` | 1px | Dividers and component boundaries |
| `--ws-header-height` | 56–60px | Global header height |
| `--ws-content-width` | 560–680px | Default centered decision-screen column |
| `--ws-drawer-width` | 480px max | Source Inspector drawer width |
| `--ws-control-height` | 44px min | Buttons, important inputs, action controls |

### 4.3 Layout patterns

| Pattern | When to use | Rules |
|---|---|---|
| **Decision Canvas** | Entry, Researching, Discovery, Triage, Receipt | Center one task in a 560–680px column with 35–45% visible whitespace. |
| **Reading Canvas** | Context Brief, How It Works, Privacy | Centered readable measure with a small source/action rail only when needed. |
| **Staged Workbench** | Proposal and Verification | Reveal Context → Proposal → Verification as sequential stages. Never show three equal permanent columns. |
| **Right Drawer** | Source Inspector and Settings | Overlay from right; preserve the current decision state beneath it. |
| **Confirmation Modal** | GitHub authorization and patch export | One irreversible decision, a plain explanation, one confirm action, one cancel action. |

### 4.4 Background texture

Entry, progress, empty, and proof receipt states may use a faint dotted grid with an 18px rhythm and subtle circular linework. This texture is an orientation device, not decoration. Do not place it behind dense text, code, source excerpts, or legal copy.

---

## 5. Navigation System

The navigation must be almost invisible. The header contains the Web-Slinger mark, a small current-stage label, a `How it works` link, and a settings control. There is no persistent navigation rail.

| Navigation type | Rule |
|---|---|
| Primary forward action | One per screen; near-black fill; moves user to the next meaningful decision. |
| Secondary action | One quiet border button or text action; it cannot compete with the primary action. |
| Back navigation | Small text link, contextual label, or browser back; never a large visual control. |
| Progress | Compact mono text such as `STEP 3 OF 8`; do not use a permanent large stepper. |
| Footer | Privacy, public repository, product attribution; no product controls. |

---

## 6. Component System

### 6.1 Header

| Property | Specification |
|---|---|
| Height | 56–60px |
| Left side | Web-Slinger mark and wordmark |
| Right side | Progress label, How It Works, Settings icon |
| Border | Optional single bottom `--ws-rule` divider |
| Prohibited | Sidebar trigger, multiple navigation menus, marketing CTA cluster |

### 6.2 Buttons

| Variant | Style | Use |
|---|---|---|
| Primary | `--ws-ink` fill, white label, 44px minimum height, 6px radius | One forward action per screen |
| Primary hover | Chartreuse surface or subtle chartreuse edge only | Affordance, not decoration |
| Secondary | Transparent, 1px `--ws-rule` border, `--ws-ink` label | One quiet alternative action |
| Text action | No border; muted/ink label, underline only on hover/focus | Back, skip, inspect, refine |
| Destructive | Text-led confirmation with `--ws-danger` only when an irreversible action is involved | Clear session / discard session |

Buttons must have a visible keyboard focus ring and a 120–160ms interaction response.

### 6.3 Inputs and stack chips

| Component | Behavior |
|---|---|
| Free-text input | One large focused prompt input; no crowded form builder. |
| Stack chip, unselected | Quiet surface or text-outline state. |
| Stack chip, selected | `--ws-signal` fill with `--ws-signal-ink`; removable control must remain accessible. |
| Error message | One sentence below input; pair color with icon/text. |

### 6.4 Choice list

Use a single spacious vertical list for companies, issues, or choices. Each row may show a title, one factual reason, a small source/status label, and one arrow/inspect affordance. Do not use a grid of competing cards.

### 6.5 Evidence and sources

| Component | Specification |
|---|---|
| Citation | Small violet `[S1]` adjacent to the claim it supports. |
| Source Inspector | Right drawer, maximum 480px, with source title, public URL, excerpt, retrieval time, and “why this matters.” |
| Source status | A factual compact line—never a large provenance dashboard. |
| Source safety | Render source content as sanitized text. Never execute or obey embedded source instructions. |

### 6.6 System health

Health is compact by default. Show one small state such as `Researching public sources` or `1 field needs attention`. The user can expand source activity to view broken → healing → healthy events.

The health disclosure is the only place permitted to use a richer chartreuse scan transition. It must never obstruct the main task or compete with the primary button.

### 6.7 Code proposal

| Requirement | Specification |
|---|---|
| Surface | `--ws-code` background and `--ws-code-ink` text |
| Scope | One file, one diff, or one attack-plan step at a time |
| User change | A small `Edited by you` marker appears after an explicit saved change |
| Explanation | Short “Why this change?” annotation with citations—not a broad hidden reasoning trace |
| Tier B | Show learning attack plan, inspections, and test checkpoints instead of artificial patch output |

### 6.8 States and feedback

| State | Required composition |
|---|---|
| Empty | One calm headline, one sentence, one recovery action |
| Loading | One current operation and optional compact source activity disclosure |
| Degraded | Honest cause, retained work, one retry or safe alternative |
| Error | No raw stack trace; one explanation and one recovery action |
| Success | One confirmation line and the next meaningful action |
| Resume | Entry-page banner: Resume or Discard; no automatic continuation |

---

## 7. Motion System

| Interaction | Duration | Motion rule |
|---|---:|---|
| Button press | 120–160ms | Subtle scale/contrast response; never springy or bouncy |
| New decision content | 220ms | Fade + 6–8px upward movement |
| Drawer | 200–260ms | Opacity + horizontal transform from trigger side |
| Modal | 200–260ms | Fade surface and scale from 0.95, never scale from zero |
| Health recovery | One brief chartreuse scan | Only when source activity is expanded |

Never use typewriter effects, looping gradients, bouncing indicators, particles, auto-playing charts, or moving background art. Respect `prefers-reduced-motion` by removing nonessential transform and scan effects.

---

## 8. Content and Voice

### Approved verbs

Use: **find, inspect, read, review, edit, verify, export, seal**.

### Banned wording

Do not use: “unlock,” “supercharge,” “magic,” “AI-powered solution,” “get started,” “revolutionary,” generic dashboard labels, or vague marketing promises.

### Content rules

- Use real company names, issue titles, source labels, and factual system states.
- State uncertainty directly: “Context is partial,” “This proposal needs local testing,” or “Source could not be retrieved.”
- AI-generated output must be framed as a draft proposal, never as a guaranteed fix.
- Keep main-screen explanatory copy to one or two sentences before asking the user to act.

---

## 9. Accessibility and Responsive Behavior

| Area | Requirement |
|---|---|
| Keyboard | All controls must be reachable; focus order follows visual order. |
| Focus | Provide visible high-contrast focus treatment for links, buttons, chips, drawers, and dialogs. |
| Status | Never communicate healthy, warning, or error state with color alone. Include label/icon/text. |
| Dialogs | Trap focus, restore focus to the trigger, offer an explicit close button and Escape behavior. |
| Tap targets | Primary inputs and actions must be at least 44px high. |
| Mobile | Preserve staged one-question flow. Do not compress desktop workbench panels into columns. |
| Mobile workbench | Context, Proposal, and Verification become full-width consecutive stages. |
| Source drawer | Becomes a full-height mobile sheet with clear close and back behavior. |

---

## 10. Screen Quality Checklist

Before accepting any new screen, verify every statement below:

1. Does the screen ask exactly one central question?
2. Is there exactly one visually dominant action?
3. Is all nonessential evidence, health detail, or configuration hidden behind progressive disclosure?
4. Does the screen retain at least one major region of intentional whitespace?
5. Are colors used semantically and sparingly?
6. Does every claim drawn from external data have visible source context where relevant?
7. Can a keyboard-only user complete the main action?
8. Does the screen avoid a dashboard, permanent sidebar, and unnecessary cards?
9. Does the screen use real content rather than placeholders?
10. Does the page feel calm, credible, and developer-professional at first glance?

If any answer is “no,” the screen is not ready to implement or ship.
