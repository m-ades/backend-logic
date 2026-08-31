import { DataTypes, Model } from 'sequelize';

/**
 * Course-scoped textbook TOC overrides (order, titles, hierarchy).
 * Absence of a row means the client should use BookML bundle defaults.
 */
export default function initCourseTextbookStructure(sequelize) {
  class CourseTextbookStructure extends Model {}

  CourseTextbookStructure.init(
    {
      course_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      nodes: {
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
      tableName: 'course_textbook_structures',
      timestamps: false,
    }
  );

  return CourseTextbookStructure;
}
