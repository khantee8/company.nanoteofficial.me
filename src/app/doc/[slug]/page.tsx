import { notFound } from 'next/navigation';
import { getDocSlugs, resolveDoc, readDoc } from '@/lib/doc';
import { DocView } from '@/components/doc/DocView';

export const dynamicParams = false;

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!resolveDoc(slug)) notFound();
  return <DocView en={readDoc(slug, 'en')} th={readDoc(slug, 'th')} />;
}
