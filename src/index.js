require('dotenv').config()
const express = require('express')
const Elasticsearch = require('elasticsearch')

const metrics = require('./metrics')

const app = express()
app.use(require('body-parser').json({
  limit: '5mb'
}))

app.get('/s', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*')

  const elasticsearch = new Elasticsearch.Client({
    host: process.env.ELASTICSEARCH
  })
  
  const word = req.query.word
  const pageSize = parseInt(req.query.ps) || 20
  const pageNumber = parseInt(req.query.pn) || 1

  const from = Math.max(0, (pageNumber - 1) * pageSize)
  const size = Math.min(pageSize, 100)

  const body = {
    query: {
      multi_match: {
        fields: ['title', 'body'],
        fuzziness: 'AUTO',
        query: word
      }
    },
    from,
    size,
    highlight: {
      fields: {
        title: {},
        body: {}
      }
    }
  }

  elasticsearch.search({
    index: process.env.INDEX_NAME,
    body
  }, (err, result) => {
    if (err != null) {
      metrics.logSearch(word, from, 0, 0)
      res.status(500).json({ error: err })
      return
    }

    try {
      const hits = result.hits.hits
      const body = hits.map(hit => {
        return {
          url: hit._source.url,
          title: hit._source.title,
          body: (hit._source.body || '').slice(0, 100),
          highlights: hit.highlight,
        }
      })
  
      metrics.logSearch(word, from, 1, result.hits.total)
      res.status(200).json({
        total: result.hits.total,
        pageSize,
        pageNumber,
        results: body
      })
    } catch (err) {
      console.error(err)
      metrics.logSearch(word, from, 0, 0)
      res.status(500).json({ error: err })
    }
  })
})

app.put('/index', async (req, res) => {
  const key = req.header('X-Update-Key')

  if (key !== process.env.UPDATE_KEY || !process.env.UPDATE_KEY) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const body = req.body
  
  if (!Array.isArray(body)) {
    res.status(400).json({ error: 'body should be array' })
    return
  }

  const elasticsearch = new Elasticsearch.Client({
    host: process.env.ELASTICSEARCH
  })
  
  try {
    await elasticsearch.indices.delete({
      index: process.env.INDEX_NAME,
      ignoreUnavailable: true
    })
    await elasticsearch.indices.create({
      index: process.env.INDEX_NAME
    })
    await elasticsearch.indices.putMapping({
      index: process.env.INDEX_NAME,
      type: '_doc',
      body: {
        properties: {
          url: {
            type: 'keyword'
          },
          title: {
            analyzer: 'smartcn',
            type: 'text'
          },
          body: {
            analyzer: 'smartcn',
            type: 'text'
          }
        }
      }
    })
  
    const operations = []
    for (const item of body) {
      operations.push({
        index: {
          _index: process.env.INDEX_NAME,
          _type: '_doc',
          _id: item.url
        }
      }, item)
    }
  
    await elasticsearch.bulk({
      body: operations
    })

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err })
  }
})

metrics.init()
.then(() => {
  app.listen(process.env.PORT, () => {
    console.log(`Server listened on port ${process.env.PORT}`)
  })
})
.catch(console.error)
