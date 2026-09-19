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

### YouTube API — owner only

The public site uses one repository-owned **YouTube Data API v3** key. Visitors do not enter an API key.

1. In Google Cloud, enable **YouTube Data API v3** and create the key.
2. Restrict the key to the GitHub Pages HTTP referrer, for example:
   `https://b-1-o.github.io`
3. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Name the secret:
   `YOUTUBE_API_KEY`
5. Paste the YouTube API key as the secret value.

### GitHub Pages

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

The workflow at `.github/workflows/pages.yml` generates `config.js` during deployment from `YOUTUBE_API_KEY`, then publishes the static site with the official GitHub Pages Actions flow.

The key is not committed to the source repository. Because a browser must use the YouTube API directly, the deployed page can still expose the key to visitors at runtime. The Google Cloud HTTP-referrer restriction is therefore important.

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
