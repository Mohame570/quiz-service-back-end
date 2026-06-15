import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';

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

  async getQuizAttempts(quizId: string): Promise<QuizAttemptsResponseDto> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, title: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id '${quizId}' not found`);
    }

    const attempts = await this.prisma.attempt.findMany({
      where: { quizId: quiz.id, submittedAt: { not: null } },
      select: { id: true, studentId: true, score: true, submittedAt: true },
      orderBy: { submittedAt: 'desc' },
    });

    const studentIds = [...new Set(attempts.map((attempt) => attempt.studentId))];
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true },
    });
    const studentNameById = new Map(
      students.map((student) => [student.id, student.name ?? 'Unknown Student']),
    );

    return {
      quizId: quiz.id,
      quizTitle: quiz.title,
      attemptCount: attempts.length,
      attempts: attempts.map((attempt) => ({
        attemptId: attempt.id,
        studentName: studentNameById.get(attempt.studentId) ?? 'Unknown Student',
        score: attempt.score ?? 0,
        submittedAt: attempt.submittedAt!,
      })),
    };
  }
}
