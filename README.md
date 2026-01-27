<div align="center">
  <img src="docs/img/poster.jpg" height="400" alt="Winky Logo">
  <h1>Winky</h1>
  <h3><strong>Your cute voice assistant powered by AI</strong></h3>
  <h3>⭐ <strong>Star this repository if it helped you!</strong> ⭐</h3>
</div>
<div align="center">
  <a href="https://github.com/placeholder/winky/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-blue?style=for-the-badge" alt="Download Latest Release">
  </a>
</div>

<div align="center">
  <a href="https://github.com/placeholder/winky/blob/main/README.md">
    <img src="https://img.shields.io/badge/English-blue?style=for-the-badge" alt="English">
  </a>
  <a href="https://github.com/placeholder/winky/blob/main/README_RU.md">
    <img src="https://img.shields.io/badge/Русский-red?style=for-the-badge" alt="Русский">
  </a>
</div>

## About Winky

**Winky** is a cross-platform desktop voice assistant that helps you quickly convert voice to text and run intelligent LLM-powered actions. With a convenient floating microphone overlay, you can interact with Winky from anywhere on your screen, making it perfect for productivity workflows.

Winky supports both cloud-based and local AI processing, giving you the flexibility to choose between speed and privacy. Whether you need quick voice commands, transcription, or AI-powered responses, Winky is ready to help.

### Google Chrome Extension:
- Extension repository: https://github.com/Artasov/winky-ext
- Chrome Web Store: https://chromewebstore.google.com/detail/winky/mpinlhhkmpljjlcekiocnglfbfpamkjl

## About This Repository

This repository contains the source code for Winky, a cross-platform desktop application built with **Tauri + React + Vite**. The application provides a modern, efficient voice assistant experience with support for multiple AI providers and local processing options.

## Table of Contents

- [Key Features](#-key-features)
- [How to Use](#-how-to-use)
- [How to Use Locally](#how-to-use-locally)
- [For Developers](#-for-developers)

## 🚀 Key Features

- **FREE USAGE** - no subscription required, no limits for local processing
- **Voice Recognition** - advanced speech-to-text conversion with multiple AI models
- **LLM Processing** - intelligent AI-powered actions and responses
- **Floating Microphone** - convenient floating microphone overlay for quick access
- **Local Speech Recognition** - use local AI models for faster processing and privacy
- **Quick Actions** - customizable hotkeys and actions for productivity
- **Privacy & Security** - all data processed locally, audio is not stored
- **Cross-platform** - works on Windows, macOS and Linux
- **Simple interface** - intuitive and easy to use
- **Customizable** - configure transcription models, LLM providers, and actions

### If you have any issues using the app, please open an [issue](https://github.com/placeholder/winky/issues)

## 🎯 How to Use

### 1. Setup

1. Open `Winky` application
2. Complete the initial setup wizard:
   - Sign in with your account (OAuth authentication)
   - Configure your API keys:
     * `OpenAI API key` (get it from [platform.openai.com](https://platform.openai.com))
     * `Google AI API key` (get it from [console.cloud.google.com](https://aistudio.google.com/api-keys))
3. Choose your **speech recognition mode**:
   - `Cloud` - use cloud-based transcription (OpenAI Whisper, Google AI)
   - `Local` - use local fast-whisper for privacy and speed
4. Configure **LLM settings**:
   - Choose your preferred LLM provider
   - Select the model suitable for your needs
5. **Set up quick actions**:
   - Configure custom hotkeys for actions
   - Create and customize your action workflows

### 2. Usage

1. Use the **floating microphone** overlay to start voice recognition
2. Speak your command or question
3. Get instant AI-powered responses and actions
4. Use **hotkeys** for quick access to common actions
5. Access your profile, actions, and settings from the main window

### 3. Usage Tips

- Position the floating microphone overlay where it's convenient for you
- Customize hotkeys to match your workflow
- Use local speech recognition for better privacy
- Practice with different commands to get the best results

## How to Use Locally

The examples below are implemented and tested on `Windows 11`. Steps may differ on other systems.

### The assistant works in two stages:

1. #### Audio transcription

2. #### Getting an answer from the LLM

### Each stage can be run locally.

### Local Speech Recognition

1. In `Winky` settings select `Mode -> Speech Recognition` = `Local`.

2. In `Winky` settings choose one of `Model -> Speech Recognition`

3. In `Winky` settings choose `Local transcription device`: `GPU` (Graphics/NVIDIA) or `CPU` (Processor)

The local speech recognition server will be automatically installed and managed by Winky.

### Local LLM Processing

Minimum recommended configuration:

- CPU - 4 cores / 8 threads
- GPU - 6 GB VRAM
- RAM - 16 GB

1. In `Winky` settings select `Mode -> LLM` = `Local`.
2. In `Winky` settings choose a `Model -> LLM` from the available models (Ollama models)

3. #### Install Ollama
   https://ollama.com/

4. #### Download the model chosen earlier
   ```shell
   ollama pull <model-name>
   ```

5. #### Start Ollama
   ```sh 
   ollama serve
   ```

### The first use after the opening of the program will be slower, since with local use of the AI models will be loaded in GPU or RAM, which takes time. Before important tasks, do a test run so that the subsequent calls are faster.

## 🔧 For Developers

### Contributing

We welcome contributions to the project! If you want to contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Local Development

#### Requirements

- Node.js 20+ (LTS)
- Rust 1.80+ (for building Tauri)
- npm or yarn

#### Installation

```bash
# Clone the repository
git clone https://github.com/placeholder/winky.git
cd winky

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

#### Project Structure

```
src/
├── renderer/       # React renderer process (UI)
│   ├── app/        # Application logic and hooks
│   ├── components/ # React components
│   ├── context/    # React context providers
│   ├── features/   # Feature modules
│   ├── services/   # API and service layer
│   ├── windows/    # Window components
│   └── ...
├── shared/         # Shared types and utilities
└── ...
src-tauri/
├── src/             # Rust backend (Tauri)
└── ...
```

#### Available Commands

- `npm run dev` - run in development mode
- `npm run build` - build the project
- `npm run build:renderer` - build only the renderer (frontend)
- `npm run dev:renderer` - run renderer dev server only
- `npm run lint` - check TypeScript types
- `npm run typecheck` - same as lint
- `npm run preview` - preview built frontend

#### Building for Different Platforms

##### Windows

```bash
npm run build
```

Creates:
- Portable executable in `src-tauri/target/release/`

##### macOS

```bash
npm run build
```

Creates:
- DMG archive for Intel and Apple Silicon

**Note**: For macOS builds, you may need to:
1. Install Xcode Command Line Tools: `xcode-select --install`

##### Linux

```bash
npm run build
```

Creates:
- Portable directory in `src-tauri/target/release/`

#### Technologies

- **Tauri** - cross-platform desktop application framework
- **React** - UI library
- **TypeScript** - typed JavaScript
- **Tailwind CSS** - utility-first CSS framework
- **Vite** - build tool and dev server
- **OpenAI API** - AI integration
- **Google AI API** - AI integration

---

<div align="center">
  <p>Made with ❤️ for productivity and assistance</p>
</div>
