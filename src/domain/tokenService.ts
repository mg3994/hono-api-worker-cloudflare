import { UserContext } from './types';

export interface ITokenService {
  verifyToken(token: string): Promise<UserContext>;
}
