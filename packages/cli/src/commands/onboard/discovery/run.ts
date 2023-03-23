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

import fs from 'fs-extra';
import yaml from 'yaml';
import { loadCliConfig } from '../../../lib/config';
import { updateConfigFile } from '../config';
import { APP_CONFIG_FILE, EXAMPLE_CATALOG_FILE } from '../files';
import { Analyzers } from './Analyzers';
import { BasicRepositoryEntityAnalyzer } from './analyzers/BasicRepositoryEntityAnalyzer';
import { PackageJsonAnalyzer } from './analyzers/PackageJsonAnalyzer';
import { GithubIntegration } from './integrations/GithubIntegration';

export async function run(options: { url: string }) {
  const { fullConfig: config } = await loadCliConfig({
    args: [], // process.argv.slice(1),
    fromPackage: '@backstage/cli',
    mockEnv: true,
    fullVisibility: true,
  });

  const analyzers = new Analyzers();
  analyzers.addIntegration(GithubIntegration.fromConfig(config));
  // analyzers.addAnalyzer(new BasicRepositoryEntityAnalyzer());
  analyzers.addAnalyzer(new PackageJsonAnalyzer());

  const { entities } = await analyzers.run(options.url);

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
