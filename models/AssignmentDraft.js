import { DataTypes, Model } from 'sequelize';

export default function initAssignmentDraft(sequelize) {
  class AssignmentDraft extends Model {}

  AssignmentDraft.init(
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
      draft_data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'assignment_drafts',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['assignment_question_id', 'user_id'],
        },
      ],
    }
  );

  return AssignmentDraft;
}
