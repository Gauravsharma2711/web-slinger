import { describe, it, expect, vi } from 'vitest';
import {
  determineRepositoryRelationship,
  REPOSITORY_RELATIONSHIP_LABELS,
} from '@web-slinger/shared';
import { GitHubIssuesClient } from '../src/services/githubIssuesClient.js';

describe('Repository Relationship Truthfulness & Matching', () => {
  describe('determineRepositoryRelationship', () => {
    it('sets selected_practice_repository for freeCodeCamp/freeCodeCamp configuration', () => {
      const result = determineRepositoryRelationship('freeCodeCamp', 'freeCodeCamp');
      expect(result.relationship).toBe('selected_practice_repository');
      expect(result.label).toBe('Selected practice repository');
      expect(result.label).toBe(REPOSITORY_RELATIONSHIP_LABELS.selected_practice_repository);
    });

    it('proves an Oracle job cannot be described as connected to freeCodeCamp without verified evidence', () => {
      // User has Oracle job opportunity, but target practice repo is freeCodeCamp
      const oracleOpportunityCompany = 'Oracle';
      const repoResult = determineRepositoryRelationship(
        'freeCodeCamp',
        'freeCodeCamp',
        oracleOpportunityCompany
      );

      // Must NEVER evaluate to verified_company_repository
      expect(repoResult.relationship).not.toBe('verified_company_repository');
      expect(repoResult.relationship).toBe('selected_practice_repository');
      expect(repoResult.label).toBe('Selected practice repository');
      expect(repoResult.label).not.toContain('Oracle');
    });

    it('sets verified_company_repository when repository owner matches company name', () => {
      const oracleRepoResult = determineRepositoryRelationship(
        'oracle',
        'graalvm',
        'Oracle'
      );
      expect(oracleRepoResult.relationship).toBe('verified_company_repository');
      expect(oracleRepoResult.label).toBe('Verified company repository');
    });

    it('sets unrelated_repository for generic third-party repositories without company connection', () => {
      const unrelatedResult = determineRepositoryRelationship(
        'random-user',
        'practice-repo',
        'Oracle'
      );
      expect(unrelatedResult.relationship).toBe('unrelated_repository');
      expect(unrelatedResult.label).toBe('Unrelated — not a company contribution path');
    });
  });

  describe('Top 5 Issue Candidates Default Cap', () => {
    it('returns at most top 5 candidates ordered by deterministic score', async () => {
      const mockRawItems = Array.from({ length: 12 }, (_, i) => ({
        id: 1000 + i,
        number: i + 1,
        title: `Issue #${i + 1} with description`,
        body: `Detailed body description for issue number ${i + 1} to satisfy context richness requirements.`,
        html_url: `https://github.com/freeCodeCamp/freeCodeCamp/issues/${i + 1}`,
        state: 'open',
        labels: i % 2 === 0 ? [{ name: 'good first issue' }] : [{ name: 'bug' }],
        assignees: [],
        user: { login: `user-${i}` },
        comments: i,
        created_at: '2026-08-01T10:00:00Z',
        updated_at: '2026-08-02T10:00:00Z',
      }));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1700000000',
        }),
        json: async () => mockRawItems,
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        baseUrl: 'https://api.github.com',
        demoMode: false,
        config: {
          owner: 'freeCodeCamp',
          repo: 'freeCodeCamp',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 50,
          maxIssues: 50,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const result = await client.fetchIssues('freeCodeCamp', 'freeCodeCamp', 'Oracle');

      expect(result.status).toBe('completed');
      expect(result.repositoryRelationship).toBe('selected_practice_repository');
      expect(result.repositoryRelationshipLabel).toBe('Selected practice repository');

      // Total count tracks all parsed issues
      expect(result.totalCount).toBe(12);

      // Issues array is capped at top 5
      expect(result.issues).toHaveLength(5);

      // Ordered by score descending
      for (let j = 0; j < result.issues.length - 1; j++) {
        expect(result.issues[j].score).toBeGreaterThanOrEqual(result.issues[j + 1].score);
      }

      // Each issue has repository relationship truthfulness metadata preserved
      for (const issue of result.issues) {
        expect(issue.repository_relationship).toBe('selected_practice_repository');
        expect(issue.repository_relationship_label).toBe('Selected practice repository');
        expect(issue.reasons.length).toBeGreaterThan(0);
        expect(issue.source_url).toBeDefined();
      }
    });
  });
});
