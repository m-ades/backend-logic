import { DataTypes, Model } from 'sequelize';

export default function initAssignmentExtension(sequelize) {
  class AssignmentExtension extends Model {}

  AssignmentExtension.init(
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
      extended_due_date: {
        type: DataTypes.DATE,
        allowNull: false,
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
      tableName: 'assignment_extensions',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['assignment_id', 'user_id'],
        },
      ],
    }
  );

  return AssignmentExtension;
}
