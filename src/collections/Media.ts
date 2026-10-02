import type { CollectionConfig } from 'payload'
import path from 'node:path'

const mediaStaticDir = process.env.PAYLOAD_MEDIA_DIR || path.resolve(process.cwd(), 'media')

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: ['image/*'],
    staticDir: mediaStaticDir,
  },
}
