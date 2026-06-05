import { readDoc, DOC_HOME } from '@/lib/doc';
import { DocView } from '@/components/doc/DocView';

export default function DocHome() {
  return <DocView en={readDoc(DOC_HOME, 'en')} th={readDoc(DOC_HOME, 'th')} />;
}
