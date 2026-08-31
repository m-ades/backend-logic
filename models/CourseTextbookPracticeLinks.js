import { DataTypes, Model } from 'sequelize';

/**
 * Course-scoped textbook ↔ practice link overrides.
 * Absence of a row means the client should use seeded link templates.
 */
export default function initCourseTextbookPracticeLinks(sequelize) {
  class CourseTextbookPracticeLinks extends Model {}

  CourseTextbookPracticeLinks.init(
    {
      course_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      links: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'course_textbook_practice_links',
      timestamps: false,
    }
  );

  return CourseTextbookPracticeLinks;
}
