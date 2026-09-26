"use client";

import { DeleteWorkspace } from "@/components/delete-workspace";
import { ScGroup, ScRow } from "../settings-primitives";

export function DataSection({
  shopName,
  exporting,
  exportShopData,
}: {
  shopName: string;
  exporting: boolean;
  exportShopData: () => Promise<void>;
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
        <div className="sc-embed sc-pad">
          <DeleteWorkspace workspaceName={shopName} />
        </div>
      </ScGroup>
    </>
  );
}
