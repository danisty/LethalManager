# Lethal Manager
Lethal Manager is a mod management tool designed for Lethal Company, inspired by the popular [Modrinth](https://modrinth.com/) platform.

## Features
- Supports game installations from any location, including Steam
- Allows creating and managing profiles with custom mod sets
- Provides a search tool for mods from the Thunderstore website

## Screenshots
![Profiles](./docs/example_profiles.png)
![Profiles](./docs/example_search.png)

## Todo
- [ ] Export/Import profiles
- [ ] Import profiles from Thunderstore
- [ ] Modify BepInEx configurations
- [ ] Settings

## Installation
To install Lethal Manager, visit the [releases page](https://github.com/danisty/LethalManager/releases) and download the latest version.

## Contributing
To contribute to Lethal Manager:
1. Clone the repository
2. Run `cargo tauri dev`

## Building
To build Lethal Manager from source:

1. Clone the repository
2. Run the appropriate command:
  - Release build: `cargo tauri build`
  - Debug build: `cargo tauri build --debug`