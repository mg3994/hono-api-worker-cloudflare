export interface IJwtSigner {
  signJwt(payload: Record<string, any>): Promise<string>;
}
