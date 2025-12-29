import { DataTypes, Model } from 'sequelize';

export default function initAssignmentQuestion(sequelize) {
  class AssignmentQuestion extends Model {}

  AssignmentQuestion.init(
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
      question_snapshot: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      points_value: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      attempt_limit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
    },
    {
      sequelize,
      tableName: 'assignment_questions',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['assignment_id', 'order_index'],
        },
      ],
    }
  );

  return AssignmentQuestion;
}
