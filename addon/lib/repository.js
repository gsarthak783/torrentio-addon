import { Sequelize } from 'sequelize';
const Op = Sequelize.Op;

const DATABASE_URI = process.env.DATABASE_URI;

// Only initialize database if DATABASE_URI is configured
let database, Torrent, File, Subtitle;

if (DATABASE_URI) {
  database = new Sequelize(DATABASE_URI, { logging: false, pool: { max: 30, min: 5, idle: 20 * 60 * 1000 } });

  Torrent = database.define('torrent',
      {
        infoHash: { type: Sequelize.STRING(64), primaryKey: true },
        provider: { type: Sequelize.STRING(32), allowNull: false },
        torrentId: { type: Sequelize.STRING(128) },
        title: { type: Sequelize.STRING(256), allowNull: false },
        size: { type: Sequelize.BIGINT },
        type: { type: Sequelize.STRING(16), allowNull: false },
        uploadDate: { type: Sequelize.DATE, allowNull: false },
        seeders: { type: Sequelize.SMALLINT },
        trackers: { type: Sequelize.STRING(4096) },
        languages: { type: Sequelize.STRING(4096) },
        resolution: { type: Sequelize.STRING(16) }
      }
  );

  File = database.define('file',
      {
        id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
        infoHash: {
          type: Sequelize.STRING(64),
          allowNull: false,
          references: { model: Torrent, key: 'infoHash' },
          onDelete: 'CASCADE'
        },
        fileIndex: { type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING(256), allowNull: false },
        size: { type: Sequelize.BIGINT },
        imdbId: { type: Sequelize.STRING(32) },
        imdbSeason: { type: Sequelize.INTEGER },
        imdbEpisode: { type: Sequelize.INTEGER },
        kitsuId: { type: Sequelize.INTEGER },
        kitsuEpisode: { type: Sequelize.INTEGER }
      },
  );

  Subtitle = database.define('subtitle',
      {
        infoHash: {
          type: Sequelize.STRING(64),
          allowNull: false,
          references: { model: Torrent, key: 'infoHash' },
          onDelete: 'CASCADE'
        },
        fileIndex: { type: Sequelize.INTEGER, allowNull: false },
        fileId: {
          type: Sequelize.BIGINT,
          allowNull: true,
          references: { model: File, key: 'id' },
          onDelete: 'SET NULL'
        },
        title: { type: Sequelize.STRING(512), allowNull: false },
        size: { type: Sequelize.BIGINT, allowNull: false },
      },
      { timestamps: false }
  );

  Torrent.hasMany(File, { foreignKey: 'infoHash', constraints: false });
  File.belongsTo(Torrent, { foreignKey: 'infoHash', constraints: false });
  File.hasMany(Subtitle, { foreignKey: 'fileId', constraints: false });
  Subtitle.belongsTo(File, { foreignKey: 'fileId', constraints: false });
} else {
  console.warn('⚠️  DATABASE_URI not configured. Database-dependent features will be disabled.');
  console.warn('   To use the /api/torrent/:infoHash/streams endpoint, configure DATABASE_URI environment variable.');
}

export function getTorrent(infoHash) {
  if (!Torrent) {
    throw new Error('Database not configured. Set DATABASE_URI environment variable.');
  }
  return Torrent.findOne({ where: { infoHash: infoHash } });
}

export function getFiles(infoHashes) {
  if (!File) {
    throw new Error('Database not configured. Set DATABASE_URI environment variable.');
  }
  return File.findAll({ where: { infoHash: { [Op.in]: infoHashes} } });
}

export function getImdbIdMovieEntries(imdbId) {
  if (!File || !Torrent) {
    throw new Error('Database not configured. Set DATABASE_URI environment variable.');
  }
  return File.findAll({
    where: {
      imdbId: { [Op.eq]: imdbId }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

export function getImdbIdSeriesEntries(imdbId, season, episode) {
  if (!File || !Torrent) {
    throw new Error('Database not configured. Set DATABASE_URI environment variable.');
  }
  return File.findAll({
    where: {
      imdbId: { [Op.eq]: imdbId },
      imdbSeason: { [Op.eq]: season },
      imdbEpisode: { [Op.eq]: episode }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

export function getKitsuIdMovieEntries(kitsuId) {
  if (!File || !Torrent) {
    throw new Error('Database not configured. Set DATABASE_URI environment variable.');
  }
  return File.findAll({
    where: {
      kitsuId: { [Op.eq]: kitsuId }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

export function getKitsuIdSeriesEntries(kitsuId, episode) {
  if (!File || !Torrent) {
    throw new Error('Database not configured. Set DATABASE_URI environment variable.');
  }
  return File.findAll({
    where: {
      kitsuId: { [Op.eq]: kitsuId },
      kitsuEpisode: { [Op.eq]: episode }
    },
    include: [Torrent],
    limit: 500,
    order: [
      [Torrent, 'seeders', 'DESC']
    ]
  });
}

if (DATABASE_URI && process.env.AUTO_SYNC_DB === "true") {
  database.authenticate()
    .then(() => database.sync({ alter: true }))
    .then(() => console.log("✅ DB synced"))
    .catch(err => console.error("❌ DB sync failed:", err));
}
