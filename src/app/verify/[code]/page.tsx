import PublicVerificationClient from './PublicVerificationClient';

export function generateStaticParams() {
  return [{ code: 'placeholder' }];
}

export default function PublicVerificationPage() {
  return <PublicVerificationClient />;
}
