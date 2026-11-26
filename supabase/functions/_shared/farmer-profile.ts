/**
 * farmer-profile — allowlisted, crop-agnostic profile payload validation.
 * Identity never comes from this payload; farmer-auth-core binds the write to
 * the verified session before applying these patches.
 */

export type FarmerProfilePatch = Record<string, unknown>;
export type FarmerProfilePatches = { farmer: FarmerProfilePatch; profile: FarmerProfilePatch };
export type FarmerProfileValidation =
  | { ok: true; patches: FarmerProfilePatches }
  | { ok: false; error: "invalid_profile" };

const LANGUAGES = new Set(["en", "hi", "mr", "pa", "gu", "te", "ta", "kn", "ml", "or", "bn", "ur", "ne"]);

function text(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_text");
  const result = value.trim();
  if (result.length > maxLength) throw new Error("text_too_long");
  return result || null;
}

function nonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("invalid_number");
  return value;
}

function nonNegativeInteger(value: unknown): number | null {
  const result = nonNegativeNumber(value);
  if (result !== null && !Number.isInteger(result)) throw new Error("invalid_integer");
  return result;
}

function bool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") throw new Error("invalid_boolean");
  return value;
}

function date(value: unknown): string | null {
  const result = text(value, 10);
  if (result !== null && !/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("invalid_date");
  return result;
}

function crops(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length > 50) throw new Error("invalid_crops");
  return value.map((crop) => {
    const result = text(crop, 100);
    if (!result) throw new Error("invalid_crop");
    return result;
  });
}

const FARMER_TRIGGER_PROFILE_COLUMNS = [
  "full_name", "display_name", "mobile_number", "date_of_birth", "gender",
  "village", "taluka", "district", "state", "pincode",
] as const;

/**
 * handle_farmer_update rewrites these profile columns from farmers.metadata on
 * every farmer update, even when metadata did not change. Reapply the existing
 * values after that write unless the caller explicitly supplied a new value.
 */
export function preserveTriggerManagedProfileFields(
  patch: FarmerProfilePatch,
  existing: FarmerProfilePatch | null,
  farmerWillChange: boolean,
): FarmerProfilePatch {
  if (!farmerWillChange || !existing) return patch;
  const preserved = { ...patch };
  for (const column of FARMER_TRIGGER_PROFILE_COLUMNS) {
    if (preserved[column] === undefined && existing[column] !== undefined) {
      preserved[column] = existing[column];
    }
  }
  return preserved;
}

/** Only these profile-owned columns can be written; all other keys are ignored. */
export function validateFarmerProfilePayload(input: unknown): FarmerProfileValidation {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_profile" };
    const source = input as Record<string, unknown>;
    const farmer: FarmerProfilePatch = {};
    const profile: FarmerProfilePatch = {};

    const assignText = (key: string, maxLength: number, farmerColumn?: string, profileColumn?: string) => {
      if (source[key] === undefined) return;
      const value = text(source[key], maxLength);
      if (farmerColumn) farmer[farmerColumn] = value;
      if (profileColumn) profile[profileColumn] = value;
    };
    const assignNumber = (key: string, farmerColumn: string, profileColumn?: string, integer = false) => {
      if (source[key] === undefined) return;
      const value = integer ? nonNegativeInteger(source[key]) : nonNegativeNumber(source[key]);
      farmer[farmerColumn] = value;
      if (profileColumn) profile[profileColumn] = value;
    };
    const assignBool = (key: string, farmerColumn: string, profileColumn?: string) => {
      if (source[key] === undefined) return;
      const value = bool(source[key]);
      farmer[farmerColumn] = value;
      if (profileColumn) profile[profileColumn] = value;
    };

    assignText("fullName", 255, "farmer_name", "full_name");
    assignText("displayName", 100, undefined, "display_name");
    if (source.dateOfBirth !== undefined) profile.date_of_birth = date(source.dateOfBirth);
    assignText("gender", 20, undefined, "gender");
    assignText("email", 254, undefined, "email");
    assignText("bio", 2000, undefined, "bio");
    assignText("aadhaarNumber", 20, "aadhaar_number", "aadhaar_number");
    assignText("preferredContactMethod", 20, "preferred_contact_method");
    assignText("addressLine1", 255, undefined, "address_line1");
    assignText("addressLine2", 255, undefined, "address_line2");
    assignText("village", 100, undefined, "village");
    assignText("taluka", 100, undefined, "taluka");
    assignText("district", 100, undefined, "district");
    assignText("state", 100, undefined, "state");
    assignText("pincode", 10, undefined, "pincode");
    assignNumber("totalLandAcres", "total_land_acres", "total_land_acres");
    assignNumber("farmingExperienceYears", "farming_experience_years", "farming_experience_years", true);
    assignText("farmType", 50, "farm_type");
    assignBool("hasLoan", "has_loan");
    assignNumber("loanAmount", "loan_amount");
    assignBool("hasTractor", "has_tractor", "has_tractor");
    assignBool("hasIrrigation", "has_irrigation", "has_irrigation");
    assignText("irrigationType", 50, "irrigation_type");
    assignBool("hasStorage", "has_storage", "has_storage");
    assignText("annualIncomeRange", 50, "annual_income_range", "annual_income_range");
    assignText("notes", 5000, "notes");
    assignText("avatarUrl", 2048, undefined, "avatar_url");

    if (source.primaryCrops !== undefined) {
      const value = crops(source.primaryCrops);
      farmer.primary_crops = value;
      profile.primary_crops = value;
    }
    if (source.preferredLanguage !== undefined) {
      const value = text(source.preferredLanguage, 3);
      if (value !== null && !LANGUAGES.has(value)) throw new Error("invalid_language");
      farmer.language_preference = value;
      profile.preferred_language = value;
    }

    if (Object.keys(farmer).length + Object.keys(profile).length === 0) {
      return { ok: false, error: "invalid_profile" };
    }
    return { ok: true, patches: { farmer, profile } };
  } catch {
    return { ok: false, error: "invalid_profile" };
  }
}
