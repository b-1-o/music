# FOG Music

A glassmorphism music web app that searches YouTube through the official YouTube Data API and plays videos with the official YouTube IFrame Player.

## What is included

- Search YouTube videos from the browser
- Local playlists with no account or database
- Liked songs
- Recently played
- Queue, shuffle, repeat and volume
- Playlist carousel
- Dynamic album-art background
- Custom background image
- Glass blur controls
- GitHub Pages friendly static build

## Setup

1. Create a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Create an API key.
4. Open the site and press **API**.
5. Paste the key. It is stored only in the current browser using localStorage.
6. For a public deployment, restrict the API key to the site's HTTP referrer(s) in Google Cloud.

The app does not download or host audio files. Playback is handled by the official YouTube IFrame Player.

## GitHub Pages

Enable **Settings → Pages → Deploy from a branch** and choose the branch containing these files (usually `main`) and `/ (root)`.

## Local data

Playlists, likes, recent history, appearance settings and the API key are stored locally in the browser. Clearing site data or using another browser/device will not transfer them.

## Important

The YouTube player and YouTube API are subject to Google's current terms and API quota policies. This project intentionally uses the official player rather than extracting or downloading YouTube audio.
