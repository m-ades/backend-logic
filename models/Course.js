import { DataTypes, Model } from 'sequelize';

export default function initCourse(sequelize) {
  class Course extends Model {}

  Course.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      semester: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      course_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'courses',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['semester', 'course_code'],
        },
      ],
    }
  );

  return Course;
}
