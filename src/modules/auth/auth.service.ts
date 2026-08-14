import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<Tokens> {
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        password,
        role: dto.role,
        companyId: dto.companyId,
      },
    });
    return this.issueTokens(user.id);
  }

  async login(dto: LoginDto): Promise<Tokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!user.isActive) throw new UnauthorizedException('Usuário inativo');
    return this.issueTokens(user.id);
  }

  async refresh(token: string): Promise<Tokens> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'dev-refresh'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshTokenHash || !(await bcrypt.compare(token, user.refreshTokenHash))) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    return this.issueTokens(user.id);
  }

  private async issueTokens(userId: string): Promise<Tokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.get<string>('JWT_SECRET', 'dev-secret'),
        expiresIn: this.config.get<string>('JWT_EXPIRATION', '15m') as unknown as number,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'dev-refresh'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRATION', '7d') as unknown as number,
      },
    );
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash } });
    return { accessToken, refreshToken };
  }
}
