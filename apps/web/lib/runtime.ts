import "server-only";

export function diagnosticsEnabled() {
  return process.env.ENABLE_DIAGNOSTIC_UI === "true";
}
