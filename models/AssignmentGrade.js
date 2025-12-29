import { DataTypes, Model } from 'sequelize';

export default function initAssignmentGrade(sequelize) {
  class AssignmentGrade extends Model {}

  AssignmentGrade.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      assignment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      raw_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      max_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      penalty_percent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      final_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      graded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      graded_by: {
        type: DataTypes.INTEGER,
      },
    },
    {
      sequelize,
      tableName: 'assignment_grades',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['assignment_id', 'user_id'],
        },
      ],
    }
  );

  return AssignmentGrade;
}
