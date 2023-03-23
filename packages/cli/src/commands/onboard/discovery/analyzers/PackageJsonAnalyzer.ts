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

import {
  ANNOTATION_SOURCE_LOCATION,
  ComponentEntity,
} from '@backstage/catalog-model';
import z from 'zod';
import { Repository, RepositoryFile } from '../integrations/types';
import { AnalysisOutputs, Analyzer } from './types';

/**
 * Looks for package.json files and extracts information out of them.
 */
export class PackageJsonAnalyzer implements Analyzer {
  name(): string {
    return PackageJsonAnalyzer.name;
  }

  async analyzeRepository(options: {
    repository: Repository;
    output: AnalysisOutputs;
  }): Promise<void> {
    const files = await options.repository.files();

    const packageJson = files.filter(file => file.path === 'package.json')[0];
    if (!packageJson) {
      return;
    }

    const content = await readPackageJson(packageJson);
    if (!content) {
      return;
    }

    const name =
      content.name && content.name !== 'root'
        ? content.name.split('/').slice(-1)[0] // remove before slash
        : options.repository.name;

    const entity: ComponentEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name,
        ...(options.repository.description
          ? { description: options.repository.description }
          : {}),
        tags: ['javascript'],
        annotations: {
          [ANNOTATION_SOURCE_LOCATION]: `url:${options.repository.url}`,
        },
      },
      spec: {
        type: 'service',
        lifecycle: 'production',
        owner: 'user:guest',
      },
    };

    options.output.produce({
      type: 'entity',
      path: '/',
      entity,
    });
  }
}

const packageSchema = z.object({
  name: z.string().optional(),
});

async function readPackageJson(
  file: RepositoryFile,
): Promise<z.infer<typeof packageSchema> | undefined> {
  try {
    const text = await file.text();
    const result = packageSchema.safeParse(JSON.parse(text));
    if (!result.success) {
      return undefined;
    }
    return { name: result.data.name };
  } catch (e) {
    return undefined;
  }
}
