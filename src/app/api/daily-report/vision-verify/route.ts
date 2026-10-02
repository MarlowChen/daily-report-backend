export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const runtime = 'nodejs'

type VisionVerifyBody = {
  imageBase64?: string
  model?: string
  roomName?: string
}

const roomVerificationSchema = {
  additionalProperties: false,
  properties: {
    confidence: {
      maximum: 1,
      minimum: 0,
      type: 'number',
    },
    isTargetRoomOpen: {
      type: 'boolean',
    },
    reason: {
      type: 'string',
    },
    screenState: {
      enum: ['target_room', 'wrong_room', 'search_results', 'unknown'],
      type: 'string',
    },
    visibleRoomName: {
      type: 'string',
    },
  },
  required: ['isTargetRoomOpen', 'visibleRoomName', 'confidence', 'reason', 'screenState'],
  type: 'object',
}

const isAuthorized = (request: Request) => {
  const hostname = new URL(request.url).hostname
  const isLocalDevRequest =
    process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(hostname)

  if (isLocalDevRequest) return true
  if (process.env.NODE_ENV !== 'production' && request.headers.get('x-daily-report-dev-relay') === '1') return true

  const sharedSecret = process.env.DAILY_REPORT_SHARED_SECRET

  if (!sharedSecret) return process.env.NODE_ENV !== 'production'

  return request.headers.get('x-daily-report-secret') === sharedSecret
}

const extractOpenRouterText = (responseBody: unknown) => {
  const body = responseBody as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string }>
      }
    }>
  }
  const content = body.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || '')
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

const stripJsonFence = (text: string) => {
  const trimmed = String(text || '').trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : trimmed
}

const promptForRoom = (roomName: string) =>
  [
    `Target LINE room/community name: ${roomName}`,
    '',
    'Look only at the current LINE desktop screenshot.',
    'Return isTargetRoomOpen=true only when the RIGHT chat panel is open to the target room/community.',
    'The strongest evidence is the right panel header/title matching the target room name.',
    'Do not mark true only because the target appears in the left search field or left search results.',
    'If the app is still showing search results, a wrong chat, or anything ambiguous, return false.',
    '',
    'Return only JSON with this exact shape:',
    '{"isTargetRoomOpen":boolean,"visibleRoomName":string,"confidence":number,"reason":string,"screenState":"target_room|wrong_room|search_results|unknown"}',
  ].join('\n')

export const POST = async (request: Request) => {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'OPENROUTER_API_KEY is not configured on the server' }, { status: 500 })
  }

  let body: VisionVerifyBody
  try {
    body = (await request.json()) as VisionVerifyBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const roomName = body.roomName?.trim()
  const imageBase64 = body.imageBase64?.replace(/^data:image\/\w+;base64,/, '')

  if (!roomName) return Response.json({ error: 'roomName is required' }, { status: 400 })
  if (!imageBase64) return Response.json({ error: 'imageBase64 is required' }, { status: 400 })

  const model = body.model || process.env.LINE_RELAY_VISION_MODEL || 'openai/gpt-4.1-mini'
  const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      messages: [
        {
          content: [
            {
              text: promptForRoom(roomName),
              type: 'text',
            },
            {
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
              type: 'image_url',
            },
          ],
          role: 'user',
        },
      ],
      model,
      response_format: {
        type: 'json_object',
      },
      temperature: 0,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.PAYLOAD_PUBLIC_SERVER_URL || 'https://crypto-v.zeabur.app',
      'X-Title': 'daily-report-line-relay',
    },
    method: 'POST',
  })

  const responseBody = await openRouterResponse.json().catch(() => null)
  if (!openRouterResponse.ok) {
    const message =
      (responseBody as { error?: { message?: string } } | null)?.error?.message ||
      `OpenRouter API failed with status ${openRouterResponse.status}`

    return Response.json({ error: message }, { status: 502 })
  }

  const responseText = extractOpenRouterText(responseBody)
  try {
    return Response.json({
      provider: 'openrouter-proxy',
      verification: JSON.parse(stripJsonFence(responseText)),
    })
  } catch {
    return Response.json(
      {
        error: `OpenRouter proxy returned non-JSON text: ${responseText.slice(0, 240)}`,
      },
      { status: 502 },
    )
  }
}

export const GET = () => Response.json({ error: 'Use POST' }, { status: 405 })
