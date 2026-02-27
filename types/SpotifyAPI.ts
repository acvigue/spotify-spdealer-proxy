export interface AccessTokenResponse {
  accessToken: string;
  accessTokenExpirationTimestampMs: number;
  clientId: string;
}

export interface ClientTokenResponse {
  response_type: string;
  granted_token: {
    token: string;
    expires_after_seconds: number;
    refresh_after_seconds: number;
  };
}
