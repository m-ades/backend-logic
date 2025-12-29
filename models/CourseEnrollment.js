import { DataTypes, Model } from 'sequelize';

export default function initCourseEnrollment(sequelize) {
  class CourseEnrollment extends Model {}

  CourseEnrollment.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      course_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('student', 'ta', 'instructor'),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'course_enrollments',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'course_id'],
        },
      ],
    }
  );

  return CourseEnrollment;
}
