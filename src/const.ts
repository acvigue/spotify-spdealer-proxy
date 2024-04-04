export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36";
export const SPOTIFY_APP_VERSION = "1.1.56.182.ga73ec2f9";
export const APP_PLATFORM = "WebPlayer";

export const CORE_HEADERS = {
  // "app-platform": APP_PLATFORM,
  referer: "https://open.spotify.com/",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  // "spotify-app-version": SPOTIFY_APP_VERSION,
  "user-agent": USER_AGENT,
};

export const defaultSpotifyDevice = Object.seal({
  brand: "spotify",
  capabilities: {
    audio_podcasts: true,
    change_volume: true,
    disable_connect: true,
    enable_play_token: true,
    manifest_formats: [
      "file_urls_mp3",
      "manifest_ids_video",
      "file_urls_external",
      "file_ids_mp4",
      "file_ids_mp4_dual",
    ],
    play_token_lost_behavior: "pause",
    supports_file_media_type: true,
    video_playback: true,
  },
  device_id: Array(40)
    .fill(0)
    .map((x) => Math.random().toString(36).charAt(2))
    .join(""),
  device_type: "computer",
  metadata: {},
  model: "web_player",
  name: "Web Player (Microsoft Edge)",
  platform_identifier:
    "web_player osx 11.3.0;microsoft edge 89.0.774.54;desktop",
});
