export interface TypedEvent<TType = string, TDetails = unknown> {
  readonly type: TType
  readonly detail?: TDetails
}

export type TypedEventListener<TType = string, TDetails = unknown> = (event: TypedEvent<TType, TDetails>) => void

export class TypedEventTarget<
  TNames extends string = string,
  TDetail = unknown
> {
  readonly map = new Map<TNames, Array<[TEventListener<TNames, TDetail>, boolean]>>()
  addEventListener (type: TNames, listener: TEventListener<TNames, TDetail>, options?: { readonly once: boolean }): void {
    const listeners = this.map
    const found = listeners.get(type)
    const once = options?.once ?? false
    if (found === undefined) {
      listeners.set(type, [[listener, once]])
    } else {
      found.push([listener, once])
    }
  }

  removeEventListener (type: TNames, listener: TEventListener<TNames, TDetail>): void {
    const listeners = this.map.get(type)
    if (listeners === undefined) {
      return
    }
    for (let i = 0; i < listeners.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const callback = listeners[i]![0]!
      if (callback === listener) {
        listeners.splice(i, 1)
        return
      }
    }
  }

  dispatchEvent (event: TypedEvent<TNames, TDetail>): boolean {
    const type = event.type
    const found = this.map.get(type)
    if (found === undefined) {
      return true
    }
    for (let i = 0; i < found.length; i++) {
      const [callback, once] = found[i]!
      callback(event)
      if (once) {
        this.removeEventListener(type, callback)
        i--
      }
    }
    return true
  }

  dispose (): void {
    this.map.clear()
  }
}

// The T stands for "Typed" to distinguish it from the native EventTarget / CustomEvent etc.

/**
 * A type representing a detail for the custom event.
 * @typeParam Key - The keys for the detail type, can be string, number, or symbol.
 * @typeParam Value - The value of the detail, default is any.
 */
export type DetailType<Key extends string | number | symbol = string, Value = unknown> = Readonly<Record<Key, Value>>

/**
 * A type representing the names for the custom event, default is string.
 */
export type NamesType = string

/**
 * A type representing a listener for the custom event.
 * @typeParam Names - The names for the custom event.
 * @typeParam Details - The detail type for the custom event.
 */
export type TEventListener<Names extends NamesType, Details> = (event: TCustomEvent<Names, Details>) => void

export interface TCustomEvent<Names extends NamesType, Detail> {
  readonly type: Names[number]
  readonly detail?: Detail
}
