import {
  NormalizedIssue,
  NormalizedIssueSchema,
  GitHubResearchStatus,
  RepositoryFileEvidence,
  RepositoryRelationship,
  determineRepositoryRelationship,
} from '@web-slinger/shared';
import { githubConfig, GitHubConfig, config } from '../config.js';
import { triageIssue } from './issueTriage.js';

export interface GitHubFetchResult {
  owner: string;
  repo: string;
  status: GitHubResearchStatus;
  message: string;
  issues: NormalizedIssue[];
  totalCount: number;
  rateLimitRemaining?: number | null;
  rateLimitReset?: number | null;
  isFixture: boolean;
  repositoryRelationship: RepositoryRelationship;
  repositoryRelationshipLabel: string;
}

export interface GitHubIssuesClientOptions {
  config?: GitHubConfig;
  baseUrl?: string;
  requestTimeoutMs?: number;
  demoMode?: boolean;
}

export class GitHubIssuesClient {
  private activeConfig: GitHubConfig;
  private baseUrl: string;
  private requestTimeoutMs: number;
  private isDemoMode: boolean;

  constructor(options: GitHubIssuesClientOptions = {}) {
    this.activeConfig = options.config ?? githubConfig;
    this.baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.isDemoMode = options.demoMode ?? config.demoMode;
  }

  get config(): GitHubConfig {
    return this.activeConfig;
  }

  /**
   * Fetches open issues from target GitHub repository with pull request exclusion.
   * Target endpoint: GET https://api.github.com/repos/{owner}/{repo}/issues
   */
  async fetchIssues(
    ownerParam?: string,
    repoParam?: string,
    companyName?: string | null
  ): Promise<GitHubFetchResult> {
    const owner = (ownerParam || this.activeConfig.owner).trim();
    const repo = (repoParam || this.activeConfig.repo).trim();

    const { relationship: repoRel, label: repoRelLabel } = determineRepositoryRelationship(
      owner,
      repo,
      companyName
    );

    if (!owner || !repo) {
      return {
        owner: owner || 'unknown',
        repo: repo || 'unknown',
        status: 'not_found',
        message: 'GitHub target owner or repository name is not configured.',
        issues: [],
        totalCount: 0,
        isFixture: false,
        repositoryRelationship: repoRel,
        repositoryRelationshipLabel: repoRelLabel,
      };
    }

    // DEMO MODE: Return clearly labelled fixtures only
    if (this.isDemoMode) {
      console.log(`[GitHubIssuesClient] DEMO_MODE active: returning fixture issues for ${owner}/${repo}`);
      const fixtureIssues: NormalizedIssue[] = [
        {
          id: 100101,
          number: 42,
          title: `[DEMO FIXTURE] Refactor state manager hook for React 19 in ${repo}`,
          body: 'This is a demo fixture issue provided because DEMO_MODE is enabled. No live GitHub call was made. Comprehensive reproduction and test cases are attached.',
          html_url: `https://github.com/${owner}/${repo}/issues/42`,
          state: 'open',
          labels: ['demo-fixture', 'help wanted', 'good first issue'],
          assignees: [],
          author: 'demo-contributor',
          comments_count: 5,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date().toISOString(),
          source_url: `https://github.com/${owner}/${repo}/issues/42`,
          retrieved_at: new Date().toISOString(),
          tier: 'A',
          score: 95,
          reasons: [
            'Matched onboarding label: "good first issue" (intended for external contributors).',
            'No active assignees; open for immediate contributor claim.',
            'Comprehensive issue description with detailed context (152 characters).',
            'Active discussion with 5 community comments.',
          ],
          is_fixture: true,
          repository_relationship: repoRel,
          repository_relationship_label: repoRelLabel,
        },
        {
          id: 100102,
          number: 43,
          title: `[DEMO FIXTURE] Optimize TypeScript type inference for component props in ${repo}`,
          body: null, // Nullable body test/demonstration
          html_url: `https://github.com/${owner}/${repo}/issues/43`,
          state: 'open',
          labels: ['demo-fixture', 'performance'],
          assignees: ['core-dev'],
          author: 'demo-author',
          comments_count: 2,
          created_at: new Date(Date.now() - 7200000).toISOString(),
          updated_at: new Date().toISOString(),
          source_url: `https://github.com/${owner}/${repo}/issues/43`,
          retrieved_at: new Date().toISOString(),
          tier: 'B',
          score: 20,
          reasons: [
            "No standard onboarding label (e.g. 'good first issue' or 'help wanted') found.",
            'Thin or missing issue description (no body text provided).',
            'Assigned to contributor(s): core-dev.',
            'Has 2 discussion comments from community.',
          ],
          is_fixture: true,
          repository_relationship: repoRel,
          repository_relationship_label: repoRelLabel,
        },
      ];

      return {
        owner,
        repo,
        status: 'completed',
        message: 'Demo mode fixture issues loaded successfully.',
        issues: fixtureIssues,
        totalCount: fixtureIssues.length,
        isFixture: true,
        repositoryRelationship: repoRel,
        repositoryRelationshipLabel: repoRelLabel,
      };
    }

    const perPage = Math.min(this.activeConfig.pageSize, this.activeConfig.maxIssues, 100);
    const queryParams = new URLSearchParams({
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      page: '1',
      per_page: String(perPage),
    });

    const targetUrl = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo
    )}/issues?${queryParams.toString()}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.activeConfig.apiVersion,
      'User-Agent': 'Web-Slinger-Backend',
    };

    // Send Authorization header only if token is non-empty
    if (this.activeConfig.token && this.activeConfig.token.length > 0) {
      headers['Authorization'] = `Bearer ${this.activeConfig.token}`;
    }

    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      const rateLimitRemainingHeader = res.headers.get('x-ratelimit-remaining');
      const rateLimitResetHeader = res.headers.get('x-ratelimit-reset');
      const rateLimitRemaining = rateLimitRemainingHeader
        ? parseInt(rateLimitRemainingHeader, 10)
        : null;
      const rateLimitReset = rateLimitResetHeader
        ? parseInt(rateLimitResetHeader, 10)
        : null;

      // Safe logging on response
      console.log(
        `[GitHubIssuesClient] Response from ${owner}/${repo}: status ${res.status} ${
          res.statusText
        } | rateLimitRemaining: ${rateLimitRemaining ?? 'n/a'}`
      );

      // Handle 403 Rate Limit
      if (res.status === 403) {
        const errorText = await res.text().catch(() => '');
        const isRateLimit =
          rateLimitRemaining === 0 ||
          errorText.toLowerCase().includes('rate limit') ||
          errorText.toLowerCase().includes('secondary rate limit');

        const message = isRateLimit
          ? 'GitHub API rate limit reached. Please configure a personal access token or wait for rate limit reset.'
          : `GitHub API access forbidden: ${errorText || '403 Forbidden'}`;

        return {
          owner,
          repo,
          status: 'rate_limited',
          message,
          issues: [],
          totalCount: 0,
          rateLimitRemaining,
          rateLimitReset,
          isFixture: false,
          repositoryRelationship: repoRel,
          repositoryRelationshipLabel: repoRelLabel,
        };
      }

      // Handle 404 Repository Not Found
      if (res.status === 404) {
        return {
          owner,
          repo,
          status: 'not_found',
          message: `Target repository ${owner}/${repo} was not found on GitHub.`,
          issues: [],
          totalCount: 0,
          rateLimitRemaining,
          rateLimitReset,
          isFixture: false,
          repositoryRelationship: repoRel,
          repositoryRelationshipLabel: repoRelLabel,
        };
      }

      // Handle 5xx Upstream Server Errors
      if (res.status >= 500) {
        return {
          owner,
          repo,
          status: 'failed',
          message: `GitHub upstream service error (HTTP ${res.status} ${res.statusText}).`,
          issues: [],
          totalCount: 0,
          rateLimitRemaining,
          rateLimitReset,
          isFixture: false,
          repositoryRelationship: repoRel,
          repositoryRelationshipLabel: repoRelLabel,
        };
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          owner,
          repo,
          status: 'failed',
          message: `GitHub request failed with HTTP ${res.status} (${res.statusText}): ${
            errorText || 'No error details'
          }`,
          issues: [],
          totalCount: 0,
          rateLimitRemaining,
          rateLimitReset,
          isFixture: false,
          repositoryRelationship: repoRel,
          repositoryRelationshipLabel: repoRelLabel,
        };
      }

      const rawItems = (await res.json()) as Record<string, unknown>[];
      if (!Array.isArray(rawItems)) {
        return {
          owner,
          repo,
          status: 'degraded',
          message: 'Unexpected non-array response from GitHub issues endpoint.',
          issues: [],
          totalCount: 0,
          rateLimitRemaining,
          rateLimitReset,
          isFixture: false,
          repositoryRelationship: repoRel,
          repositoryRelationshipLabel: repoRelLabel,
        };
      }

      let prCount = 0;
      const normalizedIssues: NormalizedIssue[] = [];
      const retrievedAt = new Date().toISOString();

      for (const item of rawItems) {
        // Exclude every returned object containing pull_request
        if (item.pull_request !== undefined && item.pull_request !== null) {
          prCount++;
          continue;
        }

        const labels: string[] = Array.isArray(item.labels)
          ? item.labels
              .map((l: unknown) => {
                if (typeof l === 'string') return l;
                if (l && typeof l === 'object' && 'name' in l && typeof l.name === 'string') {
                  return l.name;
                }
                return null;
              })
              .filter((l): l is string => Boolean(l))
          : [];

        const assignees: string[] = Array.isArray(item.assignees)
          ? item.assignees
              .map((a: unknown) => {
                if (a && typeof a === 'object' && 'login' in a && typeof a.login === 'string') {
                  return a.login;
                }
                return null;
              })
              .filter((a): a is string => Boolean(a))
          : item.assignee && typeof item.assignee === 'object' && 'login' in item.assignee
          ? [String((item.assignee as Record<string, unknown>).login)]
          : [];

        const author =
          item.user && typeof item.user === 'object' && 'login' in item.user
            ? String((item.user as Record<string, unknown>).login)
            : null;

        const body =
          typeof item.body === 'string' && item.body.trim().length > 0
            ? item.body.trim()
            : null;

        const commentsCount =
          typeof item.comments === 'number' ? Math.max(0, item.comments) : 0;

        const rawCreatedAt =
          typeof item.created_at === 'string' ? item.created_at : retrievedAt;
        const rawUpdatedAt =
          typeof item.updated_at === 'string' ? item.updated_at : rawCreatedAt;

        const htmlUrl =
          typeof item.html_url === 'string'
            ? item.html_url
            : `https://github.com/${owner}/${repo}/issues/${item.number}`;

        const issueNumber = typeof item.number === 'number' ? item.number : 0;
        const issueId = typeof item.id === 'number' ? item.id : issueNumber;
        const issueTitle = String(item.title || 'Untitled issue');
        const issueState = String(item.state || 'open');

        // Deterministic, explainable issue triage (Gemini is NEVER called)
        const triage = triageIssue({
          title: issueTitle,
          body,
          state: issueState,
          labels,
          assignees,
          comments_count: commentsCount,
        });

        const candidateIssue: NormalizedIssue = {
          id: issueId,
          number: issueNumber,
          title: issueTitle,
          body,
          html_url: htmlUrl,
          state: issueState,
          labels,
          assignees,
          author,
          comments_count: commentsCount,
          created_at: new Date(rawCreatedAt).toISOString(),
          updated_at: new Date(rawUpdatedAt).toISOString(),
          source_url: htmlUrl,
          retrieved_at: retrievedAt,
          tier: triage.tier,
          score: triage.score,
          reasons: triage.reasons,
          is_fixture: false,
          repository_relationship: repoRel,
          repository_relationship_label: repoRelLabel,
        };

        const validated = NormalizedIssueSchema.safeParse(candidateIssue);
        if (validated.success) {
          normalizedIssues.push(validated.data);
          if (normalizedIssues.length >= this.activeConfig.maxIssues) {
            break;
          }
        } else {
          console.warn(
            `[GitHubIssuesClient] Validation warning for issue #${item.number}:`,
            validated.error.format()
          );
        }
      }

      // Sort normalized issues deterministically by score descending
      normalizedIssues.sort(
        (a, b) => b.score - a.score || b.comments_count - a.comments_count || b.number - a.number
      );

      // Return at most the top 5 issue candidates by default, ordered by the existing deterministic score
      const topIssues = normalizedIssues.slice(0, 5);

      // Safe logging of counts only (never log issue bodies or secrets)
      console.log(
        `[GitHubIssuesClient] Completed for ${owner}/${repo}: fetched ${rawItems.length} items | retained ${topIssues.length} top candidates (of ${normalizedIssues.length}) | excluded ${prCount} pull requests`
      );

      return {
        owner,
        repo,
        status: 'completed',
        message: `Successfully discovered ${topIssues.length} open candidate issues from ${owner}/${repo}.`,
        issues: topIssues,
        totalCount: normalizedIssues.length,
        rateLimitRemaining,
        rateLimitReset,
        isFixture: false,
        repositoryRelationship: repoRel,
        repositoryRelationshipLabel: repoRelLabel,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isTimeout =
        errorMsg.toLowerCase().includes('timeout') ||
        errorMsg.toLowerCase().includes('aborted');

      console.error(
        `[GitHubIssuesClient] Error fetching issues from ${owner}/${repo}: ${errorMsg}`
      );

      return {
        owner,
        repo,
        status: isTimeout ? 'degraded' : 'failed',
        message: isTimeout
          ? `Connection to GitHub API timed out for ${owner}/${repo}.`
          : `Failed to fetch issues from ${owner}/${repo}: ${errorMsg}`,
        issues: [],
        totalCount: 0,
        isFixture: false,
        repositoryRelationship: repoRel,
        repositoryRelationshipLabel: repoRelLabel,
      };
    }
  }

  /**
   * Fetches the decoded content of a specific file from target GitHub repository.
   * Target endpoint: GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}
   * Applies strict per-file bound of 12,000 characters.
   */
  async fetchFileContent(
    ownerParam?: string,
    repoParam?: string,
    pathParam?: string,
    ref = 'main'
  ): Promise<RepositoryFileEvidence | null> {
    const owner = (ownerParam || this.activeConfig.owner).trim();
    const repo = (repoParam || this.activeConfig.repo).trim();
    const filePath = (pathParam || '').trim().replace(/^\/+/, '');

    if (!owner || !repo || !filePath) {
      return null;
    }

    const MAX_FILE_CHARS = 12000;

    // In DEMO_MODE, return realistic synthetic file content without external calls
    if (this.isDemoMode) {
      console.log(`[GitHubIssuesClient] DEMO_MODE active: returning fixture file for ${owner}/${repo}/${filePath}`);
      const mockContent = `# [DEMO FIXTURE] ${filePath}
# Generated file evidence for ${owner}/${repo} in DEMO_MODE.
# Simulated source content for demonstration and testing.

export function exampleModule() {
  return "demo evidence";
}
`;
      return {
        path: filePath,
        ref,
        sha: 'demo-sha-' + Buffer.from(filePath).toString('hex').slice(0, 8),
        htmlUrl: `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
        retrievedAt: new Date().toISOString(),
        content: mockContent,
        sizeBytes: Buffer.byteLength(mockContent, 'utf8'),
        isTruncated: false,
      };
    }

    const targetUrl = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.activeConfig.apiVersion,
      'User-Agent': 'Web-Slinger/1.0 (Human-in-the-Loop OSS Research)',
    };

    if (this.activeConfig.token) {
      headers['Authorization'] = `Bearer ${this.activeConfig.token}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        console.warn(
          `[GitHubIssuesClient] File fetch failed for ${owner}/${repo}/${filePath}: HTTP ${response.status}`
        );
        return null;
      }

      const data = (await response.json()) as {
        type?: string;
        size?: number;
        path?: string;
        sha?: string;
        html_url?: string;
        content?: string;
        encoding?: string;
      };

      if (data.type !== 'file' || !data.content) {
        return null;
      }

      let decodedContent = '';
      if (data.encoding === 'base64') {
        decodedContent = Buffer.from(data.content, 'base64').toString('utf8');
      } else {
        decodedContent = data.content;
      }

      let isTruncated = false;
      let omittedReason: string | undefined;
      let boundedContent = decodedContent;

      if (decodedContent.length > MAX_FILE_CHARS) {
        boundedContent =
          decodedContent.slice(0, MAX_FILE_CHARS) +
          '\n\n[... OMITTED REMAINDER: Truncated at 12,000 characters ...]';
        isTruncated = true;
        omittedReason = 'Exceeded per-file limit of 12,000 characters';
      }

      return {
        path: data.path || filePath,
        ref,
        sha: data.sha || 'unknown-sha',
        htmlUrl: data.html_url || `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
        retrievedAt: new Date().toISOString(),
        content: boundedContent,
        sizeBytes: data.size || Buffer.byteLength(decodedContent, 'utf8'),
        isTruncated,
        omittedReason,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[GitHubIssuesClient] Error fetching file ${owner}/${repo}/${filePath}: ${errorMsg}`
      );
      return null;
    }
  }

  /**
   * Fetches the git tree of the repository for path discovery.
   * Target endpoint: GET https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}?recursive=1
   * Detects and records tree truncation honestly.
   */
  async fetchRepositoryTree(
    ownerParam?: string,
    repoParam?: string,
    ref = 'main',
    recursive = true
  ): Promise<{
    tree: Array<{ path: string; mode: string; type: string; sha: string; size?: number; url: string }>;
    truncated: boolean;
  }> {
    const owner = (ownerParam || this.activeConfig.owner).trim();
    const repo = (repoParam || this.activeConfig.repo).trim();

    if (!owner || !repo) {
      return { tree: [], truncated: false };
    }

    if (this.isDemoMode) {
      console.log(`[GitHubIssuesClient] DEMO_MODE active: returning fixture tree for ${owner}/${repo}`);
      return {
        tree: [
          {
            path: 'curriculum/challenges/english/07-node-js/lecture.md',
            mode: '100644',
            type: 'blob',
            sha: 'demo-tree-sha-1',
            size: 1500,
            url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/demo-tree-sha-1`,
          },
          {
            path: 'README.md',
            mode: '100644',
            type: 'blob',
            sha: 'demo-tree-sha-2',
            size: 4000,
            url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/demo-tree-sha-2`,
          },
          {
            path: 'CONTRIBUTING.md',
            mode: '100644',
            type: 'blob',
            sha: 'demo-tree-sha-3',
            size: 6000,
            url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/demo-tree-sha-3`,
          },
        ],
        truncated: false,
      };
    }

    const recursiveQuery = recursive ? '?recursive=1' : '';
    const targetUrl = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}${recursiveQuery}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.activeConfig.apiVersion,
      'User-Agent': 'Web-Slinger/1.0 (Human-in-the-Loop OSS Research)',
    };

    if (this.activeConfig.token) {
      headers['Authorization'] = `Bearer ${this.activeConfig.token}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[GitHubIssuesClient] Tree fetch failed for ${owner}/${repo}: HTTP ${response.status}`);
        return { tree: [], truncated: false };
      }

      const data = (await response.json()) as {
        sha?: string;
        url?: string;
        tree?: Array<{ path: string; mode: string; type: string; sha: string; size?: number; url: string }>;
        truncated?: boolean;
      };

      const truncated = Boolean(data.truncated);
      if (truncated) {
        console.warn(
          `[GitHubIssuesClient] Tree response for ${owner}/${repo} was truncated by GitHub API. Full recursive search not guaranteed.`
        );
      }

      return {
        tree: data.tree || [],
        truncated,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[GitHubIssuesClient] Error fetching tree for ${owner}/${repo}: ${errorMsg}`);
      return { tree: [], truncated: false };
    }
  }

  /**
   * Discovers candidate file paths relevant to an issue based on keyword matching across the repository tree.
   * Returns up to 8 candidate paths and records whether tree was truncated.
   */
  async findCandidatePaths(
    ownerParam?: string,
    repoParam?: string,
    keywords: string[] = [],
    ref = 'main'
  ): Promise<{ candidatePaths: string[]; truncated: boolean }> {
    const { tree, truncated } = await this.fetchRepositoryTree(ownerParam, repoParam, ref, true);

    if (!tree || tree.length === 0) {
      return { candidatePaths: [], truncated };
    }

    const sanitizedKeywords = keywords
      .map((k) => k.toLowerCase().trim().replace(/[^a-z0-9-_./]/g, ''))
      .filter((k) => k.length >= 3);

    const scoredPaths: { path: string; score: number }[] = [];

    for (const item of tree) {
      if (item.type !== 'blob') continue;
      const lowerPath = item.path.toLowerCase();

      let matchScore = 0;
      for (const kw of sanitizedKeywords) {
        if (lowerPath.includes(kw)) {
          matchScore += kw.length;
        }
      }

      if (matchScore > 0) {
        // Boost markdown and documentation files for curriculum/doc issues
        if (lowerPath.endsWith('.md') || lowerPath.endsWith('.mdx')) {
          matchScore += 10;
        }
        // Boost source files
        if (lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx') || lowerPath.endsWith('.js')) {
          matchScore += 5;
        }
        scoredPaths.push({ path: item.path, score: matchScore });
      }
    }

    scoredPaths.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    const topPaths = scoredPaths.slice(0, 8).map((p) => p.path);

    return {
      candidatePaths: topPaths,
      truncated,
    };
  }
}

export function createDefaultGitHubIssuesClient(): GitHubIssuesClient {
  return new GitHubIssuesClient();
}
