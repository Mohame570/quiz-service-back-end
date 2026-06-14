import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import { QuizAttemptsResponseDto } from '../dto/quiz-attempts-response.dto';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics(): Promise<DashboardSummaryDto> {
    // Example: Get data from your Prisma models once they're defined
    const totalQuizzes = await this.prisma.quiz.count();
    const totalStudents = await this.prisma.user.count({where: { role: 'STUDENT' },});
    const totalAttempts = await this.prisma.attempt.count();
    const averageScore = await this.prisma.attempt.aggregate({ _avg: { score: true } });
    return {
      totalQuizzes,
      totalStudents,
      totalAttempts,
      averageScore: Number(averageScore._avg?.score ?? 0),
    };

    // return {
    //   totalQuizzes: 0,
    //   totalStudents: 0,
    //   totalAttempts: 0,
    //   averageScore: 0,
    // };
  }

  async getQuizAttempts(quizName: string): Promise<QuizAttemptsResponseDto> {
    const quiz = await this.prisma.quiz.findFirst({
      where: { title: quizName },
      select: { id: true, title: true },
    });

    if (!quiz) {
      throw new Error(`Quiz with name '${quizName}' not found`);
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
    const studentNameById = new Map(students.map((student) => [student.id, student.name ?? 'Unknown Student']));
    console.log(studentNameById);
    return {
      
      quizTitle: quiz.title,
      attemptCount: attempts.length,
      attempts: attempts.map((attempt, index) => ({
        attemptId: index + 1,
        studentName: studentNameById.get(attempt.studentId) ?? 'Unknown Student',
        score: attempt.score ?? 0,
        submittedAt: attempt.submittedAt!,
      })),
    };
  }
}
