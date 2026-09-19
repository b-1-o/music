# b1api

An immersive, local-first music web app inspired by the visual language of the owner's `forest` and `fog` projects.

## Visual direction

- Cinematic full-screen atmosphere and editorial typography
- Frosted glass surfaces with restrained motion
- 3D playlist visual index inspired by the `fog` carousel
- Center-focused cards with mouse/touch drag, wheel navigation and click-to-open
- Album artwork can drive the background

## Features

- YouTube Data API v3 search
- Official YouTube IFrame Player
- Local playlists with no b1api account
- Liked songs
- Recently played
- Queue, shuffle and repeat
- Custom background URL
- Local glass blur setting
- GitHub Pages friendly static build

## Setup

1. Create a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Create an API key.
4. Open b1api and press **API**.
5. Paste the key. It is stored only in the current browser with localStorage.
6. For a public deployment, restrict the key to your GitHub Pages HTTP referrer.

The app does not download or host audio files. Playback uses the official YouTube IFrame Player.

## GitHub Pages

This project is plain HTML/CSS/JavaScript, so it can be served directly from the repository root.

Enable **Settings → Pages → Deploy from a branch → main → / (root)**.

## Local data

Playlists, likes, recent history, appearance settings and the API key stay in the current browser. Clearing site data or changing device/browser will not transfer the library.

## Important

YouTube's player and API are subject to Google's current terms and quota policies. This project uses the official player rather than extracting or downloading YouTube audio.


## Deployment

The site uses one YouTube Data API v3 key configured by the repository owner. Visitors only choose a local nickname; playlists, likes, history and appearance settings stay in their browser.

For GitHub Pages deployment:

1. Add a repository secret named `YOUTUBE_API_KEY`.
2. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/pages.yml` generates `config.js` during the Pages build and deploys the site.

The key is not committed to the source repository. It is still delivered to the browser at runtime, so it should be restricted in Google Cloud to the site's HTTP referrer and only **YouTube Data API v3**.
