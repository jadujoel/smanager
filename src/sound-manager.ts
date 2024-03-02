import { SoundPromise, type SoundPromiseState } from './sound-promise';
import { TypedEventTarget } from './event-target';

export const NO_LANG = "_" as const;

export const RUNNING = 0 as const;
export const DISPOSED = 1 as const;

export const SOURCE = 0 as const;
export const FILE = 1 as const;
export const NUMS = 2 as const;
export const LANG = 3 as const;

export enum ManagerState {
    RUNNING,
    DISPOSED,
}

/**
 * @example
 * const item = ["player_wins", "24kb.2ch.123456789", 96000, "english"]
 */
export type SoundItem = readonly [
    source: string,
    file: string,
    numSamples: number,
    language: string
];
export type Package = readonly SoundItem[];
export type SoundAtlas = Record<string, Package>;

export type SoundDetails = {
    readonly state: SoundPromiseState
    readonly url: string;
    readonly duration: number;
    readonly numSamples: number;
    readonly numChannels: number;
    readonly sourceName: string;
    readonly fileName: string;
    readonly bitrate: number;
}

export type SoundManagerContext = Pick<AudioContext, 'decodeAudioData' | 'sampleRate' | 'createBuffer'>;

export type SoundManagerEvents =
    'atlasloaded' |
    'languagechanged' |
    'packagechanged' |
    'loadpathchanged' |
    'fileloaded' |
    'fileloading' |
    'fileloaderror' |
    'reloaded'

export type SoundManagerDetails = {
    readonly sourcePath: string;
    readonly fileExtension: string;
    readonly priorities: string[];
    readonly forward: Map<string, SoundPromise>;
    readonly reversed: Map<string, SoundPromise>;
    readonly state: typeof RUNNING | typeof DISPOSED;
}

export class SoundManager extends TypedEventTarget<SoundManagerEvents, string> {
    readonly name = 'SoundManager' as const
    readonly [Symbol.toStringTag] = 'SoundManager' as const
    constructor(
        /**
         * The audio context to use.
         * Make sure you use sampleRate 48000 since the num samples
         * In the atlas is based on that. And the webm opus codec is optimized for 48k.
         * You may want to pass in your own context if you already have one
         * That you are using outside of the manager.
         * @default new AudioContext({ sampleRate: 48000 })
         */
        public context: SoundManagerContext = new AudioContext({ sampleRate: 48_000 }),
        /** The sound atlas to use see the npm package `@jadujoel/scode` to generate the atlas. */
        public atlas: SoundAtlas = {},
        /**
         * The path to the sound files.
         * Where the sound files are located.
         * The manager will try to load the sounds from inside this directory / url.
         * @default `./encoded/`
         * @example `https://example.com/sounds/`
         */
        public sourcePath: string = "./encoded/",
        /**
         * The names of the active packages to use initially.
         * In the order that they should be prioritized.
         * For example, if you have a common package for ui sounds, and then page specific sounds.
         * You would use the page1 package as priority first, and then the page specific package.
         * If anything in page1 is not found, it will look in the common package.
         * If page1 and common have sounds with the same sourceNames, page1 will override the common package.
         * When using getActiveSourceNames.
         * @example
         * manager.activePackages = ["page1", "common"]
         * @default
         * the packages in the atlas
         * */
        public readonly activePackageNames: string[] = Object.keys(atlas),
        /**
         * The initial languages to use.
         * The order of the languages is the order of priority.
         * It should really only be two or three items in here.
         * The active language, the fallback language,
         * and the non localized "language" such as effects and music.
         * @default
         * ["english", NO_LANG]
         */
        public readonly activeLanguages: string[] = ["english", NO_LANG],
        /**
         * The extension of the sound files to use.
         * For iOS 14.3 and below, you should use `.mp4` for compatibility.
         * For iOS 14.4 and above, you can use `.webm` for better sound quality to data ratio.
         * @default `.webm`
         */
        public fileExtension: ".webm" | ".mp4" = ".webm",
        /**
         * In which order to load the sounds.
         * When using the load methods.
         * This will load the sounds in the order specified.
         * and the rest of the sounds in whatever order they are in the packages.
         */
        public priorities: string[] = [],
        /**
         * The promises of the decoded buffers of the sound files.
         * you shouldnt need to use this, but it is exposed for debugging purposes.
         */
        public forward: Map<string, SoundPromise> = new Map(),
        /**
         * The promises of the decoded buffers of the sound files.
         * you shouldnt need to use this, but it is exposed for debugging purposes.
         * The reversed buffers are used for playing the sounds in reverse.
         * They will be created if `requestBufferReversed` is called.
         * They will not be refetched if the sound is already loaded.
         * But they will be copied in reverse from the forward buffer and stored in this map.
         * Safari supports reverse playback of audio buffers with playBackRate -1.
         * But the other browsers do not, so we need to create a reversed buffer.
         */
        public reversed: Map<string, SoundPromise> = new Map(),
        /**
         * The state of the sound manager.
         * If the state is not RUNNING, the manager will not load any sounds.
         * This is affected by the dispose method and the reload method.
         * Again shouldnt need to use this, but it is exposed for testing purposes.
         * @default
         * RUNNING
         */
        public state: typeof RUNNING | typeof DISPOSED = RUNNING
    ) {
        super();
    }

    /**
     * Loads an atlas json file from a url.
     * @example
     * manager.loadAtlas("https://example.com/sounds/.atlas.json")
     * manager.loadPackages()
     * // Will load the sounds specified in "https://example.com/sounds/.atlas.json"
     * @default
     * `./encoded/.atlas.json`
     **/
    async loadAtlas(url: string = `${this.sourcePath}/.atlas.json`): Promise<void> {
        if (this.state !== RUNNING) {
            return
        }
        const response = await fetch(url);
        const atlas: SoundAtlas = await response.json();
        this.atlas = atlas;
        this.dispatchEvent({ type: 'atlasloaded' });
    }

    /**
     * Updates the atlas with a new one.
     * Probably its best to use the reloadWithAtlas method instead.
     * Since this method does not dispose of the current assets.
     * But if you know you want to keep the assets, you can use this method.
     *
     * @example
     * manager.setAtlas({
     *  "main": [["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...],
     *  "localised": [["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...]
     * })
     * manager.loadPackages()
     */
    setAtlas(atlas: SoundAtlas): void {
        if (this.state !== RUNNING) return;
        this.atlas = atlas;
        this.dispatchEvent({ type: 'atlasloaded' });
    }

    /**
     * @return {boolean} - True if the language was changed, false otherwise.
     * @example
     * manager.addEventListener("languagechanged", () => {
     *   console.log("Language changed")
     * })
     * const changed = manager.setLanguage("swedish")
     * // changed === true
     * // "Language changed" will be logged
     * manager.setLanguage("swedish") // false
     */
    setLanguage(language: string): boolean {
        if (this.state !== RUNNING) {
            return false;
        }
        if (this.activeLanguages[0] === language) {
            return false;
        }
        if (!this.getLanguages().includes(language)) {
            return false;
        }
        // remove it and the put it at the first position
        const index = this.activeLanguages.indexOf(language);

        // just add the language if it wasnt in the list
        if (index === -1) {
            this.activeLanguages.unshift(language);
        } else {
            // otherwise move it to the front
            this.activeLanguages.splice(index, 1);
            this.activeLanguages.unshift(language);
        }
        this.dispatchEvent({ type: 'languagechanged', detail: language });
        return true;
    }

    /**
     * Move the package to be first in the list of active packages.
     * Prioritizing it over the other packages.
     * @example
     * const pkg = manager.getPackage()
     * // pkg === [["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...]
     */
    setPackageByName(packageName: string): boolean {
        if (
            this.state !== RUNNING ||
            packageName === this.activePackageNames[0]
        ) {
            return false;
        }
        const pack = this.atlas[packageName];
        if (pack === undefined) {
            return false;
        }
        const index = this.activePackageNames.indexOf(packageName);
        if (index === -1) {
            return false
        } else {
            // move the package to the front of the list
            this.activePackageNames.splice(index, 1);
            this.activePackageNames.unshift(packageName);
        }
        this.dispatchEvent({ type: 'packagechanged', detail: packageName });
        return true;
    }

    /**
     * Get the items in the specified package, or the first in the list of active packages by default.
     * @default manager.activePackages[0]
     * @param {string} name
     * @returns {ReadonlyArray<readonly [string, string, number, string]>}
     * @example
     * const pkg = manager.getPackage()
     * // pkg === [["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...]
     */
    getPackageItems(name: string = this.activePackageNames[0] ?? ""): readonly SoundItem[] {
        if (this.state === DISPOSED) return [];
        return this.atlas[name] ?? [];
    }

    /**
     * Get the specified packages or all of them by default.
     * @example
     * const packages = manager.getPackages()
     * // packages === [[["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...], ...]
     * @example
     * const packages = manager.getPackages(["main", "localised"])
     * // packages === [[["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...], ...]
     */
    getPackages(names?: readonly string[]): Package[] {
        if (this.state === DISPOSED) return [];
        return names === undefined
            ? Object.values(this.atlas)
            : names
                .filter(name => isDefined(this.atlas[name]))
                .map(name => this.getPackageItems(name));
    }

    /**
     * Get the names of all the packages.
     * @param {string[] | undefined} names - The select names of the packages to use.
     * @returns {string[]}
     * @example
     * const names = manager.getPackageNames()
     * // names === ["main", "localised"]
     */
    getPackageNames(names?: readonly string[]): string[] {
        if (this.state === DISPOSED) return [];
        if (names) {
            return names.filter(name => name in this.atlas);
        }
        return Object.keys(this.atlas);
    }

    /**
     * Get the names of all the source names in the all the packages by default.
     * With all the languages by default.
     * Or in the select packages and languages if provided.
     * @param {string} packageNames - The name of the package to use.
     * @param {string[]} languages - The languages to use, default current language.
     * @returns {string[]}
     * @example
     * const names = manager.names()
     * // names === ["a", "b", "c"]
     */
    getSourceNames(
        packageNames: readonly string[] = this.getPackageNames(),
        languages: readonly string[] = this.getLanguages()
    ): string[] {
        if (this.state !== RUNNING) return [];
        const sourceNames: string[] = []
        for (const pack of this.getPackages(packageNames)) {
            for (const item of pack) {
                if (languages.includes(item[LANG])) {
                    sourceNames.push(item[SOURCE]);
                }
            }
        }
        return unique(sourceNames);
    }

    /**
     * Get the names of all the currently active sounds.
     * Meaning the sounds that are available in the current package and language.
     * Or the current package and no language.
     */
    getActiveSourceNames(): string[] {
        return this.getSourceNames(
            this.activePackageNames,
            this.activeLanguages
    )
    }

    /**
     * Get the path to the sound file.
     */
    getSourceUrl(sourceName: string): string | undefined {
        if (this.state !== RUNNING) {
            return undefined;
        }
        const item = this.findItemBySourceName(sourceName);
        if (item === undefined) {
            return undefined;
        }
        return `${this.sourcePath}/${item[FILE]}${this.fileExtension}`;
    }

    getSourceNumSamples(sourceName: string): number | undefined {
        if (this.state !== RUNNING) {
            return undefined;
        }
        const item = this.findItemBySourceName(sourceName);
        return item ? item[NUMS] : undefined;
    }

    getSourceNumChannels(sourceName: string): number | undefined {
        if (this.state !== RUNNING) {
            return undefined;
        }
        const item = this.findItemBySourceName(sourceName);
        if (item === undefined) {
            return undefined;
        }
        return this.getNumChannelsByFile(item[FILE]);
    }

    getSourceDuration(sourceName: string): number | undefined {
        if (this.state !== RUNNING) {
            return undefined;
        }
        const item = this.findItemBySourceName(sourceName);
        if (item === undefined) {
            return undefined;
        }
        return item[NUMS] / this.context.sampleRate
    }

    /**
     * Get a unique list of languages available in the selected packages (default all packages).
     * @returns {string[]}
     * @example
     * const languages = manager.languages()
     * // languages === ["en", "fr", "es"]
     * @example
     * const languages = manager.languages("another_package")
     * // languages === ["en", "sv"]
     */
    getLanguages(
        packageNames: readonly string[] = this.getPackageNames()
    ): string[] {
        if (this.state !== RUNNING) {
            return [];
        }
        const languages: string[] = []
        for (const pack of this.getPackages(packageNames)) {
            for (const item of pack) {
                const lang = item[LANG];
                if (!languages.includes(lang)) {
                    languages.push(lang);
                }
            }
        }
        return languages;
    }


    /**
     * Set the load path of the sound files.
     * @example
     * manager.setLoadPath("https://example.com/sounds/")
     * manager.loadPackageName()
     * // Will load the sounds from "https://example.com/sounds/" base, instead of the default "./encoded/".
     */
    setLoadPath(path: string): void {
        if (this.state !== RUNNING) {
            return;
        }
        this.sourcePath = path;
        this.dispatchEvent({ type: 'loadpathchanged', detail: path });
    }

    /**
     * Set the load priorities.
     * @example
     * manager.setPriorityList(["a", "b", "c"])
     * manager.loadPackageName()
     * // Will load "a" first, then "b", then "c"
     * // then the rest of the sounds in the package
     */
    setPriorityList(sourceNames: readonly string[]): void {
        this.priorities = [...sourceNames];
    }

    /**
     * Tries to get the buffer from the current package, if it fails, it will try to get it from all packages
     * If that fails, it will return null.
     * Null is also a playable sound, it will just not play anything.
     * @example
     * const buffer = await manager.requestBufferAsync("main_music")
     * // buffer === AudioBuffer
     */
    requestBufferAsync(sourceName: string): SoundPromise {
        const item = this.findItemBySourceName(sourceName);
        if (item === undefined) {
            return SoundPromise.from(null);
        }
        return this.loadItem(item);
    }

    requestBufferReversedAsync(sourceName: string): SoundPromise {
        const item = this.findItemBySourceName(sourceName);
        if (item === undefined) {
            return SoundPromise.from(null);
        }
        const file = item[FILE];
        if (this.reversed.has(file)) {
            return this.reversed.get(file)!;
        }
        const forward = this.loadItem(item)
        if (forward.value === null) {
            // no need to waste resources creating a new promise
            this.reversed.set(file, forward)
            return forward
        }
        const buffer = this.context.createBuffer(
            forward.value.numberOfChannels,
            forward.value.length,
            forward.value.sampleRate
        )
        const reversed = SoundPromise.new(this.context)
        reversed.value = buffer
        forward.then(decoded => {
            if (decoded && buffer) {
                fill(buffer, decoded);
                return buffer;
            }
            return null;
        }).then(buffer => {
            reversed.resolve(buffer)
            return buffer
        })
        return reversed
    }

    /**
     * Get a previously loaded sound buffer.
     * Otherwise, it will an empty buffer of the correct duration.
     * Unless there is an issue with the name provided, in which case it will return null.
     * Null is also assignable to an AudioBufferSourceNode, it will just not play anything.
     * If the sound is not loaded, it will try to load it.
     * After it has been loaded, the buffer contents will be updated in place.
     * So the sound will continue playing from whatever point it had gotten to.
     * Meaning you can schedule your sounds and expect them to play in sync.
     * Even if they had not been preloaded, there might just be some silence in the beginning
     * until the network request is finished.
     * @param {string} name - the name of the sound to get.
     * @returns {AudioBuffer | null}
     * @example
     * const buffer = manager.requestBufferSync("main_music")
     * // buffer === AudioBuffer
     */
    requestBufferSync(sourceName: string): AudioBuffer | null {
        return this.requestBufferAsync(sourceName).value
    }

    requestBufferReversedSync(sourceName: string): AudioBuffer | null {
        return this.requestBufferReversedAsync(sourceName).value
    }

    getUrlByItem(item: SoundItem): string {
        return this.getUrlByFile(item[FILE])!;
    }

    getFileByItem(item: SoundItem): string {
        return item[FILE];
    }

    getFileBySource(sourceName: string): string | undefined {
        const item = this.findItemBySourceName(sourceName);
        return item ? item[FILE] : undefined;
    }

    getNumSamplesByItem(item: SoundItem): number {
        return item[NUMS];
    }

    getNumChannelsByItem(item: SoundItem): number {
        return this.getNumChannelsByFile(item[FILE])!;
    }

    getDurationByItem(item: SoundItem): number {
        return item[NUMS] / this.context.sampleRate;
    }

    /**
     * Get the number of samples of a sound.
     * @param {string} file - the sound file to get.
     * @returns {number | undefined} - The number of samples of the sound or undefined if it fails.
     * @example
     * const numSamples = manager.numSamples("24kb.2ch.12372919168763747631")
     * // numSamples === 12372919168763747631
     */
    getNumSamplesByFile(file: string): number | undefined {
        const item = this.findItemByFileName(file)
        return item ? item[NUMS] : undefined;
    }

    /**
     * Get the number of channels of a sound.
     * @param {string} file - the sound file to get.
     * @returns {number | undefined} - The number of channels of the sound or undefined if it fails.
     * @example
     * const numChannels = manager.numChannels("24kb.2ch.12372919168763747631")
     * // numChannels === 2
     */
    getNumChannelsByFile(file: string): number | undefined {
        const splat = file.split(".")
        const ch = splat[1]
        if (ch === undefined) {
            return undefined
        }
        const nstr = ch.replace("ch", "")
        try {
            return Number(nstr);
        } catch {
            return undefined;
        }
    }

    getBitrateByFile(file: string): number | undefined {
        const splat = file.split(".")
        const br = splat[0]
        if (br === undefined) {
            return undefined
        }
        const nstr = br.replace("kb", "")
        try {
            return Number(nstr);
        } catch {
            return undefined;
        }
    }

    getDurationByFile(file: string): number | undefined {
        const item = this.findItemByFileName(file)
        return item ? item[NUMS] / this.context.sampleRate : undefined;
    }

    getLoadStateByFile(file: string): SoundPromiseState {
        return this.forward.get(file)?.state ?? SoundPromise.State.UNLOADED;
    }

    getUrlByFile(file: string): string {
        return `${this.sourcePath}/${file}${this.fileExtension}`;
    }

    getDetailsByFile(file: string): SoundDetails | undefined {
        const item = this.findItemByFileName(file)
        if (item === undefined) {
            return
        }
        return {
            state: this.getLoadStateByFile(file),
            url: this.getUrlByFile(file)!,
            duration: this.getDurationByItem(item),
            numSamples: this.getNumSamplesByItem(item),
            numChannels: this.getNumChannelsByFile(file)!,
            sourceName: item[SOURCE],
            fileName: item[FILE],
            bitrate: this.getBitrateByFile(file)!
        }
    }

    getNumSamplesBySource(sourceName: string): number | undefined {
        const item = this.findItemBySourceName(sourceName)
        return item ? item[NUMS] : undefined;
    }

    getNumChannelsBySource(sourceName: string): number | undefined {
        const item = this.findItemBySourceName(sourceName)
        return item ? this.getNumChannelsByFile(item[FILE]) : undefined;
    }

    getDurationBySource(sourceName: string): number | undefined {
        const item = this.findItemBySourceName(sourceName)
        return item ? item[NUMS] / this.context.sampleRate : undefined;
    }

    getLoadStateBySource(sourceName: string): SoundPromiseState | undefined {
        const file = this.getFileNameBySourceName(sourceName);
        if (file === undefined) {
            return
        }
        return this.getLoadStateByFile(file)
    }

    getDetailsBySource(sourceName: string): SoundDetails | undefined {
        const file = this.getFileNameBySourceName(sourceName);
        if (file === undefined) {
            return
        }
        return this.getDetailsByFile(file)
    }

    getBitrateBySource(sourceName: string): number | undefined {
        const file = this.getFileNameBySourceName(sourceName);
        if (file === undefined) {
            return
        }
        return this.getBitrateByFile(file)
    }

    getUrlBySource(sourceName: string): string | undefined {
        const file = this.getFileNameBySourceName(sourceName);
        return file && this.getUrlByFile(file);
    }

    /**
     * Will return the sound item if it exists in the package with the current language or if it has no language assigned.
     * If it does not exist, it will return undefined.
     * @param {string} sourceName - the name of the sound to get.
     * @param {string | undefined} - The name of package to search in.
     * @param {string | undefined} - The name of package to search in.
     * @example
     * const item = manager.findItemBySourceName("main_music")
     * // item === ["main_music", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"]
     */
    findItemBySourceName(sourceName: string, packageNames: readonly string[] = this.activePackageNames, languages: readonly string[] = this.activeLanguages): SoundItem | undefined {
        if (this.state !== RUNNING) return undefined;
        return packageNames
            .flatMap(name => this.getPackageItems(name))
            .find(item =>
                item[SOURCE] === sourceName && languages.includes(item[LANG])
            );
    }

    /**
     * Will return the sound item if it exists in the package with the current language or if it has no language assigned.
     * If it does not exist, it will return undefined.
     * We put `arr[LANG] === NO_LANG` first in the condition because we want to allow sounds with no language to be played.
     * And most packages are not localized, so we want to allow them to be played.
     * @param {string} sourceName - the name of the sound to get.
     * @param {string | undefined} packageName - The name of package to search in.
     * @returns {readonly [string, string, number, string] | undefined}
     * @example
     * const item = manager.findItemByFilename("24kb.2ch.12372919168763747631")
     * // item === ["main_music", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"]
     */
    findItemByFileName(fileName: string, packageNames: string[] = this.activePackageNames): SoundItem | undefined {
        if (this.state !== RUNNING) return undefined;
        return packageNames
            .flatMap(name => this.getPackageItems(name))
            .find(item => item[FILE] === fileName);
    }

    /**
     * Get the output file name of a sound from the original file name.
     * @param {string} sourceName - the name of the sound to get.
     * @param {string} packageName - the name of the package to use.
     * @param {string} language - the language to use.
     * @returns {string | undefined} file - the output file.
     * @example
     * const file = manager.getFileName("main_music")
     * // file === "24kb.2ch.12372919168763747631"
     */
    getFileNameBySourceName(
        sourceName: string,
        packageNames: readonly string[] =
        this.activePackageNames, languages: readonly string[] = this.activeLanguages
    ): string | undefined {
        if (this.state !== RUNNING) {
            return undefined;
        }
        const item = this.findItemBySourceName(sourceName, packageNames, languages);
        return item ? item[FILE] : undefined;
    }

    /**
     * Load a sound file given the atlas item.
     */
    loadItem(item: SoundItem): SoundPromise {
        if (this.state !== RUNNING) {
            return SoundPromise.from(null)
        }
        const file = item[FILE];
        if (this.forward.has(file)) {
            return this.forward.get(file)!
        }
        const nc = this.getNumChannelsByFile(file)!;
        const buffer = this.context.createBuffer(
            nc,
            item[NUMS],
            this.context.sampleRate
        );
        const promise = SoundPromise.new(this.context)
        this.forward.set(file, promise);
        promise.value = buffer
        const url = this.getUrlByFile(file)
        promise.load(url)
            .then(decoded => {
                if (decoded === null) {
                    return buffer
                }
                fill(buffer!, decoded);
                this.dispatchEvent({ type: "fileloaded", detail: file })
                return buffer
            }).catch(() => {
                this.dispatchEvent({ type: "fileloaderror", detail: file })
                return
            })
        this.dispatchEvent({ type: "fileloading", detail: file })
        return promise;
    }

    /**
     * Load all the items.
     * With whichever load priority has been specified.
     * @example
     * const audioBuffers = await manager.loadItems([["music", "<fname>", 1, "en"], ["effect", "<fname>", 2, "en"]])
     */
    async loadItems(items: readonly SoundItem[]): Promise<Array<AudioBuffer | null>> {
        const sorted = this.priorities.length > 0 ? sort([...items], this.priorities) : items;
        return Promise.all(sorted.map(item => this.loadItem(item)));
    }

    /**
     * Load a sound file based on the filename.
     * @param {string} file - the sound file to load.
     * @returns {SoundPromise}
     * @example
     * const audioBuffer = await manager.loadFile("24kb.2ch.12372919168763747631")
     */
    loadFile(file: string): SoundPromise {
        if (this.state !== RUNNING) {
            return SoundPromise.from(null)
        }
        const promise = this.forward.get(file)
        if (promise !== undefined) {
            return promise
        }
        const item = this.findItemByFileName(file);
        if (item === undefined) {
            this.dispatchEvent({ type: "fileloaderror", detail: file })
            return SoundPromise.from(null);
        }
        return this.loadItem(item);
    }

    /**
     * Load all sounds in a specified package.
     * Including all languages.
     */
    async loadPackageName(name = this.activePackageNames[0]): Promise<Array<AudioBuffer | null>> {
        if (this.state !== RUNNING) {
            return []
        }
        return this.loadItems(this.getPackageItems(name));
    }

    /**
     * Load all sounds in the specified packages.
     * Including all languages.
     * @parmam {string[]} names - The names of the packages to load.
     */
    async loadPackageNames(packageNames?: readonly string[]): Promise<Array<AudioBuffer | null>> {
        if (this.state !== RUNNING) {
            return []
        }
        return Promise.all(this.getPackageNames(packageNames)
            .map(name => this.loadPackageName(name)))
            .then(promises => promises.flat())
    }

    /**
     * Load all packages,
     * all languages, everything.
     */
    async loadEverything(): Promise<Array<AudioBuffer | null>>{
        if (this.state !== RUNNING) {
            return []
        }
        return this.loadPackageNames(this.getPackageNames())
    }

    /**
     * Load all sounds in the specified language.
     * For the specified packages (default `[current]`) package.
     * @example
     * await manager.loadLanguage("en", ["package1", "package2"])
     */
    async loadLanguage(language = this.activeLanguages[0], packageNames = this.activePackageNames): Promise<void> {
        if (this.state === RUNNING) {
            await Promise.all(
                this.getPackages(packageNames)
                    .map(pack => pack
                    .filter(item => item[LANG] === language)
                    .flatMap(item => this.loadItem(item))
                )
            )
        }
    }

      /**
     * Load all sounds in the specified languages (default `[current_language]`)
     * For the specified packages (default `[current_package]`) package.
     * @param {string[]} languages
     * @param {string[]} packageNames
     */
    async loadLanguages(
        languages = this.activeLanguages,
        packageNames = this.activePackageNames
    ): Promise<void> {
        if (this.state !== RUNNING) {
            return
        }
        await Promise.all(
            languages.map(
                language => this.loadLanguage(language, packageNames)
            )
        )
    }

    /**
     * Load the the specified sound by original source name.
     * @example
     * const audioBuffer = await manager.loadSource("a")
     */
    async loadSource(source: string): Promise<AudioBuffer | null> {
        if (this.state !== RUNNING) {
            return null
        }
        const item = this.findItemBySourceName(source);
        if (item === undefined) {
            return null;
        }
        return this.loadItem(item);
    }

    /**
     * Load the the specified sounds by original source name.
     * @example
     * const audioBuffers = await manager.loadSources(["a", "b", "c"])
     */
    async loadSources(sources: readonly string[]): Promise<Array<AudioBuffer | null>> {
        if (this.state !== RUNNING) {
            return []
        }
        const items = sources.map(source => this.findItemBySourceName(source)).filter(isDefined);
        return this.loadItems(items);
    }

    /**
     * Loads the sounds in the priority list.
     * @example
     * const manager = new SoundManager()
     * manager.setPriorityList(["a", "b", "c"])
     * manager.loadPriorityList()
     */
    async loadPriorityList(): Promise<Array<AudioBuffer | null>> {
        return this.loadSources(this.priorities)
    }

    disposeSource(sourceName: string): void {
        const item = this.findItemBySourceName(sourceName);
        if (item === undefined) {
            return
        }
        this.disposeItem(item)
    }

    disposeFile(file: string): void {
        if (this.state === DISPOSED) {
            return
        }
        this.forward.get(file)?.dispose();
        this.forward.delete(file);
        this.reversed.get(file)?.dispose();
        this.reversed.delete(file);
    }

    /**
     * Dispose of a single item.
     */
    disposeItem(item: SoundItem): void {
        this.disposeFile(item[FILE]);
    }

    /**
     * Dispose of all the sounds in the specified package.
     * @param {string} packageName, or undefined to dispose of the current package.
     */
    disposePackage(packageName = this.activePackageNames[0]): void {
        if (this.state === DISPOSED) {
            return
        }
        this.getPackageItems(packageName)
            .map(item => this.disposeItem(item));
    }

    /**
     * Dispose of all the sounds in the specified packages.
     * @param {string[] | undefined} packageNames, or undefined to dispose of all packages.
     */
    disposePackages(packageNames = this.getPackageNames()): void {
        if (this.state === DISPOSED) {
            return
        }
        for (const pack of this.getPackages(packageNames)) {
            for (const item of pack) {
                this.disposeItem(item)
            }
        }
    }

    /**
     * Dispose of all the sounds With the specified language.
     * In the specified packages.
     * @param {string} language
     * @param {string[]} packageNames
     * @returns {Promise<void>}
     */
    disposeLanguage(
        language = this.activeLanguages[0],
        packageNames = this.getPackageNames()
    ): void {
        if (this.state === DISPOSED) {
            return
        }
        for (const pack of this.getPackages(packageNames)) {
            for (const item of pack) {
                if (item[LANG] === language) {
                    this.disposeItem(item)
                }
            }
        }
    }

    /**
     * Dispose the sound manager
     * @param {boolean | undefined} disposeListeners - If true, it will dispose of all the listeners attached.
     */
    override dispose(disposeListeners: boolean = true): void {
        if (this.state === DISPOSED) return;
        if (disposeListeners) {
            super.dispose();
        }
        this.disposePackages(this.getPackageNames())
        this.state = DISPOSED
    }

    /**
     * Reload the sound manager.
     * This will dispose of the current assets.
     * Can be used if you want to free up memory.
     * And use the sound manager with a new atlas.
     * For example if you have a single page application
     * Where you are loading a new sound atlas for each page.
     * And dont want to bloat the users memory with unused assets.
     * @param {boolean | undefined} disposeListeners - If true, it will dispose of all the listeners attached.
     * @returns {Promise<void>}
     */
    reload(disposeListeners = false): SoundManager {
        this.dispose(disposeListeners)
        this.state = RUNNING
        this.dispatchEvent({ type: 'reloaded' });
        return this
    }

    /**
     * Reload the sound manager with a new atlas.
     * This will dispose of the current assets.
     * Can be used if you want to free up memory.
     * And use the sound manager with a new atlas.
     * For example if you have a single page application
     * Where you are loading a new sound atlas for each page.
     * And dont want to bloat the users memory with unused assets.
     * @param {boolean | undefined} disposeListeners - If true, it will dispose of all the listeners attached.
     */
    reloadWithAtlas(atlas = this.atlas, disposeListeners = false): SoundManager {
        this.reload(disposeListeners)
        this.setAtlas(atlas)
        return this
    }
}

export function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

/**
 * Fill a target buffer with the contents of a source buffer.
 * Works also for legacy browsers that do not support copyToChannel.
 */
export function fill(target: AudioBuffer, source: AudioBuffer): void {
    const nch = Math.min(target.numberOfChannels, source.numberOfChannels);
    try {
        for (let ch = 0; ch < nch; ch++) {
            source.copyFromChannel(target.getChannelData(ch), ch)
        }
    } catch {
        const ns = Math.min(target.length, source.length);
        for (let ch = 0; ch < nch; ch++) {
            const tch = target.getChannelData(ch);
            const sch = source.getChannelData(ch);
            tch.set(sch.subarray(0, ns), 0)
        }
    }
}


/**
 * Sorts sound items based on a list of priorities.
 * Items not found in the priorities list are placed at the end of the sorted array.
 * @param items The array of sound items to sort.
 * @param priorities The list of source names defining the sort order.
 * @returns A new array of sound items sorted according to the priorities.
 */
export function sort(items: SoundItem[], priorities: readonly string[]): SoundItem[] {
    // Create a map for quick lookup of priority index. Items not in priorities get a default index that sorts them to the end.
    const map: Map<string, number> = new Map(priorities.map((source, index) => [source, index]));
    const di = priorities.length; // Default index for items not found in priorities

    // Sort items based on their priority index, or default index if not found
    return items.sort((a, b) => {
        const ia = map.get(a[0]) ?? di;
        const ib = map.get(b[0]) ?? di;
        return ia - ib;
    });
}

/** efficient filter of unique items in a string array */
export function unique(arr: readonly string[]): string[] {
    const map: Record<string, boolean> = {};
    for (const item of arr) {
        map[item] = true;
    }
    return Object.keys(map);
}
