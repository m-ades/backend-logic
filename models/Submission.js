import { DataTypes, Model } from 'sequelize';

export default function initSubmission(sequelize) {
  class Submission extends Model {}

  Submission.init(
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
      attempt: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      submission_data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      is_correct: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      auto_submitted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      validated_at: {
        type: DataTypes.DATE,
      },
      validation_version: {
        type: DataTypes.STRING,
      },
    },
    {
      sequelize,
      tableName: 'submissions',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['assignment_question_id', 'user_id', 'attempt'],
        },
        {
          fields: ['assignment_question_id', 'user_id'],
        },
      ],
    }
  );

  return Submission;
}
