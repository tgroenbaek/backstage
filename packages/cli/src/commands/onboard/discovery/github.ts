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

// import { ScmIntegrations } from '@backstage/integration';
// eslint-disable-next-line @backstage/no-undeclared-imports
import { ComponentEntity, Entity } from '@backstage/catalog-model';
import { graphql } from '@octokit/graphql';
import yaml from 'yaml';
import fs from 'fs-extra';
import parseGitUrl from 'git-url-parse';
// import { loadCliConfig } from '../../../lib/config';
import { queryWithPaging, RepositoryResponse } from './graphql';
import { updateConfigFile } from '../config';
import { APP_CONFIG_FILE, EXAMPLE_CATALOG_FILE } from '../files';

type Options = {
  url: string;
  token: string;
};

export async function discover(options: Options) {
  // const { fullConfig } = await loadCliConfig({
  //   args: process.argv.slice(1),
  //   fromPackage: '@backstage/cli',
  //   mockEnv: true,
  //   fullVisibility: true,
  // });

  // console.log(fullConfig);

  // const integrations = ScmIntegrations.fromConfig(fullConfig);
  // const integration = integrations.byUrl(options.url);
  // if (!integration) {
  //   // seems we don't have any auth for this one
  // }

  const parsed = parseGitUrl(options.url);
  // yeah it's complicated
  const { name, organization } = parsed;
  const org = organization || name;

  // if (!repoName) { list repos with a query ... }

  //   graphql = graphql.defaults({
  //     baseUrl: "https://github-enterprise.acme-inc.com/api",
  //     headers: {
  //       authorization: `token secret123`,
  //     },
  //   });

  const client = graphql.defaults({
    // TODO: integrations
    headers: { authorization: `token ${options.token}` },
  });

  const { repositories } = await getOrganizationRepositories(client, org);
  const { entities } = await analyzeRepositories(repositories);

  let payload = '';
  for (const entity of entities) {
    payload += `---\n${yaml.stringify(entity)}`;
  }
  await fs.writeFile(EXAMPLE_CATALOG_FILE, payload);
  console.log('Wrote example.yaml');

  await updateConfigFile(APP_CONFIG_FILE, {
    catalog: {
      locations: [
        {
          type: 'file',
          target: EXAMPLE_CATALOG_FILE,
        },
      ],
    },
  });
}

async function analyzeRepositories(
  repositories: RepositoryResponse[],
): Promise<{ entities: Entity[] }> {
  const entities: Entity[] = [];
  for (const repository of repositories) {
    try {
      const { entities: repoEntities } = await analyzeRepository(repository);
      entities.push(...repoEntities);
    } catch (e) {
      throw new Error(
        `Failed to analyze repository "${repository.name}", ${e}`,
      );
    }
  }

  return {
    entities,
  };
}

async function analyzeRepository(
  repository: RepositoryResponse,
): Promise<{ entities: Entity[] }> {
  const dummy: ComponentEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: repository.name,
      ...(repository.description
        ? { description: repository.description }
        : {}),
    },
    spec: {
      type: 'service',
      lifecycle: 'production',
      owner: 'user:guest',
    },
  };

  return {
    entities: [dummy],
  };
}

export async function getOrganizationRepositories(
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

  return { repositories: repositories.filter(r => !r.isArchived && !r.isFork) };
}
