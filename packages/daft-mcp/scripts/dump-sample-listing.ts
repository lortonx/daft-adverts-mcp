import { writeFileSync } from "node:fs";
import { DaftApi } from "@daft-ie/api";

const outFile =
  process.env.OUT_FILE ??
  "F:/aiprojects/daft.ie/packages/daft-mcp/tests/logs/sample-listing.json";

const daft = new DaftApi({
  platform: "android",
  appVersion: "9.8.1",
  refreshToken: process.env.DAFT_REFRESH_TOKEN,
  authToken: process.env.DAFT_ACCESS_TOKEN,
  timeout: 15000,
});

const search = await daft.searchForRent({ county: "dublin", pageSize: 1 });
const id = search.listings[0]?.listing?.id;
if (!id) throw new Error("no listing id");

const details = await daft.getPropertyDetails(id);
const payload = {
  listingId: id,
  searchHit: search.listings[0],
  propertyDetails: details,
};

writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
console.log(
  JSON.stringify({
    saved: outFile,
    id,
    title: details.listing?.title,
  })
);
