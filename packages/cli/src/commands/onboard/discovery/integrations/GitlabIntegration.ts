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
  ScmIntegrationRegistry,
  ScmIntegrations,
} from '@backstage/integration';
import fetch from 'node-fetch';
import { Integration, Repository, RepositoryFile } from './types';

type GitlabCredentials = {
  headers?: { [name: string]: string };
  token?: string;
};

interface GitlabCredentialsProvider {
  getCredentials(opts: { url: string }): Promise<GitlabCredentials>;
}

class SingleInstanceGitlabCredentialsProvider
  implements GitlabCredentialsProvider
{
  async getCredentials(_opts: { url: string }): Promise<GitlabCredentials> {
    throw new Error('Not implemented');
  }
}

class DefaultGitlabCredentialsProvider implements GitlabCredentialsProvider {
  static fromIntegrations(integrations: ScmIntegrationRegistry) {
    const credentialsProviders: Map<string, GitlabCredentialsProvider> =
      new Map<string, GitlabCredentialsProvider>();

    integrations.gitlab.list().forEach(integration => {
      const credentialsProvider = new SingleInstanceGitlabCredentialsProvider();
      credentialsProviders.set(integration.config.host, credentialsProvider);
    });
    return new DefaultGitlabCredentialsProvider(credentialsProviders);
  }

  private constructor(
    private readonly providers: Map<string, GitlabCredentialsProvider>,
  ) {}

  async getCredentials(opts: { url: string }): Promise<GitlabCredentials> {
    const parsed = new URL(opts.url);
    const provider = this.providers.get(parsed.host);

    if (!provider) {
      throw new Error(
        `There is no GitLab integration that matches ${opts.url}. Please add a configuration for an integration.`,
      );
    }

    return provider.getCredentials(opts);
  }
}

type ProjectResponse = {
  id: string;
  name: string;
  description: string;
  owner: {
    username: string;
  };
  web_url: string;
};

type FileResponse = {
  id: string;
  name: string;
  type: string;
  path: string;
  mode: string;
};

type BranchResponse = {
  default: boolean;
  name: string;
};

type FileContentResponse = {
  content: string;
};

class GitlabProject implements Repository {
  constructor(
    private readonly project: ProjectResponse,
    private readonly apiBaseUrl: string,
    private readonly headers: { [name: string]: string },
  ) {}

  get url(): string {
    return this.project.web_url;
  }

  get name(): string {
    return this.project.name;
  }

  get owner(): string {
    return this.project.owner.username;
  }

  get description(): string {
    return this.project.description;
  }

  async files(): Promise<RepositoryFile[]> {
    const response = await fetch(
      `${this.apiBaseUrl}/projects/${this.project.id}/repository/tree`,
      { headers: this.headers },
    );
    const files: FileResponse[] = await response.json();

    return files.map(file => ({
      path: file.path,
      text: async () => {
        const mainBranch = await this.#getMainBranch();
        return await this.#getFileContent(file, mainBranch);
      },
    }));
  }

  async #getFileContent(
    file: FileResponse,
    mainBranch: string,
  ): Promise<string> {
    const response = await fetch(
      `${this.apiBaseUrl}/projects/${this.project.id}/repository/files/${file.path}?ref=${mainBranch}`,
      { headers: this.headers },
    );
    const { content }: FileContentResponse = await response.json();

    return Buffer.from(content, 'base64').toString('ascii');
  }

  async #getMainBranch(): Promise<string> {
    const response = await fetch(
      `${this.apiBaseUrl}/projects/${this.project.id}/repository/branches`,
      { headers: this.headers },
    );
    const branches: BranchResponse[] = await response.json();

    return branches.find(branch => branch.default)?.name ?? 'main';
  }
}

export class GitlabIntegration implements Integration {
  readonly #envToken: string | undefined;
  readonly #scmIntegrations: ScmIntegrations;
  readonly #credentialsProvider: GitlabCredentialsProvider;

  static fromConfig(config: Config): GitlabIntegration {
    const envToken = process.env.GITLAB_TOKEN || undefined;
    const scmIntegrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGitlabCredentialsProvider.fromIntegrations(scmIntegrations);

    return new GitlabIntegration(
      envToken,
      scmIntegrations,
      credentialsProvider,
    );
  }

  private constructor(
    envToken: string | undefined,
    integrations: ScmIntegrations,
    credentialsProvider: GitlabCredentialsProvider,
  ) {
    this.#envToken = envToken;
    this.#scmIntegrations = integrations;
    this.#credentialsProvider = credentialsProvider;
  }

  name(): string {
    return 'GitLab';
  }

  type(): string {
    return 'Project';
  }

  async discover(url: string): Promise<false | GitlabProject[]> {
    const { origin, pathname } = new URL(url);
    const [, user] = pathname.split('/');

    const scmIntegration = this.#scmIntegrations.gitlab.byUrl(origin);
    if (!scmIntegration) {
      throw new Error(`No GitLab integration found for ${origin}`);
    }

    const headers = await this.#getRequestHeaders(origin);

    const response = await fetch(
      `${scmIntegration.config.apiBaseUrl}/users/${user}/projects`,
      { headers },
    );
    const projects: ProjectResponse[] = await response.json();

    return projects.map(
      project =>
        new GitlabProject(project, scmIntegration.config.apiBaseUrl, headers),
    );
  }

  async #getRequestHeaders(url: string): Promise<Record<string, string>> {
    try {
      const credentials = await this.#credentialsProvider.getCredentials({
        url,
      });
      if (credentials.headers) {
        return credentials.headers;
      } else if (credentials.token) {
        return { authorization: `Bearer ${credentials.token}` };
      }
    } catch {
      // ignore silently
    }

    if (this.#envToken) {
      return { authorization: `Bearer ${this.#envToken}` };
    }

    throw new Error(
      'No token available for GitLab, please set a GITLAB_TOKEN env variable',
    );
  }
}
