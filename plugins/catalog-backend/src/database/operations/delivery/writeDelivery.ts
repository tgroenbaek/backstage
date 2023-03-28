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
import { EntityProviderMutation } from '@backstage/plugin-catalog-node';
import { Knex } from 'knex';

export const internals = {
  serializeEntity(entity: unknown): string {},
};

export async function writeDelivery(
  tx: Knex.Transaction,
  providerName: string,
  delivery: EntityProviderMutation,
): Promise<{ transactionIds: string[] }> {
  const transactionIds: string[] = [];

  if (delivery.type === 'full') {
    const deliveryRow = await tx
      .insert({
        provider_name: providerName,
        action: 'replace',
        started_at: tx.fn.now(),
        ended_at: tx.fn.now(),
      })
      .into('deliveries')
      .returning('id');
  } else {
    const deliveryRow = await tx
      .insert({
        provider_name: providerName,
        action: 'upsert',
        started_at: tx.fn.now(),
        ended_at: tx.fn.now(),
      })
      .into('deliveries')
      .returning('id');
  }

  return { transactionIds };
}
