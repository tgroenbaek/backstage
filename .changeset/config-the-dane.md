---
'@backstage/config-loader': minor
---

Configuration validation is now more permissive when it comes to type mismatches between `boolean`, `string`, and `number` types.

For example, configuration was previously marked invalid when a string `'true'` was set on a property expecting type `boolean`. Now, such configurations will be considered valid; their values will be coerced to the expected value according to [these coercion rules](https://ajv.js.org/coercion.html#type-coercion-rules) when configs are processed via the `process` method resolved by a call to `loadConfigSchema` function.
