// Other languages must have exactly the zh-Hant keys, with any string as the value.
// A string key may also get `_one`／`_other` siblings: i18next picks them by `count`
// in languages with a singular (zh has none, so zh-Hant keeps only the bare key).
type Plurals<T> = { readonly [K in keyof T as T[K] extends string ? `${K & string}_one` | `${K & string}_other` : never]?: string };
export type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> } & Plurals<T>;
