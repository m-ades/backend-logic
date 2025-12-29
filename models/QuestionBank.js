import { DataTypes, Model } from 'sequelize';

export default function initQuestionBank(sequelize) {
  class QuestionBank extends Model {}

  QuestionBank.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      unit: {
        type: DataTypes.STRING,
      },
      logic_problem_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      premises: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
      },
      conclusion: {
        type: DataTypes.TEXT,
      },
      notation: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'hurley',
      },
      config: {
        type: DataTypes.JSONB,
      },
      created_by: {
        type: DataTypes.INTEGER,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'question_bank',
      timestamps: false,
    }
  );

  return QuestionBank;
}
