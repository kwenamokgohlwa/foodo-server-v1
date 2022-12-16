import { PrismaClient } from '@prisma/client'
import { SecretsManager } from 'aws-sdk'

const sm = new SecretsManager()
let db: PrismaClient

export const getDB = async () => {
  if (db) return db

  const dbURL = await sm
    .getSecretValue({
      SecretId: process.env.SECRET_ID || '',
    })
    .promise()

  const secretString = JSON.parse(dbURL.SecretString || '{}')
  const url = `postgresql://${secretString.username}:${secretString.password}@${secretString.host}:${secretString.port}/${secretString.dbname}?connection_limit=1`

  db = new PrismaClient({
    datasources: { db: { url } },
  })

  return db
}
