import { OnboardingClient } from "./onboarding-client";

export default async function BusinessOnboardingPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return <OnboardingClient businessId={businessId} />;
}
