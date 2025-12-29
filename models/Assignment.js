import { DataTypes, Model } from 'sequelize';

export default function initAssignment(sequelize) {
  class Assignment extends Model {}

  Assignment.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      course_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      kind: {
        type: DataTypes.ENUM('assignment', 'practice'),
        allowNull: false,
        defaultValue: 'assignment',
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      is_locked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      due_date: {
        type: DataTypes.DATE,
      },
      late_window_days: {
        type: DataTypes.INTEGER,
      },
      late_penalty_percent: {
        type: DataTypes.INTEGER,
      },
      total_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'assignments',
      timestamps: false,
    }
  );

  return Assignment;
}
