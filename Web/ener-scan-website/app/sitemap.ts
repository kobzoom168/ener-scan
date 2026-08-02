import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://my-ener.uk'
  return [
    {
      url: `${base}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/en/`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${base}/about/`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/en/about/`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/news/`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${base}/en/news/`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]
}
