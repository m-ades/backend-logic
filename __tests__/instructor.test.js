import { jest } from '@jest/globals';

const findOne = jest.fn();
const findByPk = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Assignment: {},
  AssignmentExtension: {},
  Accommodation: {},
  AssignmentGrade: {},
  AssignmentQuestion: {},
  Submission: {},
  CourseEnrollment: { findOne },
  User: { findByPk },
}));

const { requireInstructor, requireInstructorOrAdmin } = await import('../routes/instructor.js');

describe('instructor helpers', () => {
  beforeEach(() => {
    findOne.mockReset();
    findByPk.mockReset();
  });

  describe('requireInstructor', () => {
    it('allows instructor and ta roles', async () => {
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      await expect(requireInstructor(1, 2)).resolves.toBe(true);

      findOne.mockResolvedValueOnce({ role: 'ta' });
      await expect(requireInstructor(1, 2)).resolves.toBe(true);
    });

    it('denies non-instructor roles', async () => {
      findOne.mockResolvedValueOnce({ role: 'student' });
      await expect(requireInstructor(1, 2)).resolves.toBe(false);

      findOne.mockResolvedValueOnce(null);
      await expect(requireInstructor(1, 2)).resolves.toBe(false);
    });

    it('bubbles errors from enrollment lookup', async () => {
      findOne.mockRejectedValueOnce(new Error('db down'));
      await expect(requireInstructor(1, 2)).rejects.toThrow('db down');
    });
  });

  describe('requireInstructorOrAdmin', () => {
    it('allows system admins', async () => {
      findByPk.mockResolvedValueOnce({ is_system_admin: true });
      await expect(requireInstructorOrAdmin(1, 2)).resolves.toBe(true);
    });

    it('falls back to instructor check for non-admins', async () => {
      findByPk.mockResolvedValueOnce({ is_system_admin: false });
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      await expect(requireInstructorOrAdmin(1, 2)).resolves.toBe(true);
    });

    it('bubbles errors from user lookup', async () => {
      findByPk.mockRejectedValueOnce(new Error('db down'));
      await expect(requireInstructorOrAdmin(1, 2)).rejects.toThrow('db down');
    });
  });
});
