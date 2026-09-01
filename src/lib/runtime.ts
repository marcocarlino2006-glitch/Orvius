export function isProduction() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
