/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeBlock } from '../src/components/CodeBlock.js';

describe('CodeBlock Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders language label, one-sentence plain-English explanation, and code content', () => {
    const code = 'pnpm run test:curriculum';
    const explanation = 'Run this command in your local repository terminal to verify the change.';

    render(
      <CodeBlock
        code={code}
        language="PowerShell"
        explanation={explanation}
      />
    );

    expect(screen.getByText('PowerShell')).toBeInTheDocument();
    expect(screen.getByText(explanation)).toBeInTheDocument();
    expect(screen.getByText(code)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy PowerShell/i })).toBeInTheDocument();
  });

  it('copies raw content exactly and provides clear copied feedback', async () => {
    const rawContent = `--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;`;
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <CodeBlock
        code={rawContent}
        language="Diff"
        explanation="Proposed change diff for local verification."
      />
    );

    const copyBtn = screen.getByRole('button', { name: /Copy Diff/i });
    expect(copyBtn).toHaveTextContent('Copy');

    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(rawContent);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy Diff/i })).toHaveTextContent('✓ Copied');
    });
  });

  it('preserves multi-line indentation and special characters without corruption', async () => {
    const rawJson = `{\n  "status": "complete",\n  "count": 42,\n  "nested": {\n    "valid": true\n  }\n}`;
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <CodeBlock
        code={rawJson}
        language="JSON"
        explanation="Structured session verification payload."
      />
    );

    const copyBtn = screen.getByRole('button', { name: /Copy JSON/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(rawJson);
  });

  it('renders long lines cleanly within responsive container', () => {
    const longLine = 'git checkout -b fix/super-long-branch-name-for-verification-of-mobile-and-desktop-viewports-and-responsive-wrap --track origin/main';

    const { container } = render(
      <CodeBlock
        code={longLine}
        language="Shell"
        explanation="Long terminal command for branch creation."
      />
    );

    const preElement = container.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement?.className).toContain('ws-code-block-pre');
    expect(container.querySelector('.ws-code-block-container')).toBeInTheDocument();
    expect(container.querySelector('.ws-code-block-explanation')).toBeInTheDocument();
  });
});
