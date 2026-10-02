import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { Registrations } from './collections/Registrations'
import { Announcements } from './collections/Announcements'
import { DailyReports } from './collections/DailyReports'
import { TeamPolicies } from './globals/TeamPolicies'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const serverURL = process.env.PAYLOAD_PUBLIC_SERVER_URL?.replace(/\/$/, '')
const storageBucket = process.env.S3_BUCKET || process.env.R2_BUCKET || ''
const storageAccessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || ''
const storageSecretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || ''
const storageEndpoint = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT
const storagePublicURL = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
const objectStorageEnabled = Boolean(storageBucket && storageAccessKeyId && storageSecretAccessKey)

const mediaStorage = s3Storage({
  bucket: storageBucket,
  collections: {
    media: storagePublicURL
      ? {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) =>
            `${storagePublicURL}/${prefix ? `${prefix}/` : ''}${filename}`,
        }
      : true,
  },
  config: {
    credentials: {
      accessKeyId: storageAccessKeyId,
      secretAccessKey: storageSecretAccessKey,
    },
    ...(storageEndpoint ? { endpoint: storageEndpoint } : {}),
    forcePathStyle: Boolean(storageEndpoint),
    region: process.env.R2_BUCKET ? 'auto' : process.env.S3_REGION || 'us-east-1',
  },
  enabled: objectStorageEnabled,
})

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Events, Registrations, Announcements, DailyReports, Media],
  globals: [TeamPolicies],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  serverURL,
  onInit: async (payload) => {
    if (serverURL) {
      payload.logger.info(`Public server URL: ${serverURL}`)
    }
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || '',
  }),
  sharp,
  plugins: [mediaStorage],
})
