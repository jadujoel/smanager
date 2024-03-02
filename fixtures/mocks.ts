import fs from 'node:fs/promises';
import type { SoundManagerContext } from '../src/sound-manager';

export interface MockAudioBufferOptions {
  readonly numberOfChannels?: number;
  readonly length?: number;
  readonly sampleRate?: number;
  readonly legacy?: boolean
}

export class MockAudioBuffer implements AudioBuffer {
  readonly channelData: Float32Array[];
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly name = "AudioBuffer" as const;
  constructor(options: MockAudioBufferOptions = {}) {
    const {
      numberOfChannels = 1,
      length = 1,
      sampleRate = 48_000,
      legacy = false
    } = options
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    if (legacy) {
      this.copyFromChannel = undefined as any
      this.copyToChannel = undefined as any
    }
  }
  copyFromChannel(destination: Float32Array, channelNumber: number, bufferOffset = 0): void {
    const source = this.channelData[channelNumber]!;
    for (let i = 0; i < destination.length; i++) {
      destination[i] = source[i + bufferOffset] ?? 0;
    }
  }
  copyToChannel(source: Float32Array, channelNumber: number, bufferOffset = 0): void {
    const destination = this.channelData[channelNumber]!;
    for (let i = 0; i < source.length; i++) {
      destination[i + bufferOffset] = source[i] ?? 0;
    }
  }
  getChannelData(channel: number): Float32Array {
    const data = this.channelData[channel]
    if (!data) {
      throw new Error('Invalid channel number');
    }
    return data;
  }

  get duration() {
    return this.length / this.sampleRate;
  }
}

export class MockContext implements SoundManagerContext {
  sampleRate: number;
  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 48_000
  }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return new MockAudioBuffer({ numberOfChannels, length, sampleRate });
  }
  decodeAudioData(_audioData: ArrayBuffer, _successCallback?: DecodeSuccessCallback | undefined | undefined, _errorCallback?: DecodeErrorCallback | undefined | undefined): Promise<AudioBuffer> {
    return Promise.resolve(
      new MockAudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: this.sampleRate })
    );
  }
}

export type MockedFetchReturn = Promise<{ readonly arrayBuffer: () => Promise<ArrayBuffer>, readonly json: () => Promise<unknown> }>;
export type MockedFetch = (url: string) => MockedFetchReturn;

export function mockedFetch(url: string): MockedFetchReturn {
  console.log('fetching', url)
  try {
    return fs.readFile(url).then(data => ( {
      arrayBuffer: () => Promise.resolve(data.buffer),
      json: () => Promise.resolve(JSON.parse(data.toString()))
    })).catch(() => {
      console.log('Failed to fetch')
      // return Promise.reject(new Error('Failed to fetch'));
      throw new Error('Failed to fetch');
    })
  } catch (_) {
    console.log('Failed to fetch')
    // return Promise.reject(new Error('Failed to fetch'));
    throw new Error('Failed to fetch');
  }
}
