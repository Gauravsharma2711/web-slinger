import { NormalizedIssue, SourcePackItem } from '@web-slinger/shared';
import { GitHubConfig, githubConfig, config } from '../config.js';

export const MAX_COMMENTS = 10;
export const MAX_CONTRIBUTING_CHARS = 12000;
export const MAX_README_CHARS = 8000;

export interface SourcePack {
  issue: NormalizedIssue;
  sources: SourcePackItem[];
  allowedSourceUrls: Set<string>;
  sourcePackVersion: string;
}

export interface SourcePackBuilderOptions {
  config?: GitHubConfig;
  baseUrl?: string;
  requestTimeoutMs?: number;
  demoMode?: boolean;
}

export class SourcePackBuilder {
  private activeConfig: GitHubConfig;
  private baseUrl: string;
  private requestTimeoutMs: number;
  private isDemoMode: boolean;

  constructor(options: SourcePackBuilderOptions = {}) {
    this.activeConfig = options.config ?? githubConfig;
    this.baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.isDemoMode = options.demoMode ?? config.demoMode;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.activeConfig.apiVersion,
      'User-Agent': 'Web-Slinger-Backend',
    };
    if (this.activeConfig.token && this.activeConfig.token.length > 0) {
      headers['Authorization'] = `Bearer ${this.activeConfig.token}`;
    }
    return headers;
  }

  private decodeGitHubContent(data: Record<string, unknown>): string {
    if (typeof data.content === 'string') {
      try {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      } catch {
        return String(data.content);
      }
    }
    return '';
  }

  async buildSourcePack(
    issue: NormalizedIssue,
    ownerParam?: string,
    repoParam?: string
  ): Promise<SourcePack> {
    const owner = (ownerParam || this.activeConfig.owner).trim();
    const repo = (repoParam || this.activeConfig.repo).trim();
    const retrievedAt = new Date().toISOString();
    const sources: SourcePackItem[] = [];
    const allowedUrls = new Set<string>();

    const addSource = (title: string, url: string, content: string) => {
      sources.push({
        title,
        url,
        retrievedAt,
        content,
      });
      allowedUrls.add(url);
    };

    // 1. Primary Source: Selected Issue
    const issueBodyText = issue.body ? issue.body : '(No issue description body provided)';
    const issueSourceContent = `Issue #${issue.number}: ${issue.title}
Repository: ${owner}/${repo}
State: ${issue.state}
Author: ${issue.author || 'unknown'}
Labels: ${issue.labels.join(', ') || 'none'}
Created: ${issue.created_at}
Updated: ${issue.updated_at}

Body:
${issueBodyText}`;

    addSource(`Issue #${issue.number}: ${issue.title}`, issue.html_url, issueSourceContent);

    // DEMO MODE / FIXTURE: Return synthetic source pack with exact bounds
    if (this.isDemoMode || issue.is_fixture) {
      console.log(
        `[SourcePackBuilder] Building fixture source pack for issue #${issue.number} (${owner}/${repo})`
      );

      // Fixture Repo Metadata
      const repoUrl = `https://github.com/${owner}/${repo}`;
      addSource(
        `Repository Metadata: ${owner}/${repo}`,
        repoUrl,
        `Repository: ${owner}/${repo}
Description: Open source codebase matching profile
Primary Language: TypeScript
Default Branch: main`
      );

      // Fixture Comments (2 comments)
      const comment1Url = `https://github.com/${owner}/${repo}/issues/${issue.number}#issuecomment-101`;
      addSource(
        `Comment by maintainer on Issue #${issue.number}`,
        comment1Url,
        `Author: maintainer
Created: ${issue.created_at}
Body:
Thanks for raising this issue. We welcome pull requests addressing this topic. Please ensure unit tests pass before submitting for review.`
      );

      // Fixture CONTRIBUTING.md
      const contribUrl = `https://github.com/${owner}/${repo}/blob/main/CONTRIBUTING.md`;
      const fixtureContrib = `# Contributing to ${repo}

Thank you for your interest in contributing!

## Development Setup
1. Fork and clone the repository.
2. Run \`pnpm install\` and \`pnpm test\`.
3. Open a draft pull request with clear evidence and testing notes.

## Guidelines
- Follow existing code style.
- All contributions must pass CI tests.`.slice(0, MAX_CONTRIBUTING_CHARS);

      addSource(`Contributing Guide: ${owner}/${repo}`, contribUrl, fixtureContrib);

      // Fixture README.md
      const readmeUrl = `https://github.com/${owner}/${repo}/blob/main/README.md`;
      const fixtureReadme = `# ${repo}

Open source application framework.
Visit our documentation for architectural overviews and guidelines.`.slice(
        0,
        MAX_README_CHARS
      );

      addSource(`README: ${owner}/${repo}`, readmeUrl, fixtureReadme);

      return {
        issue,
        sources,
        allowedSourceUrls: allowedUrls,
        sourcePackVersion: '1.0',
      };
    }

    const headers = this.getAuthHeaders();

    // 2. Fetch Repository Metadata
    try {
      const repoRes = await fetch(
        `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        }
      );
      if (repoRes.ok) {
        const repoData = (await repoRes.json()) as Record<string, unknown>;
        const repoUrl =
          typeof repoData.html_url === 'string'
            ? repoData.html_url
            : `https://github.com/${owner}/${repo}`;
        const repoContent = `Repository: ${owner}/${repo}
Description: ${repoData.description || 'None'}
Primary Language: ${repoData.language || 'Unknown'}
Default Branch: ${repoData.default_branch || 'main'}
Topics: ${Array.isArray(repoData.topics) ? repoData.topics.join(', ') : 'none'}`;

        addSource(`Repository Metadata: ${owner}/${repo}`, repoUrl, repoContent);
      }
    } catch (err) {
      console.warn(`[SourcePackBuilder] Could not fetch repo metadata for ${owner}/${repo}:`, err);
    }

    // 3. Fetch Recent Comments (Max 10)
    try {
      const commentsRes = await fetch(
        `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issue.number}/comments?per_page=${MAX_COMMENTS}&sort=created&direction=desc`,
        {
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        }
      );

      if (commentsRes.ok) {
        const commentsData = (await commentsRes.json()) as Record<string, unknown>[];
        if (Array.isArray(commentsData)) {
          const boundedComments = commentsData.slice(0, MAX_COMMENTS);
          for (const comment of boundedComments) {
            const author =
              comment.user && typeof comment.user === 'object' && 'login' in comment.user
                ? String((comment.user as Record<string, unknown>).login)
                : 'contributor';
            const commentUrl =
              typeof comment.html_url === 'string'
                ? comment.html_url
                : `${issue.html_url}#issuecomment-${comment.id}`;
            const commentBody = String(comment.body || '');

            const commentContent = `Author: ${author}
Created: ${comment.created_at || 'unknown'}

Body:
${commentBody}`;

            addSource(
              `Comment by ${author} on Issue #${issue.number}`,
              commentUrl,
              commentContent
            );
          }
        }
      }
    } catch (err) {
      console.warn(
        `[SourcePackBuilder] Could not fetch comments for issue #${issue.number}:`,
        err
      );
    }

    // 4. Fetch Optional CONTRIBUTING.md (Up to 12,000 characters)
    try {
      let contribRes = await fetch(
        `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/CONTRIBUTING.md`,
        {
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        }
      );

      if (!contribRes.ok) {
        // Try .github/CONTRIBUTING.md
        contribRes = await fetch(
          `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
            repo
          )}/contents/.github/CONTRIBUTING.md`,
          {
            headers,
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          }
        );
      }

      if (contribRes.ok) {
        const contribData = (await contribRes.json()) as Record<string, unknown>;
        const rawContent = this.decodeGitHubContent(contribData);
        const boundedContent = rawContent.slice(0, MAX_CONTRIBUTING_CHARS);
        const contribUrl =
          typeof contribData.html_url === 'string'
            ? contribData.html_url
            : `https://github.com/${owner}/${repo}/blob/HEAD/CONTRIBUTING.md`;

        addSource(`Contributing Guide: ${owner}/${repo}`, contribUrl, boundedContent);
      }
    } catch (err) {
      console.warn(`[SourcePackBuilder] Could not fetch CONTRIBUTING.md for ${owner}/${repo}:`, err);
    }

    // 5. Fetch Optional README.md (Up to 8,000 characters)
    try {
      const readmeRes = await fetch(
        `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
        {
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        }
      );

      if (readmeRes.ok) {
        const readmeData = (await readmeRes.json()) as Record<string, unknown>;
        const rawContent = this.decodeGitHubContent(readmeData);
        const boundedContent = rawContent.slice(0, MAX_README_CHARS);
        const readmeUrl =
          typeof readmeData.html_url === 'string'
            ? readmeData.html_url
            : `https://github.com/${owner}/${repo}/blob/HEAD/README.md`;

        addSource(`README: ${owner}/${repo}`, readmeUrl, boundedContent);
      }
    } catch (err) {
      console.warn(`[SourcePackBuilder] Could not fetch README for ${owner}/${repo}:`, err);
    }

    return {
      issue,
      sources,
      allowedSourceUrls: allowedUrls,
      sourcePackVersion: '1.0',
    };
  }
}

export function createDefaultSourcePackBuilder(): SourcePackBuilder {
  return new SourcePackBuilder();
}
