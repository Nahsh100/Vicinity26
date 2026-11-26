import { LegalDocument } from '@/components/LegalDocument';
import { PRIVACY_POLICY } from '@/lib/legal';

/** Public privacy policy: https://vicinityzambia.com/privacy */
export default function PrivacyPolicy() {
  return <LegalDocument doc={PRIVACY_POLICY} />;
}
