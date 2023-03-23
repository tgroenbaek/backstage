/*
 * Copyright 2020 The Backstage Authors
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

import { compileConfigSchemas } from './compile';
import { ValidationFunc } from './types';

describe('compileConfigSchemas', () => {
  it('should merge schemas', () => {
    const validate = compileConfigSchemas([
      {
        path: 'a',
        value: { type: 'object', properties: { a: { type: 'string' } } },
      },
      {
        path: 'b',
        value: { type: 'object', properties: { b: { type: 'number' } } },
      },
    ]);
    expect(validate([{ data: { a: [1] }, context: 'test' }])).toEqual({
      errors: [
        {
          keyword: 'type',
          instancePath: '/a',
          schemaPath: '#/properties/a/type',
          message: 'must be string',
          params: { type: 'string' },
        },
      ],
      visibilityByDataPath: new Map(),
      visibilityBySchemaPath: new Map(),
      deprecationByDataPath: new Map(),
    });
    expect(validate([{ data: { b: 'b' }, context: 'test' }])).toEqual({
      errors: [
        {
          keyword: 'type',
          instancePath: '/b',
          schemaPath: '#/properties/b/type',
          message: 'must be number',
          params: { type: 'number' },
        },
      ],
      visibilityByDataPath: new Map(),
      visibilityBySchemaPath: new Map(),
      deprecationByDataPath: new Map(),
    });
  });

  it('should discover visibilities', () => {
    const validate = compileConfigSchemas([
      {
        path: 'a1',
        value: {
          type: 'object',
          properties: {
            a: { type: 'string', visibility: 'frontend' },
            b: { type: 'string', visibility: 'backend' },
            c: { type: 'string' },
            d: {
              type: 'array',
              visibility: 'secret',
              items: { type: 'string', visibility: 'frontend' },
            },
          },
        },
      },
      {
        path: 'a2',
        value: {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'string', visibility: 'secret' },
            c: { type: 'string', visibility: 'backend' },
            d: {
              type: 'array',
              visibility: 'secret',
              items: { type: 'string' },
            },
          },
        },
      },
    ]);
    expect(
      validate([
        { data: { a: 'a', b: 'b', c: 'c', d: ['d'] }, context: 'test' },
      ]),
    ).toEqual({
      visibilityByDataPath: new Map(
        Object.entries({
          '/a': 'frontend',
          '/b': 'secret',
          '/d': 'secret',
          '/d/0': 'frontend',
        }),
      ),
      visibilityBySchemaPath: new Map(
        Object.entries({
          '/properties/a': 'frontend',
          '/properties/b': 'secret',
          '/properties/d': 'secret',
          '/properties/d/items': 'frontend',
        }),
      ),
      deprecationByDataPath: new Map(),
    });
  });

  it('should reject visibility conflicts', () => {
    expect(() =>
      compileConfigSchemas([
        {
          path: 'a1',
          value: {
            type: 'object',
            properties: { a: { type: 'string', visibility: 'frontend' } },
          },
        },
        {
          path: 'a2',
          value: {
            type: 'object',
            properties: { a: { type: 'string', visibility: 'secret' } },
          },
        },
      ]),
    ).toThrow(
      "Config schema visibility is both 'frontend' and 'secret' for properties/a/visibility",
    );
  });

  it('should discover deprecations', () => {
    const validate = compileConfigSchemas([
      {
        path: 'a1',
        value: {
          type: 'object',
          properties: {
            a: { type: 'string', deprecated: 'deprecation reason for a' },
            b: { type: 'string', deprecated: 'deprecation reason for b' },
            c: { type: 'string' },
          },
        },
      },
    ]);
    expect(
      validate([
        { data: { a: 'a', b: 'b', c: 'c', d: ['d'] }, context: 'test' },
      ]),
    ).toEqual({
      deprecationByDataPath: new Map(
        Object.entries({
          '/a': 'deprecation reason for a',
          '/b': 'deprecation reason for b',
        }),
      ),
      visibilityByDataPath: new Map(),
      visibilityBySchemaPath: new Map(),
    });
  });

  describe('should mutate configs if values can be coerced', () => {
    let validate: ValidationFunc;

    beforeEach(() => {
      validate = compileConfigSchemas([
        {
          path: 'a',
          value: { type: 'object', properties: { a: { type: 'string' } } },
        },
        {
          path: 'b',
          value: { type: 'object', properties: { b: { type: 'number' } } },
        },
        {
          path: 'c',
          value: { type: 'object', properties: { c: { type: 'boolean' } } },
        },
      ]);
    });

    it('from strings', () => {
      const configs = [
        { data: { a: 'already a string' }, context: 'test' },
        { data: { b: '123' }, context: 'test' },
        { data: { c: 'true' }, context: 'test' },
      ];

      validate(configs);

      expect(configs[0].data.a).toStrictEqual('already a string');
      expect(configs[1].data.b).toStrictEqual(123);
      expect(configs[2].data.c).toStrictEqual(true);
    });

    it('from numbers', () => {
      const configs = [
        { data: { a: 42 }, context: 'test' },
        { data: { b: 3.14 }, context: 'test' },
        { data: { c: 0 }, context: 'test' },
      ];

      validate(configs);

      expect(configs[0].data.a).toStrictEqual('42');
      expect(configs[1].data.b).toStrictEqual(3.14);
      expect(configs[2].data.c).toStrictEqual(false);
    });

    it('from booleans', () => {
      const configs = [
        { data: { a: true }, context: 'test' },
        { data: { b: false }, context: 'test' },
        { data: { c: true }, context: 'test' },
      ];

      validate(configs);

      expect(configs[0].data.a).toStrictEqual('true');
      expect(configs[1].data.b).toStrictEqual(0);
      expect(configs[2].data.c).toStrictEqual(true);
    });

    it('from invalid strings', () => {
      const configs = [
        { data: { b: 'not a number' }, context: 'test' },
        { data: { c: 'not a boolean' }, context: 'test' },
      ];

      expect(validate(configs)).toEqual({
        errors: [
          {
            keyword: 'type',
            instancePath: '/b',
            schemaPath: '#/properties/b/type',
            message: 'must be number',
            params: { type: 'number' },
          },
          {
            keyword: 'type',
            instancePath: '/c',
            schemaPath: '#/properties/c/type',
            message: 'must be boolean',
            params: { type: 'boolean' },
          },
        ],
        visibilityByDataPath: new Map(),
        visibilityBySchemaPath: new Map(),
        deprecationByDataPath: new Map(),
      });
    });

    it('from invalid numbers', () => {
      const configs = [{ data: { c: 3 }, context: 'test' }];

      expect(validate(configs)).toEqual({
        errors: [
          {
            keyword: 'type',
            instancePath: '/c',
            schemaPath: '#/properties/c/type',
            message: 'must be boolean',
            params: { type: 'boolean' },
          },
        ],
        visibilityByDataPath: new Map(),
        visibilityBySchemaPath: new Map(),
        deprecationByDataPath: new Map(),
      });
    });
  });
});
