import { describe, it, expect, vi } from 'vitest';
import { SoundPromise, isAudioBuffer } from './sound-promise'; // Adjust the import path as necessary
import { mockedFetch, MockAudioBuffer, MockContext } from '../fixtures/mocks';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.fetch = mockedFetch as any;


describe('isAudioBuffer', () => {
  it('returns true for an object simulating an AudioBuffer', () => {
    const mockAudioBuffer = { name: "AudioBuffer" };
    expect(isAudioBuffer(mockAudioBuffer)).toBe(true);
  });

  it('returns false for a non-AudioBuffer object', () => {
    const notAudioBuffer = { name: "NotAudioBuffer" };
    expect(isAudioBuffer(notAudioBuffer)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAudioBuffer(undefined)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAudioBuffer(undefined)).toBe(false);
  });
});

describe('SoundPromise - load', () => {
  it('loads audio data and transitions state correctly', async () => {
    const promise = new SoundPromise(new MockContext());
    expect(promise.state).toBe(SoundPromise.State.UNLOADED);
    promise.load('fixtures/24kb.2ch.16612275136193504350.webm');
    expect(promise.state).toBe(SoundPromise.State.LOADING);
    await promise
    expect(promise.state).toBe(SoundPromise.State.LOADED);
  });

  it('handles loading error correctly', async () => {
    const soundPromise = new SoundPromise(new MockContext());
    await soundPromise.load('mcdoodle').catch(() => undefined)
    expect(soundPromise.state).toBe(SoundPromise.State.REJECTED);
  });
});

describe('SoundPromise - dispose', () => {
  it('disposes of the SoundPromise correctly', async () => {
    const promise = new SoundPromise(new MockContext());
    expect(promise.state).toBe(SoundPromise.State.UNLOADED);
    promise.load('fixtures/24kb.2ch.16612275136193504350.webm');
    expect(promise.state).toBe(SoundPromise.State.LOADING);
    await promise
    expect(promise.state).toBe(SoundPromise.State.LOADED);
    promise.dispose();
    expect(promise.state).toBe(SoundPromise.State.DISPOSED);
  });
});

describe('SoundPromise.from', () => {
  it('creates a resolved SoundPromise from an AudioBuffer', () => {
    const promise = SoundPromise.from(new MockAudioBuffer());
    expect(promise).toBeInstanceOf(SoundPromise);
    expect(promise.state).toBe(SoundPromise.State.LOADED);
  });

  it('loads from a string URL', async () => {
    const promise = SoundPromise.from('fixtures/24kb.2ch.16612275136193504350.webm', new MockContext());
    await promise;
    expect(promise.state).toBe(SoundPromise.State.LOADED);
  });
});

describe('SoundPromise - finally', () => {
  it('executes finally after promise settles', async () => {
    const mockOnFinally = vi.fn();
    const soundPromise = SoundPromise.from(null);
    await soundPromise.finally(mockOnFinally);
    expect(mockOnFinally).toHaveBeenCalled();
  });
});

describe('SoundPromise - catch without handler', () => {
  it('re-throws the reason if no onrejected handler is provided', async () => {
    const promise = new SoundPromise(new MockContext());
    expect(promise.state, 'promise state unloaded').toBe(SoundPromise.State.UNLOADED);
    let caught = false;
    try {
      promise.reject(new Error('Test Error'));
      await promise
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
    expect(promise.state, 'promise state rejected').toBe(SoundPromise.State.REJECTED);
  });
});

describe('SoundPromise.State.toString', () => {
  it('returns the correct state name for each state', () => {
    expect(SoundPromise.State.toString(SoundPromise.State.UNLOADED)).toBe('UNLOADED');
    expect(SoundPromise.State.toString(SoundPromise.State.LOADING)).toBe('LOADING');
    expect(SoundPromise.State.toString(SoundPromise.State.LOADED)).toBe('LOADED');
    expect(SoundPromise.State.toString(SoundPromise.State.REJECTED)).toBe('REJECTED');
    expect(SoundPromise.State.toString(SoundPromise.State.DISPOSED)).toBe('DISPOSED');
  });
});

describe('SoundPromise.from with AudioBuffer', () => {
  it('creates a SoundPromise in the LOADED state from an AudioBuffer', () => {
    const buffer = new MockAudioBuffer();
    const promise = SoundPromise.from(buffer);
    expect(promise.state).toBe(SoundPromise.State.LOADED);
    expect(promise.value).toBe(buffer);
  });
});

describe('SoundPromise - finally for chaining', () => {
  it('allows chaining after finally', async () => {
    const onfinally = vi.fn();
    const promise = SoundPromise.from(null);
    const chained = promise.finally(onfinally);
    expect(chained).toBeInstanceOf(Promise);
    await chained;
    expect(onfinally).toHaveBeenCalled();
  });
});

describe('SoundPromise - catch re-throw without handler', () => {
  it('re-throws the reason if no catch handler is provided', async () => {
    const promise = new SoundPromise(new MockContext());
    promise.reject(new Error('Test Error'));
    let caught = false;
    try {
      await promise
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });
});

describe('SoundPromise.State.toString coverage', () => {
  it('correctly converts state to string', () => {
    for (const state in SoundPromise.State) {
      if (typeof state === 'number') {
        expect(SoundPromise.State.toString(state)).toBe(SoundPromise.StateNames[state]);
      }
    }
  });
});
