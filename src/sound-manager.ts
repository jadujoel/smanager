import { SoundPromise, type SoundPromiseState } from './sound-promise';

export const NO_LANG = "_" as const;

export const RUNNING = 0 as const;
export const CLOSING = 1 as const;
export const DISPOSED = 2 as const;

export const SOURCE = 0 as const;
export const FILE = 1 as const;
export const NUMS = 2 as const;
export const LANG = 3 as const;

export enum ManagerState {
    RUNNING,
    CLOSING,
    DISPOSED,
}

export type SoundItem = readonly [string, string, number, string];
export type Package = ReadonlyArray<SoundItem>;
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

// Extending EventTarget for disposable functionality
// so we can remove all the listeners when we dispose of the sound manager.
export class DisposableEventTarget extends EventTarget {
    private listeners: Array<{
        type: string,
        callback: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions }
    > = [];

    constructor() {
        super();
    }

    addEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ): void {
        super.addEventListener(type, callback, options);
        this.listeners.push({ type, callback, options });
    }

    dispose(): void {
        this.listeners.forEach(({ type, callback, options }) => {
            super.removeEventListener(type, callback, options);
        });
        this.listeners = [];
    }
}

export class SoundManager extends DisposableEventTarget {
    /**
     * @param {SoundAtlas} atlas - The sound atlas to use.
     * @param {AudioContext} [context] - The audio context to use. Default new AudioContext({ sampleRate: 48000 })
     * @param {string} [cpn] - The name of the package to use initially. Default "none"
     * @param {string} [path] - The path to the sound files. Default "./encoded/"
     * @param {string} [language] - The initial language to use. Default NO_LANG
     * @param {".webm" | ".mp4"} [ext] - The extension of the sound files to use. Default ".webm"
     * @param {readonly string[]} [priorities] - The load priorities. Default []
     * @param {Map<string, SoundPromise>} [forward] - The promises of the sound files. Default new Map()
     * @param {Map<string, SoundPromise>} [reversed] - The promises for the reversed buffers of the sound files. Default new Map()
     * @param {typeof RUNNING | typeof CLOSING | typeof DISPOSED} [state] - The state of the sound manager. Default RUNNING
     */
    constructor(
        public atlas: SoundAtlas = {},
        public context: AudioContext = new AudioContext({ sampleRate: 48000 }),
        public cpn: string = "none",
        public path: string = "./encoded/",
        public language: string = NO_LANG,
        public ext: ".webm" | ".mp4" = ".webm",
        /**
         * In which order to load the sounds.
         * When using the load methods.
         * @type {readonly string[]}
         */
        public priorities: string[] = [],
        public forward: Map<string, SoundPromise> = new Map(),
        public reversed: Map<string, SoundPromise> = new Map(),
        public state: typeof RUNNING | typeof CLOSING | typeof DISPOSED = RUNNING
    ) {
        super();
    }

    /**
     * Loads an atlas json file from a url.
     * @example
     * manager.loadAtlas("https://example.com/sounds.atlas.json")
     * manager.loadPackages()
     * // Will load the sounds specified in "https://example.com/sounds.atlas.json"
     **/
    async loadAtlas(url: string = `${this.path}${this.cpn}.atlas.json`): Promise<void> {
        if (this.state !== RUNNING) return;
        const response = await fetch(url);
        const atlas: SoundAtlas = await response.json();
        this.atlas = atlas;
        this.dispatchEvent(new Event('atlasloaded'));
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
        this.dispatchEvent(new Event('atlasloaded'));
    }

    /**
     * @return {boolean} - True if the language was changed, false otherwise.
     * @example
     * manager.addEventListener("languagechanged", () => {
     *   console.log("Language changed")
     * })
     * const changed = manager.setLanguage("en")
     * // changed === true
     * // "Language changed" will be logged
     * manager.setLanguage("en") // false
     */
    setLanguage(language: string): boolean {
        if (this.state !== RUNNING) return false;
        if (this.language === language) return false;
        if (!this.getLanguages().includes(language)) return false;
        this.language = language;
        this.dispatchEvent(new Event('languagechanged'));
        return true;
    }

    /**
     * Get the specified package or the current by default.
     * @example
     * const pkg = manager.getPackage()
     * // pkg === [["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...]
     */
    setPackageByName(name: string): boolean {
        if (this.state !== RUNNING || name === this.cpn) {
            return false;
        }
        const pkg = this.atlas[name];
        if (!pkg) {
            console.debug("Package not found", name);
            return false;
        }
        this.cpn = name;
        this.dispatchEvent(new Event('packagechanged'));
        return true;
    }

    /**
     * Get the specified package or the current by default.
     * @param {string} name
     * @returns {ReadonlyArray<readonly [string, string, number, string]>}
     * @example
     * const pkg = manager.getPackage()
     * // pkg === [["a", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"], ...]
     */
    getPackage(name: string = this.cpn): ReadonlyArray<SoundItem> {
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
    getPackages(names?: readonly string[]): ReadonlyArray<Package> {
        if (this.state === DISPOSED) return [];
        if (names) {
            return names.filter(name => this.atlas[name] !== undefined).map(name => this.getPackage(name));
        }
        return Object.values(this.atlas);
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
            return names.filter(name => this.atlas.hasOwnProperty(name));
        }
        return Object.keys(this.atlas);
    }

    /**
     * Get the names of all the sounds in the selected package.
     * With the selected languages.
     * @param {string} packageName - The name of the package to use.
     * @param {string[]} languages - The languages to use, default current language.
     * @returns {string[]}
     * @example
     * const names = manager.names()
     * // names === ["a", "b", "c"]
     */
    getSourceNames(packageName: string = this.cpn, languages: string[] = [this.language]): string[] {
        if (this.state !== RUNNING) return [];
        return [...new Set(this.getPackage(packageName).filter(item => languages.includes(item[LANG])).map(item => item[SOURCE]))];
    }

    /**
     * Get the names of all the currently active sounds.
     * Meaning the sounds that are available in the current package and language.
     * Or the current package and no language.
     */
    getActiveSourceNames(): string[] {
        return this.getSourceNames(this.cpn, [this.language, NO_LANG])
    }

    /**
     * Get the path to the sound file.
     */
    getSourceUrl(sourceName: string): string | undefined {
        if (this.state !== RUNNING) return undefined;
        const item = this.findItemBySourceName(sourceName);
        if (item === undefined) return undefined;
        return this.path + item[FILE] + this.ext;
    }

    getSourceNumSamples(sourceName: string): number | undefined {
        if (this.state !== RUNNING) return undefined;
        const item = this.findItemBySourceName(sourceName);
        return item ? item[NUMS] : undefined;
    }

    getSourceNumChannels(sourceName: string): number | undefined {
        if (this.state !== RUNNING) return undefined;
        const item = this.findItemBySourceName(sourceName);
        return item ? this.getNumChannelsByFile(item[FILE]) : undefined;
    }

    getSourceDuration(sourceName: string): number | undefined {
        if (this.state !== RUNNING) return undefined;
        const item = this.findItemBySourceName(sourceName);
        return item ? item[NUMS] / this.context.sampleRate : undefined;
    }

    /**
     * Get a unique list of languages available in the selected package (default current package).
     * @returns {string[]}
     * @example
     * const languages = manager.languages()
     * // languages === ["en", "fr", "es"]
     * @example
     * const languages = manager.languages("another_package")
     * // languages === ["en", "sv"]
     */
    getLanguages(name: string = this.cpn): string[] {
        if (this.state !== RUNNING) return [];
        return [...new Set(this.getPackage(name).map(item => item[LANG]))];
    }


    /**
     * Set the path to the sound files.
     * @example
     * manager.setLoadPath("https://example.com/sounds/")
     * manager.loadPackageName()
     * // Will load the sounds from "https://example.com/sounds/" base, instead of the default "./encoded/".
     */
    setLoadPath(path: string): void {
        if (this.state !== RUNNING) return;
        this.path = path;
        this.dispatchEvent(new Event('loadpathchange'));
    }

    /**
     * Set the load priorities.
     * @example
     * manager.setPriorityList(["a", "b", "c"])
     * manager.loadPackageName()
     * // Will load "a" first, then "b", then "c"
     * // then the rest of the sounds in the package
     */
    setPriorityList(sources: string[]): void {
        this.priorities = sources;
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
        try {
            return Number(file.split(".")[1].replace("ch", ""));
        } catch {
            return undefined;
        }
    }

    getBitrateByFile(file: string): number | undefined {
        try {
            return Number(file.split(".")[0].replace("kb", ""));
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

    getUrlByFile(file: string): string | undefined {
        return this.path + file + this.ext;
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
        const file = this.getFileName(sourceName);
        if (file === undefined) {
            return
        }
        return this.getLoadStateByFile(file)
    }

    getDetailsBySource(sourceName: string): SoundDetails | undefined {
        const file = this.getFileName(sourceName);
        if (file === undefined) {
            return
        }
        return this.getDetailsByFile(file)
    }

    getUrlBySource(sourceName: string): string | undefined {
        const file = this.getFileName(sourceName);
        return file && this.getUrlByFile(file);
    }

    /**
     * Will return the sound item if it exists in the package with the current language or if it has no language assigned.
     * If it does not exist, it will return undefined.
     * We put arr[LANG] === NO_LANG first in the condition because we want to allow sounds with no language to be played.
     * And most packages are not localized, so we want to allow them to be played.
     * @param {string} sourceName - the name of the sound to get.
     * @param {string | undefined} - The name of package to search in.
     * @param {string | undefined} - The name of package to search in.
     * @example
     * const item = manager.findItemBySourceName("main_music")
     * // item === ["main_music", "24kb.2ch.12372919168763747631", 12372919168763747631, "en"]
     */
    findItemBySourceName(sourceName: string, packageName: string = this.cpn, language: string = this.language): SoundItem | undefined {
        if (this.state !== RUNNING) return undefined;
        return this.getPackage(packageName).find(item => item[SOURCE] === sourceName && (item[LANG] === NO_LANG || item[LANG] === language));
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
    findItemByFileName(fileName: string, packageName: string = this.cpn): SoundItem | undefined {
        if (this.state !== RUNNING) return undefined;
        return this.getPackage(packageName).find(item => item[FILE] === fileName);
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
    getFileName(sourceName: string, packageName: string = this.cpn, language: string = this.language): string | undefined {
        if (this.state !== RUNNING) return undefined;
        const item = this.findItemBySourceName(sourceName, packageName, language);
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
        promise.load(this.path + file + this.ext)
            .then(decoded => {
                if (decoded === null) {
                    return buffer
                }
                fill(buffer!, decoded);
                this.dispatchEvent(new CustomEvent("loaded", { detail: { file } }))
                return buffer
            }).catch(() => {
                this.dispatchEvent(new CustomEvent("loaderror", { detail: { file } }))
                return null
            })
        this.dispatchEvent(new CustomEvent("loading", { detail: { file } }))
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
            this.dispatchEvent(new CustomEvent("soundloaderror", { detail: { file } }))
            return SoundPromise.from(null);
        }
        return this.loadItem(item);
    }

    /**
     * Load all sounds in a specified package.
     * Including all languages.
     */
    async loadPackageName(name = this.cpn): Promise<Array<AudioBuffer | null>> {
        if (this.state !== RUNNING) {
            return []
        }
        return this.loadItems(this.getPackage(name));
    }

    /**
     * Load all sounds in the specified packages.
     * Including all languages.
     * @parmam {string[]} names - The names of the packages to load.
     */
    async loadPackageNames(names = undefined): Promise<Array<AudioBuffer | null>> {
        if (this.state !== RUNNING) {
            return []
        }
        return Promise.all(this.getPackageNames(names)
            .map(name => this.loadPackageName(name)))
            .then(promises => promises.flat())
    }

    /**
     * Load all packages,
     * all languages, everything.
     */
    async loadEverything(): Promise<Array<AudioBuffer | null>>{
        if (this.state === RUNNING) {
            return this.loadPackageNames()
        }
        return []
    }

    /**
     * Load all sounds in the specified language.
     * For the specified packages (default `[current]`) package.
     * @example
     * await manager.loadLanguage("en", ["package1", "package2"])
     */
    async loadLanguage(language = this.language, packageNames = [this.cpn]): Promise<void> {
        if (this.state === RUNNING) {
            await Promise.all(
                this.getPackages(packageNames)
                    .map(pack => pack
                    .filter(item => item[LANG] === language)
                    .map(item => this.loadItem(item))
                ).flat()
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
        languages = [this.language],
        packageNames = [this.cpn]
    ): Promise<void> {
        if (this.state !== RUNNING) {
            return
        }
        await Promise.all(languages.map(language => this.loadLanguage(language, packageNames)))
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
     * @param {string} name, or undefined to dispose of the current package.
     */
    disposePackage(name = this.cpn): void {
        if (this.state === DISPOSED) {
            return
        }
        const items = this.getPackage(name);
        items.map(item => this.disposeItem(item));
    }

    /**
     * Dispose of all the sounds in the specified packages.
     * @param {string[] | undefined} names, or undefined to dispose of all packages.
     */
    disposePackages(names = undefined): void {
        if (this.state === DISPOSED) {
            return
        }
        for (const pack of this.getPackages(names)) {
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
    disposeLanguage(language = this.language, packageNames = undefined): void {
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
    dispose(disposeListeners: boolean = true): void {
        if (this.state === DISPOSED) return;
        if (disposeListeners) {
            super.dispose();
        }
        this.disposePackages()
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
        this.dispatchEvent(new Event('reloaded'));
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
            const tch = target.getChannelData(ch);
            const sch = source.getChannelData(ch);
            tch.set(sch, 0)
        }
    } catch {
        const ns = Math.min(target.length, source.length);
        for (let ch = 0; ch < nch; ch++) {
            const tch = target.getChannelData(ch);
            const sch = source.getChannelData(ch);
            for (let i = 0; i < ns; i++) {
                tch[i] = sch[i];
            }
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
