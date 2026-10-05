# b1api

> A cinematic local-first music web application powered by YouTube Data API v3 and the official YouTube player.

b1api combines a full-screen visual experience with playlists, playback controls, search, and browser-local music preferences.

## Features

- YouTube Data API v3 search
- Official YouTube IFrame Player
- Local playlists, likes, and recently played history
- Queue, shuffle, and repeat
- Custom background and glass / blur settings
- Local nickname-based experience
- Touch and mouse navigation
- GitHub Pages deployment

## Tech Stack

JavaScript · HTML · CSS · YouTube Data API v3 · YouTube IFrame Player · GitHub Actions · GitHub Pages

## API Configuration

Configure the `YOUTUBE_API_KEY` GitHub Actions secret for deployment. Restrict the generated browser key in Google Cloud to the site's HTTP referrer and only the YouTube Data API v3.

## Data & Privacy

Playlists, likes, recent history, appearance settings, and the local nickname are stored in the browser.

## Deployment

Pushes to `main` are deployed through GitHub Actions to GitHub Pages.

**Live:** https://b-1-o.github.io/music/  
**Repository:** https://github.com/b-1-o/music