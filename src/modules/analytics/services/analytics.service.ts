import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptStatus } from '../../../generated/prisma/client';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';
import { QuizStudentScoreDto } from '../dto/quiz-attempt.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(): Promise<DashboardSummaryDto> {
    const totalQuizzes = await this.prisma.quiz.count();
    const totalStudents = await this.prisma.user.count({
      where: { role: 'STUDENT' },
    });
    const totalAttempts = await this.prisma.attempt.count();
    const averageScore = await this.prisma.attempt.aggregate({
      _avg: { score: true },
    });

    return {
      totalQuizzes,
      totalStudents,
      totalAttempts,
      averageScore: Number(averageScore._avg?.score ?? 0),
    };

  }
  async getQuizAttempts(quizTitle: string): Promise<QuizAttemptsResponseDto> {
    const quiz = await this.prisma.quiz.findFirst({
      where: { title: quizTitle },
      select: { id: true, title: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with title '${quizTitle}' not found`);
    }

    const [students, attempts] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: { id: true, name: true },
      }),
      this.prisma.attempt.findMany({
        where: { quizId: quiz.id },
        select: {
          id: true,
          studentId: true,
          score: true,
          status: true,
          startedAt: true,
          submittedAt: true,
        },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    const attemptsByStudent = new Map<string, typeof attempts[0]>();
    for (const attempt of attempts) {
      const existing = attemptsByStudent.get(attempt.studentId);
      if (!existing || attempt.startedAt > existing.startedAt) {
        attemptsByStudent.set(attempt.studentId, attempt);
      }
    }

    const statusBreakdown = {
      notStarted: 0,
      inProgress: 0,
      submitted: 0,
    };

    const studentScores: QuizStudentScoreDto[] = students.map((student) => {
      const latestAttempt = attemptsByStudent.get(student.id);
      if (!latestAttempt) {
        statusBreakdown.notStarted += 1;
        return {
          studentId: student.id,
          studentName: student.name ?? 'Unknown Student',
          status: 'NOT_STARTED' as const,
          score: null,
          attemptId: null,
          startedAt: null,
          submittedAt: null,
        };
      }

      if (latestAttempt.status === AttemptStatus.IN_PROGRESS) {
        statusBreakdown.inProgress += 1;
      } else if (latestAttempt.status === AttemptStatus.SUBMITTED) {
        statusBreakdown.submitted += 1;
      } else {
        statusBreakdown.inProgress += 1;
      }

      return {
        studentId: student.id,
        studentName: student.name ?? 'Unknown Student',
        status:
          latestAttempt.status === AttemptStatus.SUBMITTED
            ? 'SUBMITTED'
            : 'IN_PROGRESS',
        score: latestAttempt.score ?? null,
        attemptId: latestAttempt.id,
        startedAt: latestAttempt.startedAt,
        submittedAt: latestAttempt.submittedAt,
      };
    });

    const submittedAttempts = attempts.filter(
      (attempt) => attempt.status === AttemptStatus.SUBMITTED,
    );
    const completionCount = submittedAttempts.length;
    const averageScore =
      completionCount > 0
        ?
            submittedAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
            completionCount
        : 0;

    const studentIds = [...new Set(attempts.map((attempt) => attempt.studentId))];
    const submittedStudents = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true },
    });
    const studentNameById = new Map(
      submittedStudents.map((student) => [student.id, student.name ?? 'Unknown Student']),
    );

    return {
      quizId: quiz.id,
      quizTitle: quiz.title,
      attemptCount: attempts.length,
      completionCount,
      averageScore,
      statusBreakdown,
      attempts: attempts
        .filter((attempt) => attempt.status === AttemptStatus.SUBMITTED)
        .map((attempt) => ({
          attemptId: attempt.id,
          studentName: studentNameById.get(attempt.studentId) ?? 'Unknown Student',
          score: attempt.score ?? 0,
          submittedAt: attempt.submittedAt!,
        })),
      studentScores,
    };
  }
}
