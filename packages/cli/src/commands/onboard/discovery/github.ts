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

import { ScmIntegrations } from '@backstage/integration';
import { ComponentEntity } from '@backstage/catalog-model';
import { graphql } from '@octokit/graphql';
import yaml from 'yaml';
import parseGitUrl from 'git-url-parse';
import { loadCliConfig } from '../../../lib/config';
import { queryWithPaging, RepositoryResponse } from './graphql';

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

  const result = await getOrganizationRepositories(client, org);
  const repos = result.repositories.filter(r => !r.isArchived && !r.isFork);
  const entities = repos.map(repo => makeEntity(repo.name, repo.description));
  console.log(JSON.stringify(entities, null, 2));
}

function makeEntity(name: string, description: string): ComponentEntity {
  console.log(`making ${name} with description ${description}`);
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      description,
    },
    spec: {
      type: 'service',
      lifecycle: 'production',
      owner: 'user:guest',
    },
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

  return { repositories };
}
