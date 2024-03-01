export function isAudioBuffer(thing: unknown): thing is AudioBuffer {
  return (thing as any)?.name === "AudioBuffer"
}

export type Decoder = Pick<AudioContext, 'decodeAudioData'>;
export type SoundPromiseState = 0 | 1 | 2 | 3 | 4;
export type SoundPromiseStateName = 'UNLOADED' | 'LOADING' | 'LOADED' | 'REJECTED' | 'DISPOSED';

export class SoundPromise {
  state: SoundPromiseState;
  value: AudioBuffer | null = null
  public static StateNames = [
    'UNLOADED',
    'LOADING',
    'LOADED',
    'REJECTED',
    'DISPOSED'
  ] as const
  public static State = {
    UNLOADED: 0,
    LOADING: 1,
    LOADED: 2,
    REJECTED: 3,
    DISPOSED: 4,
    toString(state: SoundPromiseState): SoundPromiseStateName {
        return SoundPromise.StateNames[state]
    }
} as const
  promise: Promise<AudioBuffer | null>;
  readonly then: (onfulfilled?: ((value: AudioBuffer | null) => AudioBuffer | null | PromiseLike<AudioBuffer | null>)) => SoundPromise;
  readonly catch: (onrejected?: ((reason: Error) => AudioBuffer | PromiseLike<AudioBuffer> | null )) => SoundPromise;
  readonly finally: (onfinally?: (() => void)) => SoundPromise;
  resolve: (value: AudioBuffer | null) => void;
  reject: (reason: Error) => void;
  constructor(public readonly decoder?: Decoder) {
      this.state = SoundPromise.State.UNLOADED;
      this.promise = new Promise((resolve, reject) => {
          this.resolve = resolve;
          this.reject = reject;
      })
      this.then = (onfulfilled) => {
        // Create a new SoundPromise for chaining
        const chained = SoundPromise.new(this.decoder);
        // Setup the continuation of the promise chain within the new SoundPromise
        chained.promise = this.promise.then(value => {
          this.value = value;
          this.state = SoundPromise.State.LOADED;
          // Ensure onfulfilled returns a value or null
          return onfulfilled ? onfulfilled(value) : value;
        }).then(result => result !== undefined ? result : null); // Ensure the chain resolves to AudioBuffer | null

        // Return the new SoundPromise for further chaining
        return chained;
      }
      this.catch = (onrejected) => {
        const chained = new SoundPromise(this.decoder);
        chained.promise = this.promise.catch(reason => {
          this.state = SoundPromise.State.REJECTED;
          if (onrejected) {
            return onrejected(reason);
          }
          throw reason; // Important to re-throw if no handler is provided
        }).then(result => result !== undefined ? result : null);
        return chained;
      }

      this.finally = (onfinally) => {
        const chained = SoundPromise.new(this.decoder);
        chained.promise = this.promise.finally(() => {
          if (onfinally) {
            onfinally();
          }
        }).then(() => this.value); // Pass the current value to the next in chain
        return chained;
      }
  }
  load(url: string): SoundPromise {
    if (this.state !== SoundPromise.State.UNLOADED) {
      return this
    }
    if (this.decoder !== undefined) {
      this.state = SoundPromise.State.LOADING
      fetch(url)
          .then(response => response.arrayBuffer())
          .then(buffer => this.decoder!.decodeAudioData(buffer))
          .then(decoded => this.resolve(decoded))
          .catch(error => this.reject(new Error(`Failed to load audio from ${url} with error: ${error?.message}`)))
    } else {
      this.reject(new Error('Decoder is not available'))
    }
    return this
  }

  dispose(): this {
    if (this.state === SoundPromise.State.DISPOSED) {
      return this
    }
    this.resolve(null)
    this.state = SoundPromise.State.DISPOSED
    return this
  }

  [Symbol.toStringTag] = 'SoundPromise'

  static new(decoder?: Decoder) {
    return new SoundPromise(decoder)
  }

  static from(value: string | null | AudioBuffer, decoder?: Decoder): SoundPromise {
    if (value === null) {
      const sound = SoundPromise.new()
      sound.resolve(null)
      return sound
    }
    if (isAudioBuffer(value)) {
      const sound = SoundPromise.new()
      sound.resolve(value)
      return sound
    }
    return SoundPromise.new(decoder).load(value)
  }
}
