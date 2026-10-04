import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://dentalcare-oohg.vercel.app';
  const now = new Date();

  const treatmentPages = [
    'dental-implants',
    'root-canal',
    'braces-aligners',
    'tooth-pain',
    'teeth-cleaning',
    'wisdom-tooth',
    'crown-bridge',
    'gum-treatment',
    'cosmetic-dentistry',
    'pediatric-dentistry'
  ];

  return [
    { url: base + '/patient-search', lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: base + '/find-dentist', lastModified: now, changeFrequency: 'weekly', priority: 0.95 },
    { url: base + '/dentists', lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ...treatmentPages.map(slug => ({
      url: base + '/find-dentist/' + slug,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9
    }))
  ];
}
