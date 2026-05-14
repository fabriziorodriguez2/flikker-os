import { redirect } from "next/navigation";

export default async function BusinessOnboardingPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`/onboarding?businessId=${encodeURIComponent(businessId)}`);
}
