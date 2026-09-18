import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../staff/staff.decorators';
import { StaffAuthGuard } from '../staff/staff-auth.guard';
import { ResolvedStaff } from '../staff/staff.service';
import { CreateReferralReviewTaskDto } from './dto/create-referral-review-task.dto';
import { TransitionTaskDto } from './dto/transition-task.dto';
import { TaskService } from './task.service';

/**
 * Mounted at `/v1/console/tasks` (list/transition) and
 * `/v1/console/referrals/:referralId/tasks` (manual referral_review
 * creation) — staff-facing, alongside every other S7-S11 console
 * endpoint. Not wired to any real client yet, same posture as every
 * prior slice. See docs/S12_TASK_MIGRATION.md.
 */
@Controller('v1/console')
@UseGuards(StaffAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get('tasks')
  async list(@CurrentStaff() staff: ResolvedStaff) {
    const tasks = await this.taskService.listTasks(staff);
    return { result: 'success', tasks };
  }

  @Post('referrals/:referralId/tasks')
  async createReferralReviewTask(
    @Param('referralId', ParseUUIDPipe) referralId: string,
    @Body() dto: CreateReferralReviewTaskDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const task = await this.taskService.createReferralReviewTask(staff, referralId, dto.priority);
    return { result: 'success', task };
  }

  @Patch('tasks/:taskId')
  async transition(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: TransitionTaskDto,
    @CurrentStaff() staff: ResolvedStaff,
  ) {
    const task = await this.taskService.transition(staff, taskId, dto.targetState);
    return { result: 'success', task };
  }
}
