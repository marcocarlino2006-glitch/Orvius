/**
 * Provision dedicated lines for every active customer shop missing one.
 * Summit (demo) is skipped by design.
 */
import { repairAllCustomerShopLines } from "../src/lib/provision-business";

async function main() {
  console.log("\n📞 Provisioning missing customer shop lines\n");
  const results = await repairAllCustomerShopLines();
  let failed = 0;
  for (const row of results) {
    if (row.error) {
      failed += 1;
      console.log(`❌ ${row.name}: ${row.error}`);
    } else {
      console.log(`✅ ${row.name}: ${row.line ?? "n/a"}`);
    }
  }
  console.log(
    `\nDone — ${results.length - failed}/${results.length} shops OK\n`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
