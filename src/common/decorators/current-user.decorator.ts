import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CompanyType, UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  companyId: string;
  role: UserRole;
  companyType: CompanyType;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
