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

import { Repository } from '../integrations/types';
import { AnalysisOutputs, Analyzer } from './types';

/**
 * Attempts to locate codeowners files in a repository and injects ownership
 * info into previously entities, if they did not have any such info already.
 */
export class CodeownersAnalyzer implements Analyzer {
  name(): string {
    return CodeownersAnalyzer.name;
  }

  async analyzeRepository(options: {
    repository: Repository;
    output: AnalysisOutputs;
  }): Promise<void> {
    const codeowners = await options.repository
      .files()
      .then(f => f.filter(f2 => f2.path.endsWith('/CODEOWNERS')));

    for (const codeowner of codeowners) {
      const outputs = options.output
        .list()
        .filter(p => p.type === 'entity' && p.path === codeowner.path);
      outputs.forEach(o => {
        o.entity.spec!.owner = `group:${codeowner.owner}`;
      });
    }
    // @foo /bar/buzz
  }
}
