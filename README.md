<div align="center">
  <img src="docs/img/poster.jpg" height="400" alt="Winky Logo">
  <h1>Winky</h1>
  <h3><strong>Your cute voice assistant powered by AI</strong></h3>
  <h3>⭐ <strong>Star this repository if it helped you!</strong> ⭐</h3>
</div>
<div align="center">
  <a href="https://github.com/Artasov/winky/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-blue?style=for-the-badge" alt="Download Latest Release">
  </a>
</div>

<div align="center">
  <a href="https://github.com/Artasov/winky/blob/main/README.md">
    <img src="https://img.shields.io/badge/English-blue?style=for-the-badge" alt="English">
  </a>
  <a href="https://github.com/Artasov/winky/blob/main/README_RU.md">
    <img src="https://img.shields.io/badge/Русский-red?style=for-the-badge" alt="Русский">
  </a>
</div>

## About Winky

**Winky** is a Windows desktop voice assistant that helps you quickly convert voice to text and run intelligent LLM-powered actions. With a convenient floating microphone overlay, you can interact with Winky from anywhere on your screen, making it perfect for productivity workflows.

Winky supports both cloud-based and local AI processing, giving you the flexibility to choose between speed and privacy. Whether you need quick voice commands, transcription, or AI-powered responses, Winky is ready to help.

### Google Chrome Extension:
- Extension repository: https://github.com/Artasov/winky-ext
- Chrome Web Store: https://chromewebstore.google.com/detail/winky/mpinlhhkmpljjlcekiocnglfbfpamkjl

## About This Repository

This repository contains the source code for Winky, a desktop application built with **Tauri + React + Vite**. Official builds currently target Windows x86_64 and provide support for multiple AI providers and local processing options.

## Table of Contents

- [Key Features](#-key-features)
- [How to Use](#-how-to-use)
- [How to Use Locally](#how-to-use-locally)
- [For Developers](#-for-developers)

## 🚀 Key Features

- **Local processing without a Winky subscription** - cloud providers can charge for their APIs
- **Voice Recognition** - advanced speech-to-text conversion with multiple AI models
- **LLM Processing** - intelligent AI-powered actions and responses
- **Floating Microphone** - convenient floating microphone overlay for quick access
- **Local Speech Recognition** - use local AI models for faster processing and privacy
- **Quick Actions** - customizable hotkeys and actions for productivity
- **Privacy controls** - local modes keep processing on the device; cloud modes send the required input to the configured provider
- **Protected credentials** - authentication tokens and provider keys are persisted with Windows DPAPI
- **Windows support** - official signed releases target Windows x86_64
- **Simple interface** - intuitive and easy to use
- **Customizable** - configure transcription models, LLM providers, and actions

### If you have any issues using the app, please open an [issue](https://github.com/Artasov/winky/issues)

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

The examples below are implemented and tested on `Windows 11`. Windows x86_64 is the only currently supported release target.

### The assistant works in two stages:

1. #### Audio transcription

2. #### Getting an answer from the LLM

### Each stage can be run locally.

Cloud transcription and LLM modes are not local: they send audio, text or both
to the provider selected in settings. Provider retention, billing and privacy
terms apply. Choose local speech recognition and a local LLM when input must
remain on the device.

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

- Node.js LTS and npm
- Rust 1.85 (pinned in `rust-toolchain.toml`)
- [platform prerequisites for Tauri 2](https://v2.tauri.app/start/prerequisites/)

#### Installation

```bash
# Clone the repository
git clone https://github.com/Artasov/winky.git
cd winky

# Install dependencies
npm ci

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

#### Supported Release Target

```bash
npm run build
```

The supported release pipeline creates a signed NSIS installer in
`src-tauri/target/release/bundle/nsis/` for Windows x86_64.

macOS and Linux release packaging is intentionally disabled until those platforms have an OS-protected persistent store for authentication tokens and provider keys. Do not distribute builds for those platforms yet.

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
