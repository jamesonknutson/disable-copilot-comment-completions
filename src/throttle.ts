export function throttled<T extends (...args: any[]) => any>(fn: T, delayMilliseconds: number) {
  let timeoutId: NodeJS.Timeout | undefined = undefined
  let result: ReturnType<T> | undefined = undefined
  let executed = false
  let timeoutArguments: Parameters<T> | undefined = undefined
  let timeoutThis: any | undefined = undefined
  let timestamp: number | undefined = undefined

  function runFn(this: any, ...args: Parameters<T>): ReturnType<T> {
    result = fn.apply(this, args)
    executed = true
    timestamp = Date.now()
    return result!
  }

  function execute(this: any, ...args: Parameters<T>): ReturnType<T> {
    // Check to see if we should delay this execution.
    const elapsedMs = Date.now() - (timestamp ?? 0)
    if (elapsedMs >= delayMilliseconds) {
      // We can execute right away.
      return runFn.apply(this, args)
    }

    // We must schedule the next execution and return the cached result.
    // Check to see if we already have a pending timeout.
    if (timeoutId !== undefined) {
      // Ok, this means we must have ran the function at least once.
      if (!executed) {
        throw new Error(`We must have executed at least once, if timeoutId is not undefined.`)
      }

      // Return the cached result.
      return result!
    }

    // We must not have a currently pending timeout. Schedule one.
    timeoutId = setTimeout(() => {
      runFn.apply(this, args)
      timeoutId = undefined
    }, delayMilliseconds - elapsedMs)

    // Ok, this means we must have ran the function at least once.
    if (!executed) {
      throw new Error(`We must have executed at least once, if timeoutId is not undefined.`)
    }

    return result!
  }

  return execute
}
