# Subtitle Editor Pro

A web-based subtitle editor built with FastAPI, WhisperX, Pyannote, and React/Vite.
Transcribe audio/video into time-coded segments, edit text & speakers, re-sync transcripts, refine diarization, and export standard SRT files—all from a polished UI.

---

## Table of Contents

* [Features](#features)
* [Tech Stack](#tech-stack)
* [Prerequisites](#prerequisites)
* [Getting Started](#getting-started)

  * [Clone the Repo](#clone-the-repo)
  * [Backend Setup](#backend-setup)
  * [Frontend Setup](#frontend-setup)
* [Environment Variables](#environment-variables)
* [Usage](#usage)
* [API Reference](#api-reference)
* [Project Structure](#project-structure)
* [Contributing](#contributing)
* [License](#license)

---

## Features

* **Accurate transcription** via [WhisperX](https://github.com/m-bain/whisperX)
* **Speaker diarization** with [Pyannote](https://github.com/pyannote/pyannote-audio)
* **Manual & AI-assisted speaker labeling**
* **Transcript resynchronization** against edited text
* **Merge & split segments**, keyboard shortcuts (Space, ⌘/Ctrl+J, ⌘/Ctrl+K)
* **Customizable SRT export** (auto line breaks, max lines/chars, speaker labels)
* **Modern React/Vite frontend** with live video preview & segment editor

---

## Tech Stack

* **Backend**: Python · FastAPI · Uvicorn · WhisperX · Pyannote · Pydantic · `python-dotenv`
* **Frontend**: React · TypeScript · Vite · Axios · CSS Variables
* **Dev Tools**: Git · .env config · VSCode / WebStorm

---

## Prerequisites

* **Python >= 3.10**
* **Node.js >= 18** & npm/yarn
* **CUDA-enabled GPU** (optional; CPU fallback supported)
* **Hugging Face token** (for speaker diarization)

---

## Getting Started

### Clone the Repo

```bash
git clone https://github.com/megalinker/subtitle-editor-pro.git
cd subtitle-editor-pro
```

### Backend Setup

1. **Create & activate** a virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate    # Linux/macOS
   .venv\Scripts\activate       # Windows
   ```

2. **Install** Python dependencies:

   ```bash
   pip install --upgrade pip
   pip install -r subtitlerBackend/requirements.txt
   ```

3. **Create** a `.env` file in `subtitlerBackend/` (see [Environment Variables](#environment-variables)).

4. **Run** the backend server:

   ```bash
   cd subtitlerBackend
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup

1. **Install** dependencies using Yarn:

   ```bash
   cd subtitlerFrontend
   yarn install
   ```

2. **Start** the development server:

   ```bash
   yarn start
   ```

3. **Open** your browser at `http://localhost:3000`.

---

## Environment Variables

Create a `.env` file in the **backend** root (`subtitlerBackend/.env`):

```dotenv
# subtitlerBackend/.env
HF_TOKEN=hf_YourHuggingFaceTokenHere
```

* `HF_TOKEN` → Your Hugging Face API token (required for speaker diarization).

> **Secure your token!**
> • Never commit `.env`; it’s in your `.gitignore`.
> • For production, inject vars via your host or CI/CD secrets.

---

## Usage

1. **Transcribe**: Load media → click **Transcribe** → get editable segments.
2. **Edit & Resync**: Modify text → click **Resync Edits** to realign.
3. **Rename Speakers**: Enter custom names → click **Apply Names**.
4. **Refine Diarization**: Click **Refine with AI** for merged AI/manual labels.
5. **Download SRT**: Click **Download .srt** to export subtitles.

---

## API Reference

| Endpoint              | Method | Description                                          |
| --------------------- | :----: | ---------------------------------------------------- |
| `/`                   |   GET  | Health check                                         |
| `/transcribe`         |  POST  | Upload file → raw segments + SRT                     |
| `/resync`             |  POST  | Upload file + transcript → re-timed segments         |
| `/rename_speakers`    |  POST  | JSON segments & speaker map → renamed segments + SRT |
| `/refine_diarization` |  POST  | Upload file + user segments → refined speakers       |

See [main.py](./subtitlerBackend/main.py) for full details.

---

## Project Structure

```
subtitle-editor-pro/
├─ subtitlerBackend/
│  ├─ main.py
│  ├─ requirements.txt
│  ├─ .env.example
│  └─ …  
├─ subtitlerFrontend/
│  ├─ src/
│  │  ├─ App.tsx
│  │  ├─ api.ts
│  │  ├─ SegmentLine.tsx
│  │  ├─ VideoPlayer.tsx
│  │  └─ …  
│  ├─ public/
│  ├─ index.html
│  └─ package.json
├─ .gitignore
└─ README.md
```

---

## Contributing

1. **Fork** & create a feature branch.
2. **Commit** with clear messages.
3. **Open** a PR describing your changes.
4. **Ensure** new code is linted & tested.

Follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## License

This project is licensed under the **MIT License**. See [LICENSE](./LICENSE) for details.
