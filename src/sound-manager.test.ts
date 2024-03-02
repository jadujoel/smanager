import { expect, it } from 'vitest';
import { SoundManager, type SoundAtlas, DISPOSED, RUNNING, FILE, isDefined, fill, type SoundItem, sort, unique } from './sound-manager';
import { MockContext, MockAudioBuffer, mockedFetch } from '../fixtures/mocks';
import { SoundPromise } from './sound-promise';

globalThis.fetch = mockedFetch as unknown as typeof fetch;

const context = new MockContext();
const atlas = {
  "localised": [
    ["voice_player", "24kb.1ch.12833676159346608193", 54_128, "english"],
    ["voice_banker", "24kb.1ch.16205214575666683713", 78_000, "english"],
    ["voice_player", "24kb.1ch.13700607245644122936", 60_500, "swedish"],
    ["voice_banker", "24kb.1ch.1538874823881351140", 39_877, "swedish"],
    ["effect_riser", "48kb.2ch.6176321738731274452", 23_700, "_"],
    ["music_tension", "24kb.2ch.3369919070620850854", 23_700, "_"]
  ],
  "template": [
    ["music_drums", "24kb.2ch.12372919168763747631", 192_000, "_"],
    ["music_guitar", "24kb.2ch.8103809083249652511", 192_000, "_"]
  ]
} as const satisfies SoundAtlas;

function dmanager() {
  return new SoundManager(context, atlas, 'fixtures');
}

it('should set language correctly', () => {
  const manager = dmanager();
  const initialLanguage = manager.activeLanguages[0];
  const newLanguage = 'swedish';
  expect(manager.setLanguage(newLanguage)).toBe(true);
  expect(manager.activeLanguages[0]).toBe(newLanguage);
  expect(manager.activeLanguages).toContain(initialLanguage); // The initial language should now be the second item
});

it('should not change language if it is already the active language', () => {
  const manager = dmanager();
  const initialLanguage = manager.activeLanguages[0]!;
  expect(manager.setLanguage(initialLanguage)).toBe(false);
  expect(manager.activeLanguages[0]).toBe(initialLanguage);
});

it('should set package by name correctly', () => {
  const manager = dmanager();
  manager.setPackageByName('localised');
  expect(manager.activePackageNames[0]).toBe('localised');
});

it('setLoadPath changes the source path correctly', () => {
  const manager = dmanager();
  const newPath = 'https://example.com/new-sounds/';
  manager.setLoadPath(newPath);
  expect(manager.sourcePath).toBe(newPath);
});

// Test setPriorityList
it('setPriorityList updates priorities correctly', () => {
  const manager = dmanager();
  const newPriorities = ['sound1', 'sound2', 'sound3'];
  manager.setPriorityList(newPriorities);
  expect(manager.priorities).toEqual(newPriorities);
});

it('setLanguage changes the active language correctly and fires event', () => {
  const manager = dmanager();
  const newLanguage = 'swedish';
  let eventFired = false;

  manager.addEventListener('languagechanged', () => {
    eventFired = true;
  });

  manager.setLanguage(newLanguage);
  expect(manager.activeLanguages[0]).toBe(newLanguage);
  expect(eventFired).toBe(true);
});

it('setLanguage does not change the language if it is already the active language', () => {
  const manager = dmanager();
  const initialLanguage = manager.activeLanguages[0]!;
  const result = manager.setLanguage(initialLanguage);
  expect(result).toBe(false);
});


it('setPackageByName prioritizes the specified package', () => {
  const manager = dmanager();

  expect(manager.activePackageNames).toEqual(["localised", "template"]);

  manager.setPackageByName("localised");
  expect(manager.activePackageNames).toEqual(["localised", "template"]);

  manager.setPackageByName("template");
  expect(manager.activePackageNames).toEqual(["template", "localised"]);

  manager.setPackageByName("template");
  expect(manager.activePackageNames).toEqual(["template", "localised"]);
});

it('setPackageByName returns false if package does not exist', () => {
  const manager = dmanager();
  const nonExistentPackage = 'nonexistent';
  const result = manager.setPackageByName(nonExistentPackage);
  expect(result).toBe(false);
});

it('loadAtlas loads and updates the atlas correctly', async () => {
  const manager = new SoundManager(context, undefined, 'fixtures');
  await manager.loadAtlas();
  expect(manager.atlas).toEqual(atlas);
});

it('loadItem loads a sound item correctly', async () => {
  const manager = dmanager();
  const soundItem = atlas.localised[0]; // Use an item from your mock atlas
  const soundPromise = manager.loadItem(soundItem);
  await expect(soundPromise).resolves.toBeInstanceOf(MockAudioBuffer);
  // Verify that the sound is now in the forward map
  expect(manager.forward.has(soundItem[1])).toBe(true);
});

it('getSourceUrl returns the correct URL for a sound source', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Use a source name from your mock atlas
  const expectedUrl = `${manager.sourcePath}/${atlas.localised[0][1]}${manager.fileExtension}`;
  expect(manager.getSourceUrl(sourceName)).toBe(expectedUrl);
});

it('findItemBySourceName finds the correct item', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Use a source name from your mock atlas
  const expectedItem = atlas.localised[0]; // Expected sound item
  expect(manager.findItemBySourceName(sourceName)).toEqual(expectedItem);
});

it('dispose disposes of the sound manager correctly', () => {
  const manager = dmanager();
  manager.dispose();
  expect(manager.state).toBe(DISPOSED);
  // Verify that listeners are cleared
  // This might require a more complex setup or mocking EventTarget methods
});

it('disposeItem disposes of a single sound item correctly', () => {
  const manager = dmanager();
  const soundItem = atlas.localised[0]; // Use an item from your mock atlas
  manager.loadItem(soundItem).then((_) => {
    expect(manager.forward.has(soundItem[1])).toBe(true);
    manager.disposeItem(soundItem);
    expect(manager.forward.has(soundItem[1])).toBe(false);
    // Additional checks for reversed items if applicable
    return _
  });
});

it('loadPackageName loads all sounds in a specified package', async () => {
  const manager = dmanager();
  const packageName = 'localised';
  const loadedBuffers = await manager.loadPackageName(packageName);
  expect(loadedBuffers).toHaveLength(atlas[packageName].length);
  for (const buffer of loadedBuffers) {
    expect(buffer).toBeInstanceOf(MockAudioBuffer);
  }
});

it('loadPackageNames loads all sounds in specified packages', async () => {
  const manager = dmanager();
  const packageNames = ['localised', 'template'];
  const loadedBuffers = await manager.loadPackageNames(packageNames);
  const totalItems = packageNames.reduce((acc, name) => acc + atlas[name as keyof typeof atlas].length, 0);
  expect(loadedBuffers).toHaveLength(totalItems);
  for (const buffer of loadedBuffers) {
    expect(buffer).toBeInstanceOf(MockAudioBuffer);
  }
});

it('loadEverything loads all sounds from all packages', async () => {
  const manager = dmanager();
  const loadedBuffers = await manager.loadEverything();
  const totalItems = Object.values(atlas).flat().length;
  expect(loadedBuffers).toHaveLength(totalItems);
  for (const buffer of loadedBuffers) {
    expect(buffer).toBeInstanceOf(MockAudioBuffer);
  }
});

it('getLanguages retrieves unique languages from the atlas', () => {
  const manager = dmanager();
  const languages = manager.getLanguages();
  expect(languages).toEqual(expect.arrayContaining(['english', 'swedish', '_']));
});

it('reload disposes and resets the sound manager', async () => {
  const manager = dmanager();
  await manager.loadEverything();
  manager.reload();
  expect(manager.state).toBe(RUNNING);
  expect(manager.forward.size).toBe(0); // Assuming `dispose` clears the `forward` map
});

it('loadLanguage loads all sounds for a specified language', async () => {
  const manager = dmanager();
  const language = 'english';
  await manager.loadLanguage(language);
  // Verify that only sounds with the specified language are loaded
  const expectedItems = Object.values(atlas)
    .flat()
    .filter(item => item[3] === language);
  for (const item of expectedItems) {
    expect(manager.forward.has(item[1])).toBe(true);
  }
});

it('loadLanguages loads sounds for multiple specified languages', async () => {
  const manager = dmanager();
  const languages = ['english', 'swedish'];
  await manager.loadLanguages(languages);
  // Verify that sounds for both languages are loaded
  for (const language of languages) {
    const expectedItems = Object.values(atlas)
      .flat()
      .filter(item => item[3] === language);
    for (const item of expectedItems) {
      expect(manager.forward.has(item[1])).toBe(true);
    }
  }
});

it('disposePackages disposes of all sounds in specified packages', () => {
  const manager = dmanager();
  manager.loadPackageNames(['localised']).then(() => {
    manager.disposePackages(['localised']);
    expect(manager.forward.size).toBe(0);
  });
});

it('disposeLanguage disposes of all sounds with a specified language', () => {
  const manager = dmanager();
  manager.loadLanguage('english').then(() => {
    manager.disposeLanguage('english');
    // Verify that no sounds with the language "english" remain
    const remainingItems = [...manager.forward.keys()].filter(file => {
      const soundItem = atlas.localised.find(si => si[FILE] === file);
      return soundItem && soundItem[3] === 'english';
    });
    expect(remainingItems).toHaveLength(0);
  });
});

it('reloadWithAtlas reloads the manager with a new atlas', async () => {
  const manager = dmanager();
  const newAtlas = {
    "custom": [
      ["custom_sound", "24kb.2ch.123456789", 96_000, "_"]
    ]
  } as const satisfies SoundAtlas;
  manager.reloadWithAtlas(newAtlas);
  expect(manager.atlas).toEqual(newAtlas);
  expect(manager.state).toBe(RUNNING);
});

it('setAtlas updates the atlas without reloading', () => {
  const manager = dmanager();
  const newAtlas = {
    "updated": [
      ["updated_sound", "24kb.2ch.987654321", 48_000, "english"]
    ]
  } as const satisfies SoundAtlas;
  manager.setAtlas(newAtlas);
  expect(manager.atlas).toEqual(newAtlas);
});

it('getDetailsBySource retrieves details for a given source', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Use a source name from your mock atlas
  const details = manager.getDetailsBySource(sourceName);
  expect(details).toHaveProperty('sourceName', sourceName);
  expect(details).toHaveProperty('url');
  expect(details).toHaveProperty('duration');
});

it('getSourceDuration retrieves the duration for a given source', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Use a source name from your mock atlas
  const duration = manager.getSourceDuration(sourceName);
  expect(duration).toBeGreaterThan(0);
});

// non sound-manager-functions
it('isDefined returns true for non-undefined values', () => {
  expect(isDefined(0)).toBe(true);
  expect(isDefined('')).toBe(true);
  expect(isDefined(null)).toBe(true);
  expect(isDefined([])).toBe(true);
  expect(isDefined({})).toBe(true);
});

it('isDefined returns false for undefined values', () => {
  expect(isDefined(undefined)).toBe(false);
});

it('fill copies audio data using copyToChannel when available', () => {
  const sourceBuffer = new MockAudioBuffer({ numberOfChannels: 1, length: 5, sampleRate: 48_000 });
  const targetBuffer = new MockAudioBuffer({ numberOfChannels: 1, length: 5, sampleRate: 48_000 });

  // Fill source buffer with some data
  const sourceData = sourceBuffer.getChannelData(0);
  for (let i = 0; i < sourceData.length; i++) {
    sourceData[i] = i + 1; // 1, 2, 3, 4, 5
  }

  fill(targetBuffer, sourceBuffer);

  // Verify data was copied correctly using copyToChannel
  const targetData = targetBuffer.getChannelData(0);
  for (let i = 0; i < targetData.length; i++) {
    expect(targetData[i]).toEqual(i + 1);
  }
});


it('fill copies audio data using copyFromChannel when copyToChannel is not available', () => {
  const sourceBuffer = new MockAudioBuffer({ numberOfChannels: 1, length: 5, sampleRate: 48_000, legacy: true });
  const targetBuffer = new MockAudioBuffer({ numberOfChannels: 1, length: 5, sampleRate: 48_000, legacy: true });
  // Fill source buffer with some data
  const sourceData = sourceBuffer.getChannelData(0);
  for (let i = 0; i < sourceData.length; i++) {
    sourceData[i] = i + 1; // 1, 2, 3, 4, 5
  }

  fill(targetBuffer, sourceBuffer);

  // Verify data was copied correctly using copyFromChannel
  const targetData = targetBuffer.getChannelData(0);
  for (let i = 0; i < targetData.length; i++) {
    expect(targetData[i]).toEqual(i + 1);
  }
})

it('sort sorts sound items based on a list of priorities', () => {
  const items = [
    ["c_sound", "file3", 300, "_"],
    ["a_sound", "file1", 100, "_"],
    ["b_sound", "file2", 200, "_"],
  ] as SoundItem[];
  const priorities = ["b_sound", "a_sound", "c_sound"];
  const sorted = sort(items, priorities);
  // Expect items to be sorted in the order specified by priorities
  expect(sorted.map(item => item[0])).toEqual(priorities);
});

it('unique filters an array to unique values', () => {
  const arr = ['a', 'b', 'a', 'c', 'b', 'd'];
  const uniqueArr = unique(arr);
  expect(uniqueArr).toEqual(['a', 'b', 'c', 'd']);
});

it('getSourceNumSamples returns correct number of samples for a source', () => {
  const sourceName = "voice_player";
  const expectedNumSamples = 54_128; // Corresponding to "voice_player" in "localised"
  expect(dmanager().getSourceNumSamples(sourceName)).toBe(expectedNumSamples);
});

it('getSourceNumChannels returns correct number of channels for a source', () => {
  const sourceName = "music_drums";
  const expectedNumChannels = 2; // "2ch" is in the file name "24kb.2ch.12372919168763747631"
  expect(dmanager().getSourceNumChannels(sourceName)).toBe(expectedNumChannels);
});

it('getSourceDuration returns correct duration for a source', () => {
  const sourceName = "voice_banker";
  const expectedNumSamples = 78_000;
  const expectedDuration = expectedNumSamples / context.sampleRate; // Duration in seconds
  expect(new SoundManager(context, atlas, 'fixture').getSourceDuration(sourceName)).toBeCloseTo(expectedDuration);
});

it('requestBufferAsync retrieves a sound buffer asynchronously', async () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Use a source name from your mock atlas
  const promise = manager.requestBufferAsync(sourceName);
  expect(promise.state).toBe(SoundPromise.State.LOADING);
  const buffer = await promise
  expect(promise.state).toBe(SoundPromise.State.LOADED);
  expect(promise.value).toBeInstanceOf(MockAudioBuffer);
  expect(buffer).toBeInstanceOf(MockAudioBuffer);
});

it('requestBufferAsync returns a null buffer for a source that does not exist', async () => {
  const manager = dmanager();
  const sourceName = 'nonexistent';
  const buffer = await manager.requestBufferAsync(sourceName);
  expect(buffer).toBeNull();
})

it('requestBufferSync retrieves a sound buffer synchronously', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Use a source name from your mock atlas
  const buffer = manager.requestBufferSync(sourceName);
  expect(buffer).toBeInstanceOf(MockAudioBuffer);
});

it('requestBufferSync returns null for a source that does not exist', () => {
  const manager = dmanager();
  const sourceName = 'nonexistent';
  const buffer = manager.requestBufferSync(sourceName);
  expect(buffer).toBeNull();
})

it('requestBufferReversedAsync loads and reverses a buffer', async () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Assuming this is in your atlas
  const promise = manager.requestBufferReversedAsync(sourceName);
  expect(promise.name).toBe("SoundPromise");
  expect(promise.toString()).toBe("[object SoundPromise]");
  const buffer = await promise
  expect(buffer).toBeInstanceOf(MockAudioBuffer);
});

it('requesBufferReversedAsync returns a null buffer for a source that does not exist', async () => {
  const manager = dmanager();
  const sourceName = 'nonexistent';
  const buffer = await manager.requestBufferReversedAsync(sourceName);
  expect(buffer).toBeNull();
})

it('requestBufferReversedSync retrieves a reversed buffer synchronously', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Ensure this source is pre-loaded for synchronous retrieval
  const buffer = manager.requestBufferReversedSync(sourceName);
  expect(buffer).toBeInstanceOf(MockAudioBuffer);
});

it('requestBufferReversedSync returns null for a source that does not exist', () => {
  const manager = dmanager();
  const sourceName = 'nonexistent';
  const buffer = manager.requestBufferReversedSync(sourceName);
  expect(buffer).toBeNull();
});

it('getUrlByItem returns correct URL for an item', () => {
  const manager = dmanager();
  const item = atlas.localised[0]; // Example item from your atlas
  const expectedUrl = `${manager.sourcePath}/${item[1]}${manager.fileExtension}`;
  expect(manager.getUrlByItem(item)).toEqual(expectedUrl);
});

it('getFileByItem returns the file name for an item', () => {
  const manager = dmanager();
  const item = atlas.localised[0]; // Example item
  expect(manager.getFileByItem(item)).toEqual(item[1]);
});

it('loadFile loads a file correctly', async () => {
  const manager = dmanager();
  const fileName = atlas.localised[0][1]; // File name from the atlas
  const promise = manager.loadFile(fileName);
  expect(promise.name).toBe('SoundPromise');
  await promise
  expect(promise.state).toBe(SoundPromise.State.LOADED);
  expect(promise.value).toBeInstanceOf(MockAudioBuffer);
});

it('loadSource loads a sound by its source name', async () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Ensure this is a valid source name in your atlas
  const buffer = await manager.loadSource(sourceName);
  expect(buffer).toBeInstanceOf(MockAudioBuffer); // Or null if the source does not exist
});

it('loadSources loads multiple sounds by their source names', async () => {
  const manager = dmanager();
  const sourceNames = ['voice_player', 'music_drums']; // Ensure these are valid source names in your atlas
  const buffers = await manager.loadSources(sourceNames);
  expect(buffers.length).toEqual(sourceNames.length);
  for (const buffer of buffers) {
    expect(buffer).toBeInstanceOf(MockAudioBuffer); // Or null for non-existent sources
  }
});

it('loadPriorityList loads sounds based on priority', async () => {
  const manager = dmanager();
  manager.setPriorityList(['voice_player', 'music_drums']); // Setting priorities
  const buffers = await manager.loadPriorityList();
  expect(buffers.length).toBe(2); // Assumes at least one of the priority sources exists
  expect(manager.getLoadStateBySource("voice_player")).toBe(SoundPromise.State.LOADED)
  expect(manager.getLoadStateBySource("music_drums")).toBe(SoundPromise.State.LOADED)
  for (const buffer of buffers) {
    expect(buffer).toBeInstanceOf(MockAudioBuffer);
  }
});

it('disposePackage disposes of all sounds within a specified package', async () => {
  const manager = dmanager();
  const packageName = 'localised'; // Choose a package that exists in your atlas
  expect(manager.getDetailsBySource("voice_player")?.state).toBe(SoundPromise.State.UNLOADED)
  await manager.loadPackageName(packageName);
  expect(manager.getDetailsBySource("voice_player")?.state).toBe(SoundPromise.State.LOADED)
  manager.disposePackage(packageName);
  expect(manager.getDetailsBySource("voice_player")?.state).toBe(SoundPromise.State.UNLOADED)
});

it('getSourceNames returns correct source names based on package names and languages', () => {
  const manager = dmanager();
  const packageNames = ['localised']; // Example package name
  const languages = ['english']; // Example language
  const sourceNames = manager.getSourceNames(packageNames, languages);
  expect(sourceNames).toEqual(expect.arrayContaining(['voice_player', 'voice_banker'])); // Adjust according to your atlas content
});

it('getActiveSourceNames returns correct active source names', () => {
  const manager = dmanager();
  const activeSourceNames = manager.getActiveSourceNames();
  expect(activeSourceNames).toEqual(expect.arrayContaining(['voice_player', 'voice_banker'])); // Adjust based on active packages and languages
});

it('getFileBySource returns correct file name for a source', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Example source name
  const fileName = manager.getFileBySource(sourceName);
  expect(fileName).toBe('24kb.1ch.12833676159346608193'); // Expected file name for the source
});

it('getNumChannelsByItem returns correct number of channels', () => {
  const manager = dmanager();
  const soundItem = atlas.localised[0]; // Use the first item as an example
  const numChannels = manager.getNumChannelsByItem(soundItem);
  expect(numChannels).toBe(1); // Assuming the item is mono
});

it('getNumSamplesByFile returns correct number of samples', () => {
  const manager = dmanager();
  const file = '24kb.1ch.12833676159346608193'; // Example file from the atlas
  const numSamples = manager.getNumSamplesByFile(file);
  expect(numSamples).toBe(54_128); // Expected number of samples for the file
});

it('getNumChannelsByItem returns correct number of channels for an item', () => {
  const manager = dmanager();
  const item = atlas.localised[0]; // Assuming mono sound for simplicity
  const numChannels = manager.getNumChannelsByItem(item);
  expect(numChannels).toBe(1); // Adjust based on your mock atlas
});

it('getNumSamplesByFile returns correct number of samples for a file', () => {
  const manager = dmanager();
  const file = '24kb.1ch.12833676159346608193'; // Example file from the atlas
  const numSamples = manager.getNumSamplesByFile(file);
  expect(numSamples).toBe(54_128); // Adjust based on your mock atlas
});

it('getDurationByFile returns correct duration for a file', () => {
  const manager = dmanager();
  const file = '24kb.1ch.12833676159346608193'; // Example file from the atlas
  const duration = manager.getDurationByFile(file);
  const expectedDuration = 54_128 / context.sampleRate; // Adjust based on your context's sample rate
  expect(duration).toBeCloseTo(expectedDuration);
});

it('getNumSamplesBySource returns correct number of samples for a source', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Example source name from the atlas
  const numSamples = manager.getNumSamplesBySource(sourceName);
  expect(numSamples).toBe(54_128); // Adjust based on your mock atlas
});

it('getUrlBySource returns correct URL for a source', () => {
  const manager = dmanager();
  const sourceName = 'voice_player';
  const url = manager.getUrlBySource(sourceName);
  expect(url).toBe('fixtures/24kb.1ch.12833676159346608193.webm');
});

it('disposeSource correctly disposes of a source', async () => {
  const manager = dmanager();
  const sourceName = 'voice_player';
  await manager.loadSource(sourceName);
  manager.disposeSource(sourceName);
  const file = manager.getFileBySource(sourceName);
  expect(manager.forward.has(file!)).toBe(false);
  expect(manager.reversed.has(file!)).toBe(false);
});

it('getNumChannelsBySource returns correct number of channels for a source', () => {
  const manager = dmanager();
  expect(manager.getNumChannelsBySource('voice_player')).toBe(1);
  expect(manager.getNumChannelsBySource('music_drums')).toBe(2);
  expect(manager.getNumChannelsBySource('nonexistent')).toBeUndefined()
});

it('getDurationBySource returns correct duration for a source', () => {
  const manager = dmanager();
  const sourceName = 'voice_player'; // Example source name from the atlas
  const duration = manager.getDurationBySource(sourceName);
  const expectedDuration = manager.getNumSamplesBySource(sourceName)! / manager.context.sampleRate;
  expect(duration).toBeCloseTo(expectedDuration);
});

it('dispatchEvent correctly dispatches "fileloaderror" when a file fails to load', async () => {
  const manager = dmanager();
  const fileName = 'nonexistent';
  let details
  manager.addEventListener('fileloaderror', ({ detail }) => {
    details = detail;
  })
  await manager.loadFile(fileName);
  expect(details).toBe(fileName);
});

it('getNumChannelsBySource returns undefined', () => {
  const manager = dmanager()
  manager.dispose()
  const numChannels = manager.getNumChannelsBySource('voice_player');
  expect(numChannels).toBeUndefined();
});

it('getDurationBySource returns undefined', () => {
  const manager = dmanager()
  manager.dispose()
  const duration = manager.getDurationBySource('voice_player');
  expect(duration).toBeUndefined();
});

it('loadFile does not load a file', async () => {
  const manager = dmanager()
  manager.dispose()
  const fileName = atlas.localised[0][1]; // File name from the atlas
  const promise = manager.loadFile(fileName);
  await expect(promise).resolves.toBeNull();
});

it('disposeSource does not throw error', () => {
  const manager = dmanager()
  manager.dispose()
  expect(() => manager.disposeSource('voice_player')).not.toThrow();
});

it('gets correct bitrate', () => {
  const manager = dmanager()
  const sourceName = 'voice_player';
  const expectedBitrate = 24;
  expect(manager.getBitrateBySource(sourceName)).toBe(expectedBitrate);
})
