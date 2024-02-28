# Sound Manager

This JavaScript library provides a comprehensive solution for managing sound files in web applications. It includes functionalities such as loading sound files, managing audio buffers, handling languages and sound packages, and disposing of sounds to free up memory. This library is designed to be flexible and efficient, making it suitable for games, web applications, and any project requiring sound management.

## Features

Sound Management: Load and manage sound files efficiently with support for audio contexts and buffer management.
Flexible Sound Atlas: Use a sound atlas to organize sounds into packages, allowing for easy management and loading of grouped sounds.
Event Handling: Extendable event handling with a disposable pattern for clean-up and memory management.
Language Support: Manage sounds across different languages, allowing for easy localization of your application.
Disposable Sound Items: Dispose of sounds or entire packages when they are no longer needed, helping to keep the memory footprint low.
Dynamic Loading: Load sounds dynamically from a URL, supporting both .webm and .mp4 file formats.
Prioritization: Set load priorities to control the order in which sounds are loaded, ensuring critical sounds are loaded first.

## Installation

To use this library, include the JavaScript file in your project. You can copy the content directly into a .js file in your project, or import it as a module if your project supports ES6 modules.

## Usage

Initializing the Sound Manager
Create a new instance of the SoundManager class to start managing your sounds. You can specify an initial sound atlas, audio context, and other configurations during instantiation.
See [@jadujoel](https://github.com/jadujoel/scode) for information about the atlas, setting up the sound backend, and encoding sound files.

```javascript
const manager = new SoundManager({
    atlas: {}, // Your sound atlas object
    context: new AudioContext({ sampleRate: 48000 }), // Optional audio context
    path: "./encoded/", // Path to your sound files
    language: "en", // Initial language setting
});
```

## Loading Sounds

Load a sound atlas from a URL or set an atlas directly using loadAtlas or setAtlas. After setting the atlas, you can load specific packages or all sounds using loadPackages or loadEverything.

```javascript
await manager.loadAtlas("https://example.com/sounds.atlas.json");
await manager.loadEverything(); // Load all sounds specified in the atlas
```

Managing Languages and Packages
Change the language or switch between different sound packages easily:

```javascript
manager.setLanguage("fr"); // Switch to French language sounds
manager.setPackageByName("background_music"); // Switch to a specific sound package
```

## Playing Sounds

After loading, retrieve the audio buffer for a sound and play it using the AudioContext:

```javascript
if (buffer) {
    const source = manager.context.createBufferSource();
    source.buffer = manager.requestBufferSync("sound_name");
    source.connect(manager.context.destination);
    source.start();
}
```

## Disposing Sounds

Dispose of sounds that are no longer needed to free up memory:

```javascript
await manager.disposePackage("temporary_sounds"); // Dispose of a specific package
await manager.dispose(); // Dispose of all sounds and the sound manager itself
