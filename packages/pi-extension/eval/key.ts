/** Read TYPESAFE_API_KEY from the environment only. Never pass it as argv. */
export function typesafeKeyFromEnv(): string {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    console.error("TYPESAFE_API_KEY is missing from the environment (do not pass it as argv)");
    process.exit(1);
  }
  return key;
}
