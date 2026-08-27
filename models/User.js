import { DataTypes, Model } from 'sequelize';

export default function initUser(sequelize) {
  class User extends Model {}

  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.CITEXT,
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: DataTypes.STRING,
      },
      is_system_admin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      token_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      tableName: 'users',
      timestamps: false,
      // password_hash must never be selected by default. the handful of call
      // sites that legitimately need it (login, password verification) opt back
      // in explicitly via User.unscoped().
      defaultScope: {
        attributes: { exclude: ['password_hash'] },
      },
    }
  );

  return User;
}
