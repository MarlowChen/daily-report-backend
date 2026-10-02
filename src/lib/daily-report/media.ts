import type { Payload } from 'payload'

const upsertMedia = async ({
  alt,
  buffer,
  filename,
  mimetype,
  payload,
}: {
  alt: string
  buffer: Buffer
  filename: string
  mimetype: 'image/jpeg' | 'image/png'
  payload: Payload
}) => {
  const existing = await payload.find({
    collection: 'media',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    sort: 'createdAt',
    where: { alt: { equals: alt } },
  })
  const file = {
    data: buffer,
    mimetype,
    name: filename,
    size: buffer.length,
  }

  if (existing.docs[0]) {
    return payload.update({
      collection: 'media',
      data: { alt },
      file,
      id: existing.docs[0].id,
      overrideAccess: true,
    })
  }

  return payload.create({
    collection: 'media',
    data: { alt },
    file,
    overrideAccess: true,
  })
}

export const uploadPngToMedia = async ({
  alt,
  buffer,
  filename,
  payload,
}: {
  alt: string
  buffer: Buffer
  filename: string
  payload: Payload
}) => {
  return upsertMedia({ alt, buffer, filename, mimetype: 'image/png', payload })
}

export const uploadJpegToMedia = async ({
  alt,
  buffer,
  filename,
  payload,
}: {
  alt: string
  buffer: Buffer
  filename: string
  payload: Payload
}) => {
  return upsertMedia({ alt, buffer, filename, mimetype: 'image/jpeg', payload })
}
