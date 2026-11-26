import { LegalDocument } from '@/components/LegalDocument';
import { TERMS } from '@/lib/legal';

/** Public terms of use: https://vicinityzambia.com/terms */
export default function Terms() {
  return <LegalDocument doc={TERMS} />;
}
