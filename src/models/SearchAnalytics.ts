import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class SearchAnalytics extends Model {
  declare id: string;
  declare query: string;
  declare search_count: number;
  declare last_searched_at: Date;
  declare result_count: number;
}

SearchAnalytics.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  query: { type: DataTypes.STRING(200), allowNull: false, unique: true },
  search_count: { type: DataTypes.INTEGER, defaultValue: 1 },
  last_searched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  result_count: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  sequelize,
  tableName: 'search_analytics',
  timestamps: true,
  underscored: true,
});

export default SearchAnalytics;
