/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Config } from '@backstage/config';
import { graphql } from '@octokit/graphql';
import parseGitUrl from 'git-url-parse';
import { queryWithPaging, RepositoryResponse } from '../graphql';
import { Integration, Repository, RepositoryFile } from './types';

/**
 * A single file in a GitHub repository.
 */
class GithubFile implements RepositoryFile {
  readonly #path: string;
  #content: Promise<Buffer> | undefined;

  constructor(path: string) {
    this.#path = path;
    this.#content = undefined;
  }

  get path(): string {
    return this.#path;
  }

  async content(): Promise<Buffer> {
    this.#content = this.#doGetContent();
    return this.#content;
  }

  async #doGetContent(): Promise<Buffer> {
    return Buffer.from('{}', 'utf-8');
  }
}

/**
 * A GitHub repository.
 */
class GithubRepository implements Repository {
  readonly #octokit: typeof graphql;
  readonly #repo: RepositoryResponse;
  #files: Promise<RepositoryFile[]> | undefined;

  constructor(octokit: typeof graphql, repo: RepositoryResponse) {
    this.#octokit = octokit;
    this.#repo = repo;
  }

  get url(): string {
    return this.#repo.url;
  }

  get name(): string {
    return this.#repo.name;
  }

  get description(): string | undefined {
    return this.#repo.description;
  }

  files(): Promise<RepositoryFile[]> {
    this.#files ??= this.#doGetFiles();
    return this.#files;
  }

  async #doGetFiles(): Promise<RepositoryFile[]> {
    return [new GithubFile('package.json')];
  }
}

/**
 * Integration for GitHub.
 */
export class GithubIntegration implements Integration {
  readonly #token: string;

  static fromConfig(_config: Config): GithubIntegration {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error(`Missing GITHUB_TOKEN environment variable`);
    }

    return new GithubIntegration(token);
  }

  private constructor(token: string) {
    this.#token = token;
  }

  async discover(url: string): Promise<Repository[] | false> {
    if (!url.startsWith('https://github.com/')) {
      return false;
    }

    // const integrations = ScmIntegrations.fromConfig(fullConfig);
    // const integration = integrations.byUrl(options.url);
    // if (!integration) {
    //   // seems we don't have any auth for this one
    // }

    const parsed = parseGitUrl(url);
    const { name, organization } = parsed;
    const org = organization || name; // depends on if it's a repo url or an org url...

    const client = graphql.defaults({
      // baseUrl: "https://github-enterprise.acme-inc.com/api",
      // TODO: integrations
      headers: { authorization: `token ${this.#token}` },
    });

    const { repositories } = await this.#getOrganizationRepositories(
      client,
      org,
    );

    return repositories.map(r => new GithubRepository(client, r));
  }

  async #getOrganizationRepositories(
    client: typeof graphql,
    org: string,
  ): Promise<{ repositories: RepositoryResponse[] }> {
    const query = `
    query repositories($org: String!, $cursor: String) {
      repositoryOwner(login: $org) {
        login
        repositories(first: 100, after: $cursor) {
          nodes {
            name
            url
            description
            isArchived
            isFork
            repositoryTopics(first: 100) {
              nodes {
                ... on RepositoryTopic {
                  topic {
                    name
                  }
                }
              }
            }
            defaultBranchRef {
              name
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`;

    const repositories = await queryWithPaging(
      client,
      query,
      org,
      r => r.repositoryOwner?.repositories,
      async x => x,
      { org },
    );

    return {
      repositories: repositories.filter(r => !r.isArchived && !r.isFork),
    };
  }
}
