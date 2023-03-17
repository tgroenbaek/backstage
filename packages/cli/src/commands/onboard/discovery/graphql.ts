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

import { graphql } from '@octokit/graphql';

/**
 * Assists in repeatedly executing a query with a paged response.
 *
 * Requires that the query accepts a $cursor variable.
 *
 * @param client - The octokit client
 * @param query - The query to execute
 * @param org - The slug of the org to read
 * @param connection - A function that, given the response, picks out the actual
 *                   Connection object that's being iterated
 * @param transformer - A function that, given one of the nodes in the
 *               Connection, returns the model mapped form of it
 * @param variables - The variable values that the query needs, minus the cursor
 */
export async function queryWithPaging<
  GraphqlType,
  OutputType,
  Variables extends {},
  Response = QueryResponse,
>(
  client: typeof graphql,
  query: string,
  org: string,
  connection: (response: Response) => Connection<GraphqlType> | undefined,
  transformer: (
    item: GraphqlType,
    ctx: TransformerContext,
  ) => Promise<OutputType | undefined>,
  variables: Variables,
): Promise<OutputType[]> {
  const result: OutputType[] = [];

  let cursor: string | undefined = undefined;
  for (let j = 0; j < 1000 /* just for sanity */; ++j) {
    const response: Response = await client(query, {
      ...variables,
      cursor,
    });

    const conn = connection(response);
    if (!conn) {
      throw new Error(`Found no match for ${JSON.stringify(variables)}`);
    }

    for (const node of conn.nodes) {
      const transformedNode = await transformer(node, {
        client,
        query,
        org,
      });

      if (transformedNode) {
        result.push(transformedNode);
      }
    }

    if (!conn.pageInfo.hasNextPage) {
      break;
    } else {
      cursor = conn.pageInfo.endCursor;
    }
  }

  return result;
}

export type Connection<T> = {
  pageInfo: PageInfo;
  nodes: T[];
};

export type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string;
};

type RepositoryTopics = {
  nodes: TopicNodes[];
};

type TopicNodes = {
  topic: {
    name: string;
  };
};

export type QueryResponse = {
  organization?: OrganizationResponse;
  repositoryOwner?: RepositoryOwnerResponse;
};

type RepositoryOwnerResponse = {
  repositories?: Connection<RepositoryResponse>;
};

export type OrganizationResponse = {
  repositories?: Connection<RepositoryResponse>;
};

/**
 * Context passed to Transformers
 *
 * @public
 */
export interface TransformerContext {
  client: typeof graphql;
  query: string;
  org: string;
}

export type RepositoryResponse = {
  name: string;
  url: string;
  isArchived: boolean;
  description: string;
  isFork: boolean;
  repositoryTopics: RepositoryTopics;
  defaultBranchRef: {
    name: string;
  } | null;
  catalogInfoFile: {
    __typename: string;
    id: string;
    text: string;
  } | null;
};
