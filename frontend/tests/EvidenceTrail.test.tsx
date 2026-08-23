import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvidenceTrail, EvidenceItem } from '../src/components/EvidenceTrail.js';

describe('EvidenceTrail Component', () => {
  it('renders only real source items with appropriate badges and links', () => {
    const items: EvidenceItem[] = [
      {
        type: 'job',
        label: 'Senior TypeScript Engineer • TechCorp',
        detail: 'Remote, US',
        url: 'https://example.com/job/123',
      },
      {
        type: 'issue',
        label: '#69622 • Fix Node.js fs lesson typo',
        detail: 'Selected practice repository',
        url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
      },
      {
        type: 'guide',
        label: 'CONTRIBUTING.md',
        detail: 'Challenge guidelines',
        url: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/CONTRIBUTING.md',
      },
      {
        type: 'file',
        label: 'curriculum/challenges/english/lesson.md',
        detail: 'sha: a1b2c3d4',
        url: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/challenges/english/lesson.md',
      },
      {
        type: 'check',
        label: 'Local Test Verification',
        detail: 'PASSED • 42 tests passed in terminal',
      },
    ];

    render(<EvidenceTrail items={items} title="Verified Evidence Trail" />);

    expect(screen.getByText('Verified Evidence Trail')).toBeInTheDocument();
    expect(screen.getByText('5 sources')).toBeInTheDocument();

    expect(screen.getByText('JOB')).toBeInTheDocument();
    expect(screen.getByText('ISSUE')).toBeInTheDocument();
    expect(screen.getByText('GUIDE')).toBeInTheDocument();
    expect(screen.getByText('FILE')).toBeInTheDocument();
    expect(screen.getByText('CHECK')).toBeInTheDocument();

    expect(screen.getByText('Senior TypeScript Engineer • TechCorp')).toBeInTheDocument();
    expect(screen.getByText('#69622 • Fix Node.js fs lesson typo')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links.length).toBe(4); // 4 items have URLs, check does not
    expect(links[0]).toHaveAttribute('href', 'https://example.com/job/123');
    expect(links[0]).toHaveAttribute('target', '_blank');
  });

  it('renders nothing when items array is empty', () => {
    const { container } = render(<EvidenceTrail items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
