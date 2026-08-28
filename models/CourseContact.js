import { DataTypes, Model } from 'sequelize';

export default function initCourseContact(sequelize) {
  class CourseContact extends Model {}

  CourseContact.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      course_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      role: { type: DataTypes.STRING(120), allowNull: false },
      email: {
        type: DataTypes.STRING(320),
        allowNull: false,
        validate: { isEmail: true },
      },
      office_hours: { type: DataTypes.TEXT },
      office_location: { type: DataTypes.STRING(255) },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'course_contacts',
      timestamps: false,
      indexes: [{ fields: ['course_id', 'id'] }],
    }
  );

  return CourseContact;
}
