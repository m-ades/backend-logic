import { DataTypes, Model } from 'sequelize';

export default function initAssignmentSession(sequelize) {
  class AssignmentSession extends Model {}

  AssignmentSession.init(
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
      tableName: 'assignment_sessions',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['assignment_id', 'user_id', 'started_at'],
        },
      ],
    }
  );

  return AssignmentSession;
}
