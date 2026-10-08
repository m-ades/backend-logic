import { DataTypes, Model } from 'sequelize';

/**
 * Course-scoped override for where textbook HTML is fetched from.
 * Absence of a row means the client should use the deploy-wide default.
 */
export default function initCourseTextbookSource(sequelize) {
  class CourseTextbookSource extends Model {}

  CourseTextbookSource.init(
    {
      course_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      // Bundle root without a trailing slash, e.g.
      // https://owner.github.io/forallx-yyc
      baseUrl: {
        type: DataTypes.TEXT,
        field: 'base_url',
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
      tableName: 'course_textbook_sources',
      timestamps: false,
    }
  );

  return CourseTextbookSource;
}
