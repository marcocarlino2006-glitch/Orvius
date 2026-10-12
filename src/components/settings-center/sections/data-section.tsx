"use client";

import { DeleteWorkspace } from "@/components/delete-workspace";
import { ScGroup, ScRow } from "../settings-primitives";

export function DataSection({
  shopName,
  planRenews,
  exporting,
  exportShopData,
  go,
}: {
  shopName: string;
  planRenews: boolean;
  exporting: boolean;
  exportShopData: () => Promise<void>;
  go: (section: "billing") => void;
}) {
  return (
    <>
      <ScGroup>
        <ScRow label="Export shop data" hint="Customers, leads, jobs, and money records as one JSON file.">
          <button type="button" className="sc-btn" disabled={exporting} onClick={() => void exportShopData()}>
            {exporting ? "Preparing…" : "Export"}
          </button>
        </ScRow>
      </ScGroup>
      <ScGroup title="Danger zone">
        {planRenews ? (
          <ScRow label="Delete workspace" hint="Cancel your plan on Billing first so you aren't charged again. Then you can delete.">
            <button type="button" className="sc-btn" onClick={() => go("billing")}>
              Go to Billing
            </button>
          </ScRow>
        ) : (
          <div className="sc-embed sc-pad">
            <DeleteWorkspace workspaceName={shopName} />
          </div>
        )}
      </ScGroup>
    </>
  );
}
