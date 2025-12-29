import { DataTypes, Model } from 'sequelize';

export default function initQuestionSession(sequelize) {
  class QuestionSession extends Model {}

  QuestionSession.init(
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
      started_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      ended_at: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: 'question_sessions',
      timestamps: false,
    }
  );

  return QuestionSession;
}
