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

import { Entity } from '@backstage/catalog-model';
import { AnalysisOutput, AnalysisOutputs, Analyzer } from './analyzers/types';
import { Integration } from './integrations/types';

class DefaultAnalysisOutputs implements AnalysisOutputs {
  readonly #outputs: AnalysisOutput[] = [];

  produce(output: AnalysisOutput) {
    this.#outputs.push(output);
  }

  list() {
    return [...this.#outputs];
  }
}

export class Analyzers {
  readonly #integrations: Integration[] = [];
  readonly #analyzers: Analyzer[] = [];

  addIntegration(integration: Integration) {
    this.#integrations.push(integration);
  }

  addAnalyzer(analyzer: Analyzer) {
    this.#analyzers.push(analyzer);
  }

  async run(url: string): Promise<{ entities: Entity[] }> {
    const result: Entity[] = [];

    for (const integration of this.#integrations) {
      const repositories = await integration.discover(url);
      if (repositories) {
        for (const repository of repositories) {
          const output = new DefaultAnalysisOutputs();

          for (const analyzer of this.#analyzers) {
            await analyzer.analyzeRepository({ repository, output });
          }

          const entities = output
            .list()
            .filter(o => o.type === 'entity')
            .map(o => o.entity);

          result.push(...entities);
        }

        return {
          entities: result,
        };
      }
    }

    throw new Error(`No integration found for ${url}`);
  }
}
