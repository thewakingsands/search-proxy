const ClickHouse = require('@apla/clickhouse')
let ch

async function init() {
  if (!process.env.CLICKHOUSE_SERVER) {
    console.warn('clickhouse server is not given, searches will not logged')
    return
  }

  const url = new URL(process.env.CLICKHOUSE_SERVER)
  ch = new ClickHouse({
    host: url.hostname,
    port: url.port,
    user: url.username,
    password: url.password,
    path: url.pathname,
    protocol: url.protocol,
    queryOptions: {
      database: process.env.CLICKHOUSE_DB
    }
  })

  await ch.querying(`CREATE TABLE IF NOT EXISTS search (
    \`EventTime\` DateTime,
    \`EventDate\` Date,
    \`SearchTerm\` String,
    \`SearchOffset\` UInt16,
    \`SearchSuccess\` UInt8,
    \`SearchResults\` UInt16
  )
  ENGINE = MergeTree()
  PARTITION BY toYYYYMM(EventDate)
  ORDER BY (EventTime, EventDate)
  `)
}

function logSearch(...metrics) {
  if (!ch) return
  const writableStream = ch.query('INSERT INTO search', err => {
    if (err) console.error(err)
  })
  const now = new Date()
  const time = Math.floor(Date.now() / 1000)
  const date = now.toISOString().slice(0, 10)
  writableStream.write([time, date, ...metrics])
  writableStream.end()
}

module.exports = {
  init,
  logSearch
}
