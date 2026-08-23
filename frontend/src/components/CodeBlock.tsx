/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState } from 'react';

export interface CodeBlockProps {
  code: string;
  language?: string;
  explanation: string;
  className?: string;
  ariaLabel?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'Code',
  explanation,
  className = '',
  ariaLabel,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = async () => {
    if (!code) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`ws-code-block-wrapper ${className}`}>
      {explanation && (
        <p className="ws-code-block-explanation">{explanation}</p>
      )}
      <div
        className="ws-code-block-container"
        role="region"
        aria-label={ariaLabel || `${language} code block`}
      >
        <div className="ws-code-block-header">
          <span className="ws-code-block-language">{language}</span>
          <button
            type="button"
            className="ws-code-block-copy-btn"
            onClick={handleCopy}
            aria-label={`Copy ${language} to clipboard`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <pre className="ws-code-block-pre">
          <code className="ws-code-block-code">{code}</code>
        </pre>
      </div>
    </div>
  );
};
