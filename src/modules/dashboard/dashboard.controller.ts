import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // JSON já agregado e pronto pro front (scoped por papel).
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }
}
