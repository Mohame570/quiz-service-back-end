import { UserRole } from '../../../generated/prisma/client';

export type SafeUser = {
  id: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthTokens = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
};

export type AuthResult = {
  user: SafeUser;
  tokens: AuthTokens;
};
