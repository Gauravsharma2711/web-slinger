/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';

export interface EvidenceItem {
  type: 'job' | 'issue' | 'guide' | 'file' | 'check';
  label: string;
  detail?: string;
  url?: string;
}

export interface EvidenceTrailProps {
  items: EvidenceItem[];
  title?: string;
  className?: string;
}

const TYPE_CONFIG: Record<
  EvidenceItem['type'],
  { badge: string; typeName: string }
> = {
  job: { badge: 'JOB', typeName: 'Public Job Source' },
  issue: { badge: 'ISSUE', typeName: 'GitHub Issue' },
  guide: { badge: 'GUIDE', typeName: 'Repository Guide' },
  file: { badge: 'FILE', typeName: 'Reviewed File' },
  check: { badge: 'CHECK', typeName: 'User Verification' },
};

export const EvidenceTrail: React.FC<EvidenceTrailProps> = ({
  items,
  title = 'Verified Evidence Trail',
  className = '',
}) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className={`ws-evidence-trail ${className}`} role="region" aria-label="Evidence trail">
      <div className="ws-evidence-trail-header">
        <span className="ws-evidence-trail-icon" aria-hidden="true">✓</span>
        <h4 className="ws-evidence-trail-title">{title}</h4>
        <span className="ws-evidence-trail-count">{items.length} {items.length === 1 ? 'source' : 'sources'}</span>
      </div>

      <ul className="ws-evidence-trail-list">
        {items.map((item, idx) => {
          const config = TYPE_CONFIG[item.type] || { badge: 'SRC', typeName: 'Source' };
          return (
            <li key={idx} className="ws-evidence-trail-item">
              <span className="ws-evidence-trail-badge">{config.badge}</span>
              <div className="ws-evidence-trail-info">
                <div className="ws-evidence-trail-label-row">
                  <span className="ws-evidence-trail-label">{item.label}</span>
                  <span className="ws-evidence-trail-type">{config.typeName}</span>
                </div>
                {item.detail && (
                  <span className="ws-evidence-trail-detail">{item.detail}</span>
                )}
              </div>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ws-source-link ws-evidence-trail-link"
                  aria-label={`Open ${item.label} (opens in new window)`}
                >
                  View ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
