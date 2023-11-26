'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class translations extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  translations.init({
    key: DataTypes.STRING,
    system: DataTypes.STRING,
    language: DataTypes.STRING,
    edited: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'translations',
  });
  return translations;
};