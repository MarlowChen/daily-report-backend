import type { CollectionConfig } from 'payload'

import { staffOnly } from '@/access/roles'

export const DailyReports: CollectionConfig = {
  slug: 'dailyReports',
  admin: {
    useAsTitle: 'reportDate',
    defaultColumns: ['reportDate', 'status', 'sentAt', 'part1.generatedAt', 'part2.generatedAt', 'part3.generatedAt', 'updatedAt'],
    group: '專屬社群日報',
  },
  access: {
    read: staffOnly,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'reportDate',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: '日報日期',
      admin: {
        description: '格式：YYYY-MM-DD，以台灣時間為準。',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      label: '狀態',
      options: [
        { label: '草稿', value: 'draft' },
        { label: '已產生', value: 'generated' },
        { label: '已發送', value: 'sent' },
        { label: '失敗', value: 'failed' },
      ],
    },
    {
      name: 'sentAt',
      type: 'date',
      label: '發送時間',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'sentTarget',
      type: 'text',
      label: '發送目標',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'sentBy',
      type: 'text',
      label: '發送者',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'sentItemCount',
      type: 'number',
      label: '發送項目數',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'sentItems',
      type: 'array',
      label: '發送項目',
      admin: {
        readOnly: true,
      },
      fields: [
        {
          name: 'kind',
          type: 'text',
          label: '類型',
        },
        {
          name: 'label',
          type: 'text',
          label: '名稱',
        },
        {
          name: 'mediaId',
          type: 'text',
          label: 'Media ID',
        },
        {
          name: 'url',
          type: 'text',
          label: 'URL',
        },
      ],
    },
    {
      name: 'part1',
      type: 'group',
      label: 'Part 1 加密市場',
      fields: [
        {
          name: 'generatedAt',
          type: 'date',
          label: '產生時間',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'newsSourceUrl',
          type: 'text',
          label: '快訊來源',
        },
        {
          name: 'newsItems',
          type: 'array',
          label: '當日加密快訊',
          labels: {
            singular: '快訊',
            plural: '快訊',
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              label: '標題',
            },
            {
              name: 'url',
              type: 'text',
              required: true,
              label: '連結',
            },
            {
              name: 'source',
              type: 'text',
              label: '來源',
            },
            {
              name: 'excerpt',
              type: 'textarea',
              label: '摘要',
            },
          ],
        },
        {
          name: 'cryptobubblesScreenshot',
          type: 'upload',
          relationTo: 'media',
          label: 'Cryptobubbles MC 截圖',
        },
        {
          name: 'coin360Screenshot',
          type: 'upload',
          relationTo: 'media',
          label: 'Coin360 截圖',
        },
        {
          name: 'notes',
          type: 'textarea',
          label: '備註',
        },
      ],
    },
    {
      name: 'part2',
      type: 'group',
      label: 'Part 2 讀報區',
      fields: [
        {
          name: 'generatedAt',
          type: 'date',
          label: '產生時間',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'cteeSourceUrl',
          type: 'text',
          label: '工商時報來源',
        },
        {
          name: 'economicDailySourceUrl',
          type: 'text',
          label: '經濟日報來源',
        },
        {
          name: 'cteeNewspaperScreenshot',
          type: 'upload',
          relationTo: 'media',
          label: '工商時報電子版第 1 頁',
        },
        {
          name: 'cteeNewspaperPage2Screenshot',
          type: 'upload',
          relationTo: 'media',
          label: '工商時報電子版第 2 頁',
        },
        {
          name: 'cteeNewspaperPage3Screenshot',
          type: 'upload',
          relationTo: 'media',
          label: '工商時報電子版第 3 頁',
        },
        {
          name: 'economicDailyScreenshot',
          type: 'upload',
          relationTo: 'media',
          label: '經濟日報電子版第 1 頁',
        },
        {
          name: 'economicDailyPage2Screenshot',
          type: 'upload',
          relationTo: 'media',
          label: '經濟日報電子版第 2 頁',
        },
        {
          name: 'economicDailyPage3Screenshot',
          type: 'upload',
          relationTo: 'media',
          label: '經濟日報電子版第 3 頁',
        },
        {
          name: 'notes',
          type: 'textarea',
          label: '備註',
        },
      ],
    },
    {
      name: 'part3',
      type: 'group',
      label: 'Part 3 財經重點',
      fields: [
        {
          name: 'generatedAt',
          type: 'date',
          label: '產生時間',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'chinaSourceUrl',
          type: 'text',
          label: '兩岸財經來源',
        },
        {
          name: 'worldSourceUrl',
          type: 'text',
          label: '國際來源',
        },
        {
          name: 'usStockHeatmapSourceUrl',
          type: 'text',
          label: '美股市佔價格變化來源',
        },
        {
          name: 'globalStockCloseSourceUrl',
          type: 'text',
          label: '全球主要股市收盤來源',
        },
        {
          name: 'chinaDigestImage',
          type: 'upload',
          relationTo: 'media',
          label: '兩岸財經重點圖',
        },
        {
          name: 'worldDigestImage',
          type: 'upload',
          relationTo: 'media',
          label: '國際時事重點圖',
        },
        {
          name: 'usStockHeatmapImage',
          type: 'upload',
          relationTo: 'media',
          label: '美股市佔價格變化',
        },
        {
          name: 'globalStockCloseImage',
          type: 'upload',
          relationTo: 'media',
          label: '全球主要股市收盤',
        },
        {
          name: 'chinaItems',
          type: 'array',
          label: '兩岸財經重點',
          labels: {
            singular: '重點',
            plural: '重點',
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              label: '主標',
            },
            {
              name: 'summary',
              type: 'textarea',
              label: '內容',
            },
            {
              name: 'url',
              type: 'text',
              required: true,
              label: '連結',
            },
          ],
        },
        {
          name: 'worldItems',
          type: 'array',
          label: '國際重點',
          labels: {
            singular: '重點',
            plural: '重點',
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              label: '主標',
            },
            {
              name: 'summary',
              type: 'textarea',
              label: '內容',
            },
            {
              name: 'url',
              type: 'text',
              required: true,
              label: '連結',
            },
          ],
        },
        {
          name: 'notes',
          type: 'textarea',
          label: '備註',
        },
      ],
    },
    {
      name: 'errorLogs',
      type: 'array',
      label: '錯誤紀錄',
      admin: {
        readOnly: true,
      },
      fields: [
        {
          name: 'scope',
          type: 'text',
          label: '範圍',
        },
        {
          name: 'message',
          type: 'textarea',
          label: '錯誤訊息',
        },
        {
          name: 'occurredAt',
          type: 'date',
          label: '發生時間',
        },
      ],
    },
  ],
  timestamps: true,
}
