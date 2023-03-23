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
import {
  DefaultGithubCredentialsProvider,
  GithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { graphql } from '@octokit/graphql';
import parseGitUrl from 'git-url-parse';
import { queryWithPaging, RepositoryResponse } from '../graphql';
import { Integration, Repository, RepositoryFile } from './types';
import {
  Repository as GraphqlRepository,
  Tree as GraphqlTree,
  Blob as GraphqlBlob,
} from '@octokit/graphql-schema';

/**
 * A single file in a GitHub repository.
 */
class GithubFile implements RepositoryFile {
  readonly #path: string;
  readonly #content: string;

  constructor(path: string, content: string) {
    this.#path = path;
    this.#content = content;
  }

  get path(): string {
    return this.#path;
  }

  async text(): Promise<string> {
    return this.#content;
  }
}

/**
 * A GitHub repository.
 */
class GithubRepository implements Repository {
  readonly #client: typeof graphql;
  readonly #repo: RepositoryResponse;
  readonly #org: string;
  #files: Promise<RepositoryFile[]> | undefined;

  constructor(client: typeof graphql, repo: RepositoryResponse, org: string) {
    this.#client = client;
    this.#repo = repo;
    this.#org = org;
  }

  get url(): string {
    return this.#repo.url;
  }

  get name(): string {
    return this.#repo.name;
  }

  get owner(): string {
    return this.#org;
  }

  get description(): string | undefined {
    return this.#repo.description;
  }

  files(): Promise<RepositoryFile[]> {
    this.#files ??= this.#doGetFiles();
    return this.#files;
  }

  async #doGetFiles(): Promise<RepositoryFile[]> {
    const query = `query RepoFiles($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        object(expression: "HEAD:") {
          ... on Tree {
            entries {
              name
              type
              object {
                ... on Blob {
                  byteSize
                  text
                  isBinary
                }
              }
            }
          }
        }
      }
    }
    `;

    const response = await this.#client<{ repository: GraphqlRepository }>(
      query,
      {
        name: this.#repo.name,
        owner: this.#org,
      },
    );

    const tree = response.repository.object;
    if (tree) {
      return (
        (tree as GraphqlTree).entries
          ?.filter(
            e => e.type === 'blob' && !(e.object as GraphqlBlob).isBinary,
          )
          .map(
            e => new GithubFile(e.name, (e.object as GraphqlBlob).text ?? ''),
          ) ?? []
      );
    }
    return [];
  }
}

/**
 * Integration for GitHub.
 */
export class GithubIntegration implements Integration {
  readonly #envToken: string | undefined;
  readonly #scmIntegrations: ScmIntegrations;
  readonly #credentialsProvider: GithubCredentialsProvider;

  static fromConfig(config: Config): GithubIntegration {
    const envToken = process.env.GITHUB_TOKEN || undefined;
    const scmIntegrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(scmIntegrations);
    return new GithubIntegration(
      envToken,
      scmIntegrations,
      credentialsProvider,
    );
  }

  private constructor(
    envToken: string | undefined,
    integrations: ScmIntegrations,
    credentialsProvider: GithubCredentialsProvider,
  ) {
    this.#envToken = envToken;
    this.#scmIntegrations = integrations;
    this.#credentialsProvider = credentialsProvider;
  }

  name(): string {
    return 'GitHub';
  }

  async discover(url: string): Promise<Repository[] | false> {
    if (!url.startsWith('https://github.com/')) {
      return false;
    }

    const scmIntegration = this.#scmIntegrations.github.byUrl(url);
    if (!scmIntegration) {
      throw new Error(`No GitHub integration found for ${url}`);
    }

    const parsed = parseGitUrl(url);
    const { name, organization } = parsed;
    const org = organization || name; // depends on if it's a repo url or an org url...

    const client = graphql.defaults({
      baseUrl: scmIntegration.config.apiBaseUrl,
      headers: await this.#getRequestHeaders(url),
    });

    const { repositories } = await this.#getOrganizationRepositories(
      client,
      org,
    );

    return repositories.map(repo => new GithubRepository(client, repo, org));
  }

  async #getRequestHeaders(url: string): Promise<Record<string, string>> {
    try {
      const credentials = await this.#credentialsProvider.getCredentials({
        url,
      });
      if (credentials.headers) {
        return credentials.headers;
      } else if (credentials.token) {
        return { authorization: `token ${credentials.token}` };
      }
    } catch {
      // ignore silently
    }

    if (this.#envToken) {
      return { authorization: `token ${this.#envToken}` };
    }

    throw new Error(
      'No token available for GitHub, please configure your integrations or set a GITHUB_TOKEN env variable',
    );
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
