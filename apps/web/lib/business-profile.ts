import type { Offering, OfferingVersion } from "@/lib/api";

export function confirmedBusinessProfile(offering: Offering): OfferingVersion | undefined {
  return offering.versions.find(
    (version) =>
      version.is_active &&
      version.is_callable &&
      version.analysis_method !== null &&
      version.profile_source_count > 0,
  );
}
