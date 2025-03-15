import '@total-typescript/ts-reset/recommended'

interface ReadonlyArray<T> {
  includes<U extends T | (TSReset.WidenLiteral<T> & {})>(searchElement: U, fromIndex?: number): searchElement is T
}

interface Array<T> {
  includes<U extends T | (TSReset.WidenLiteral<T> & {})>(searchElement: U, fromIndex?: number): searchElement is T
}
