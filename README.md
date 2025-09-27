# LL Gpt

<div align="center">
  <img src="./public/ll-gpt-logo.svg" alt="LL Gpt Logo" width="200">
</div>

Run an LLM **entirely in the browser**. Primary path uses **WebLLM + WebGPU**. If WebGPU isn't available, we **fallback to WASM** via **wllama** (no server, no keys).

## Features
- OpenAI-compatible **WebLLM** with **streaming** output
- **Function calling** demo (local JS function)
- **PWA** packaging (installable, offline-first UX)
- **WASM fallback** using **wllama** (single-thread by default to avoid COOP/COEP headers)

## Installation & Running
```bash
git clone https://github.com/fenago/drleewebslm
git remote remove origin
cd drleewebslm
npx http-server web -p 8000
```

### Access the Application
1. Open **http://localhost:8000** in **Chrome/Edge** (WebGPU enabled)
2. First model load may take time (cached for next runs)
3. Click **Settings ⚙** to pick a model. Try the defaults first

> If WebGPU is unavailable (or blocked), the app will **auto-switch to WASM**. This path uses a tiny demo GGUF so it loads quickly.

## Folder Map
```
/web
  index.html           # UI, registers SW, loads app.js
  app.js               # WebLLM logic + fallback orchestrator
  styles.css
  sw.js                # Service worker: caches app + model shards
  manifest.json        # PWA manifest
/fallback
  wllama.js            # WASM fallback using @wllama/wllama CDN
/tools
  quantize.py          # Notes & helper scaffold for GGUF prep (optional)
/docs
  pwa.md               # PWA/offline notes
  models.md            # Model choices, tradeoffs
/public
  icon-192.png         # Placeholder PWA icons
  icon-512.png
```

## Browser Support
- WebGPU: Chrome/Edge stable; Safari improving; Firefox partial (behind flags).
- WASM fallback works on most modern browsers.

## Deployment

### Deploy to Netlify

#### Method 1: Deploy from GitHub (Recommended)
1. Push your code to GitHub (e.g., `https://github.com/fenago/DrleeWebSLM`) - obviously use your own repo
2. Log into Netlify (https://app.netlify.com)
3. Click **"Add new site"** → **"Import an existing project"**
4. Connect to GitHub and select your repository (`fenago/DrleeWebSLM`)
5. Configure build settings:
   - **Base directory**: Leave blank
   - **Build command**: Leave blank (no build needed)
   - **Publish directory**: `web`
6. Click **"Deploy site"**

#### Method 2: Drag and Drop
1. Open Netlify Drop (https://app.netlify.com/drop)
2. Drag the entire `web` folder directly onto the page
3. Site deploys instantly

## Notes
- Default **WebLLM** models come from MLC’s prebuilt list and will stream from CDN/HF on first load.
- Service worker caches **static assets** and tries to cache **model shards** so subsequent loads are faster.
- For **wllama** multi-threading, you would need COOP/COEP headers. We default to single-thread to keep it simple.

## Tech Stack

### Frontend Technologies
- **HTML5** - Semantic markup with modern web standards
- **CSS3** - Custom styling (no frameworks, pure CSS)
- **Vanilla JavaScript (ES6+)** - No framework dependencies, using modern ES modules

### AI/ML Libraries
- **WebLLM** (v0.2.79) - Browser-based LLM inference engine by MLC
- **Wllama** (v2.3.5) - WebAssembly fallback for LLM inference
- **WebGPU API** - For GPU acceleration (primary runtime)
- **WebAssembly (WASM)** - Fallback runtime when WebGPU unavailable

### Models Supported
- TinyLlama 1.1B Chat
- Phi-2
- Mistral 7B Instruct
- Llama 3.1 8B Instruct

### Progressive Web App (PWA)
- **Service Worker** (`sw.js`) - For offline functionality
- **Web App Manifest** (`manifest.json`) - For installability
- **Icons** - PWA icons (192px, 512px)

### Development/Deployment
- **HTTP Server** - Using `npx http-server` for local development
- **No Backend Required** - Completely client-side execution
- **CDN Dependencies** - Libraries loaded from unpkg CDN

### Key Features
- Runs 100% locally in browser
- No API keys required
- No server dependencies
- WebGPU with WASM fallback
- Function calling support
- Persistent settings via localStorage

## Credits
- WebLLM by the MLC team
- wllama by @ngxson (WASM binding for llama.cpp)
- Dr. Ernesto Lee / LVNG.ai
