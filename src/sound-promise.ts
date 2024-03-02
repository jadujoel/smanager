export function isAudioBuffer(thing: unknown): thing is AudioBuffer {
  return Boolean(thing) && (thing as { name?: string }).name === "AudioBuffer"
}

export type Decoder = Pick<AudioContext, 'decodeAudioData'>;
export type SoundPromiseState = 0 | 1 | 2 | 3 | 4;
export type SoundPromiseStateName = 'UNLOADED' | 'LOADING' | 'LOADED' | 'REJECTED' | 'DISPOSED';

export class SoundPromise {
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
  readonly name = 'SoundPromise' as const
  readonly [Symbol.toStringTag] = 'SoundPromise' as const

  state: SoundPromiseState;
  value: AudioBuffer | null = null;
  readonly internal: Promise<AudioBuffer | null>;

  resolve: (value: AudioBuffer | null) => void;
  reject: (reason: Error) => void;

  constructor(public readonly decoder?: Decoder) {
      this.state = SoundPromise.State.UNLOADED;
      this.internal = new Promise<AudioBuffer | null>((resolve, reject) => {
          this.resolve = (value: AudioBuffer | null) => {
              this.state = value === null ? SoundPromise.State.REJECTED : SoundPromise.State.LOADED;
              this.value = value;
              resolve(value);
          };
          this.reject = (reason: Error) => {
              this.state = SoundPromise.State.REJECTED;
              this.value = null;
              reject(reason);
          };
      });
  }

  then<TResult1 = AudioBuffer | null, TResult2 = never>(
      onfulfilled?: ((value: AudioBuffer | null) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
      return this.internal.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
      onrejected?: ((reason: Error) => TResult | PromiseLike<TResult>) | null
    ): Promise<AudioBuffer | null | TResult> {
      return this.internal.catch(onrejected);
  }

  finally(onfinally?: (() => void) | undefined): Promise<AudioBuffer | null> {
    return this.internal.finally(onfinally);
  }

  load(url: string): SoundPromise {
      if (this.state !== SoundPromise.State.UNLOADED) {
          return this;
      }
      if (this.decoder) {
          this.state = SoundPromise.State.LOADING;
          fetch(url)
              .then(response => response.arrayBuffer())
              .then(buffer => this.decoder!.decodeAudioData(buffer))
              .then(decoded => this.resolve(decoded))
              .catch(error => this.reject(new Error(`Failed to load audio from ${url} with error: ${error.message}`)));
      } else {
          this.reject(new Error('Decoder is not available'));
      }
      return this;
  }

  dispose(): SoundPromise {
      if (this.state !== SoundPromise.State.DISPOSED) {
          this.resolve(null);
          this.state = SoundPromise.State.DISPOSED;
      }
      return this;
  }

  static new(decoder?: Decoder): SoundPromise {
      return new SoundPromise(decoder);
  }

  static from(value: string | null | AudioBuffer, decoder?: Decoder): SoundPromise {
      const promise = SoundPromise.new(decoder);
      if (value === null) {
          promise.resolve(null);
      } else if (isAudioBuffer(value)) {
          promise.resolve(value);
      } else {
          promise.load(value);
      }
      return promise;
  }
}
