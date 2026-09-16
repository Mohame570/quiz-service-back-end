import { UserRole } from '../../../generated/prisma/client';

export type UserListItem = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
};

export class UsersListResponseDto {
  users!: UserListItem[];
  page!: number;
  pageSize!: number;
  totalItems!: number;
  totalPages!: number;
  hasNextPage!: boolean;
  hasPreviousPage!: boolean;
}
