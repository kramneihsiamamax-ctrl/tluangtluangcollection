import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is static + client-rendered; data comes from Supabase in the browser.
export default defineCloudflareConfig({});
