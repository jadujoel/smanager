import fs from 'fs/promises';
import type { SoundManagerContext } from '../src/sound-manager';
export class MockAudioBuffer implements AudioBuffer {
  channelData: Float32Array[];
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  constructor(options: { numberOfChannels: number, length: number, sampleRate: number }, legacy = false) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channelData = Array.from({ length: options.numberOfChannels }, () => new Float32Array(options.length));
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
    this.sampleRate = options?.sampleRate ?? 48000
  }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return new MockAudioBuffer({ numberOfChannels, length, sampleRate });
  }
  decodeAudioData(_audioData: ArrayBuffer, _successCallback?: DecodeSuccessCallback | null | undefined, _errorCallback?: DecodeErrorCallback | null | undefined): Promise<AudioBuffer> {
    return Promise.resolve(
      new MockAudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: this.sampleRate })
    );
  }
}

export type MockedFetchReturn = Promise<{ readonly arrayBuffer: () => Promise<ArrayBuffer>, readonly json: () => Promise<any> }>;
export type MockedFetch = (url: string) => MockedFetchReturn;

export function mockedFetch(url: string): MockedFetchReturn {
  console.log("fetching", url)
  return fs.readFile(url).then(data => ( {
    arrayBuffer: () => Promise.resolve(data.buffer),
    json: () => Promise.resolve(JSON.parse(data.toString()))
  }));
}
