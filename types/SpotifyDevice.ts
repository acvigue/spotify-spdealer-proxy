export interface SpotifyDevice {
  brand: string;
  capabilities: {
    audio_podcasts: boolean;
    change_volume: boolean;
    disable_connect: boolean;
    enable_play_token: boolean;
    manifest_formats: string[];
    play_token_lost_behavior: string;
    supports_file_media_type: boolean;
    video_playback: boolean;
  };
  device_id: string;
  device_type: string;
  metadata: Record<string, string>;
  model: string;
  name: string;
  platform_identifier: string;
}
