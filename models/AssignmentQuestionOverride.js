import { DataTypes, Model } from 'sequelize';

export default function initAssignmentQuestionOverride(sequelize) {
  class AssignmentQuestionOverride extends Model {}

  AssignmentQuestionOverride.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      assignment_question_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      extra_attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      granted_by: {
        type: DataTypes.INTEGER,
      },
      reason: {
        type: DataTypes.TEXT,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'assignment_question_overrides',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['assignment_question_id', 'user_id'],
        },
      ],
    }
  );

  return AssignmentQuestionOverride;
}
