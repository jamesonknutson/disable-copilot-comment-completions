import '@total-typescript/ts-reset/dist/recommended'
import '@total-typescript/ts-reset/dist/fetch'
import '@total-typescript/ts-reset/dist/filter-boolean'
import '@total-typescript/ts-reset/dist/is-array'
import '@total-typescript/ts-reset/dist/json-parse'
import '@total-typescript/ts-reset/dist/map-constructor'
import '@total-typescript/ts-reset/dist/map-has'
import '@total-typescript/ts-reset/dist/promise-catch'
import '@total-typescript/ts-reset/dist/set-has'
import '@total-typescript/ts-reset/dist/storage'
import '@total-typescript/ts-reset/dist/utils'

interface ReadonlyArray<T> {
  includes<U extends T | (TSReset.WidenLiteral<T> & {})>(searchElement: U, fromIndex?: number): searchElement is T
}

interface Array<T> {
  includes<U extends T | (TSReset.WidenLiteral<T> & {})>(searchElement: U, fromIndex?: number): searchElement is T
}
