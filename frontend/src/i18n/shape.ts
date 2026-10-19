// Other languages must have exactly the zh-Hant keys, with any string as the value.
export type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
