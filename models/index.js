import { sequelize } from '../config/sequelize.js';
import initUser from './User.js';
import initCourse from './Course.js';
import initCourseEnrollment from './CourseEnrollment.js';
import initQuestionBank from './QuestionBank.js';
import initAssignment from './Assignment.js';
import initAssignmentQuestion from './AssignmentQuestion.js';
import initAssignmentDraft from './AssignmentDraft.js';
import initSubmission from './Submission.js';
import initAssignmentSession from './AssignmentSession.js';
import initQuestionSession from './QuestionSession.js';
import initAssignmentExtension from './AssignmentExtension.js';
import initAccommodation from './Accommodation.js';
import initAssignmentGrade from './AssignmentGrade.js';

const User = initUser(sequelize);
const Course = initCourse(sequelize);
const CourseEnrollment = initCourseEnrollment(sequelize);
const QuestionBank = initQuestionBank(sequelize);
const Assignment = initAssignment(sequelize);
const AssignmentQuestion = initAssignmentQuestion(sequelize);
const AssignmentDraft = initAssignmentDraft(sequelize);
const Submission = initSubmission(sequelize);
const AssignmentSession = initAssignmentSession(sequelize);
const QuestionSession = initQuestionSession(sequelize);
const AssignmentExtension = initAssignmentExtension(sequelize);
const Accommodation = initAccommodation(sequelize);
const AssignmentGrade = initAssignmentGrade(sequelize);

// Associations
User.hasMany(CourseEnrollment, { foreignKey: 'user_id' });
CourseEnrollment.belongsTo(User, { foreignKey: 'user_id' });

Course.hasMany(CourseEnrollment, { foreignKey: 'course_id' });
CourseEnrollment.belongsTo(Course, { foreignKey: 'course_id' });

User.hasMany(QuestionBank, { foreignKey: 'created_by' });
QuestionBank.belongsTo(User, { foreignKey: 'created_by' });

Course.hasMany(Assignment, { foreignKey: 'course_id' });
Assignment.belongsTo(Course, { foreignKey: 'course_id' });

Assignment.hasMany(AssignmentQuestion, { foreignKey: 'assignment_id' });
AssignmentQuestion.belongsTo(Assignment, { foreignKey: 'assignment_id' });

QuestionBank.hasMany(AssignmentQuestion, { foreignKey: 'question_id' });
AssignmentQuestion.belongsTo(QuestionBank, { foreignKey: 'question_id' });

AssignmentQuestion.hasMany(AssignmentDraft, { foreignKey: 'assignment_question_id' });
AssignmentDraft.belongsTo(AssignmentQuestion, { foreignKey: 'assignment_question_id' });

User.hasMany(AssignmentDraft, { foreignKey: 'user_id' });
AssignmentDraft.belongsTo(User, { foreignKey: 'user_id' });

AssignmentQuestion.hasMany(Submission, { foreignKey: 'assignment_question_id' });
Submission.belongsTo(AssignmentQuestion, { foreignKey: 'assignment_question_id' });

User.hasMany(Submission, { foreignKey: 'user_id' });
Submission.belongsTo(User, { foreignKey: 'user_id' });

Assignment.hasMany(AssignmentSession, { foreignKey: 'assignment_id' });
AssignmentSession.belongsTo(Assignment, { foreignKey: 'assignment_id' });

User.hasMany(AssignmentSession, { foreignKey: 'user_id' });
AssignmentSession.belongsTo(User, { foreignKey: 'user_id' });

AssignmentQuestion.hasMany(QuestionSession, { foreignKey: 'assignment_question_id' });
QuestionSession.belongsTo(AssignmentQuestion, { foreignKey: 'assignment_question_id' });

User.hasMany(QuestionSession, { foreignKey: 'user_id' });
QuestionSession.belongsTo(User, { foreignKey: 'user_id' });

Assignment.hasMany(AssignmentExtension, { foreignKey: 'assignment_id' });
AssignmentExtension.belongsTo(Assignment, { foreignKey: 'assignment_id' });

User.hasMany(AssignmentExtension, { foreignKey: 'user_id' });
AssignmentExtension.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(AssignmentExtension, { foreignKey: 'granted_by', as: 'grantedExtensions' });
AssignmentExtension.belongsTo(User, { foreignKey: 'granted_by', as: 'grantedBy' });

Course.hasMany(Accommodation, { foreignKey: 'course_id' });
Accommodation.belongsTo(Course, { foreignKey: 'course_id' });

User.hasMany(Accommodation, { foreignKey: 'user_id' });
Accommodation.belongsTo(User, { foreignKey: 'user_id' });

Assignment.hasMany(AssignmentGrade, { foreignKey: 'assignment_id' });
AssignmentGrade.belongsTo(Assignment, { foreignKey: 'assignment_id' });

User.hasMany(AssignmentGrade, { foreignKey: 'user_id' });
AssignmentGrade.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(AssignmentGrade, { foreignKey: 'graded_by', as: 'gradedAssignments' });
AssignmentGrade.belongsTo(User, { foreignKey: 'graded_by', as: 'gradedBy' });

export {
  sequelize,
  User,
  Course,
  CourseEnrollment,
  QuestionBank,
  Assignment,
  AssignmentQuestion,
  AssignmentDraft,
  Submission,
  AssignmentSession,
  QuestionSession,
  AssignmentExtension,
  Accommodation,
  AssignmentGrade,
};
