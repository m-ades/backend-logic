import { DataTypes, Model } from 'sequelize';

export default function initAccommodation(sequelize) {
  class Accommodation extends Model {}

  Accommodation.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      course_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      late_penalty_waived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      extra_late_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      tableName: 'accommodations',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'course_id'],
        },
      ],
    }
  );

  return Accommodation;
}
