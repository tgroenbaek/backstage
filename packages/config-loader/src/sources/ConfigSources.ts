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

import { Config, ConfigReader } from '@backstage/config';
import parseArgs from 'minimist';
import { EnvConfigSource } from './EnvConfigSource';
import { FileConfigSource } from './FileConfigSource';
import { MergeConfigSource } from './MergedConfigSource';
import { RemoteConfigSource } from './RemoteConfigSource';
import { ConfigSource } from './types';
import { ObservableConfigProxy } from './ObservableConfigProxy';
import { LoadConfigOptionsRemote } from '../loader';

export class ConfigSources {
  static parseArgs(
    argv: string[] = process.argv,
  ): Array<{ type: 'url' | 'path'; target: string }> {
    const args: string[] = parseArgs(argv).config ?? [];
    return args.map(target => {
      try {
        // eslint-disable-next-line no-new
        new URL(target);
        return { type: 'url', target };
      } catch {
        return { type: 'path', target };
      }
    });
  }

  static default(options: {
    logger: Logger;
    argv?: string[];
    remote?: LoadConfigOptionsRemote;
    env?: Record<string, string>;
  }): ConfigSource {
    const argSources = this.parseArgs(options.argv).map(arg => {
      if (arg.type === 'url') {
        if (!options.remote) {
          throw new Error(
            `Config argument '${arg.target}' looks like a URL but remote configuration is not enabled. Enable it by passing the \`remote\` option`,
          );
        }
        return RemoteConfigSource.create({ ...options, url: arg.target });
      }
      return FileConfigSource.create({ ...options, path: arg.target });
    });
    const envSource = EnvConfigSource.create(options);

    return this.merge([...argSources, envSource]);
  }

  static merge(sources: ConfigSource[]): ConfigSource {
    return MergeConfigSource.fromConfigSources(sources);
  }

  static toConfig(source: ConfigSource): Promise<LiveConfig> {
    return new Promise(async (resolve, reject) => {
      let config: ObservableConfigProxy | undefined = undefined;
      try {
        const abortController = new AbortController();
        for await (const { data } of source.readConfigData({
          signal: abortController.signal,
        })) {
          if (config) {
            config.setConfig(ConfigReader.fromConfigs(data));
          } else {
            config = ObservableConfigProxy.create(abortController);
            config!.setConfig(ConfigReader.fromConfigs(data));
            resolve(config);
          }
        }
      } catch (error) {
        reject(error);
      }
    });
  }
}

interface LiveConfig extends Config {
  close(): void;
}
