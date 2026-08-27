import { CourseEnrollment, Assignment, AssignmentQuestion } from '../models/index.js';
import { isSystemAdmin } from './authorization.js';

export async function requireEnrollmentForCourse(userId, courseId, message = 'user not enrolled in this course') {
  const enrollment = await CourseEnrollment.findOne({
    where: { user_id: userId, course_id: courseId },
  });
  if (!enrollment) {
    const error = new Error(message);
    error.status = 403;
    throw error;
  }
}

export async function requireEnrollmentForAssignment(user, assignmentId) {
  const assignment = await Assignment.findByPk(assignmentId);
  if (!assignment) {
    const error = new Error('assignment_id not found');
    error.status = 404;
    throw error;
  }
  if (!isSystemAdmin(user)) {
    await requireEnrollmentForCourse(user.id, assignment.course_id);
  }
  return assignment;
}

export async function requireEnrollmentForAssignmentQuestion(user, assignmentQuestionId) {
  const assignmentQuestion = await AssignmentQuestion.findByPk(assignmentQuestionId, {
    include: [{ model: Assignment }],
  });
  if (!assignmentQuestion) {
    const error = new Error('assignment_question_id not found');
    error.status = 404;
    throw error;
  }
  if (!isSystemAdmin(user)) {
    await requireEnrollmentForCourse(user.id, assignmentQuestion.Assignment?.course_id);
  }
  return assignmentQuestion;
}
