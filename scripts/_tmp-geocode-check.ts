import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createGoogleGeocoder } from "../src/lib/providers/google-geocoding";

async function main() {
  const geocoder = createGoogleGeocoder({
    apiKey: process.env.GOOGLE_MAPS_API_KEY!,
  });
  console.log("Columbus:", await geocoder.geocode("Columbus, Ohio"));
  console.log("garbage:", await geocoder.geocode("zzqx asdfqwerty nowhere"));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
