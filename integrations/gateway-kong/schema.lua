-- Kong plug-in schema for pl-receipts.

return {
  name = "pl-receipts",
  fields = {
    { config = {
        type = "record",
        fields = {
          { tenant_id    = { type = "string", required = true } },
          { ingest_url   = { type = "string", required = true } },
          { ingest_token = { type = "string", required = false } },
        },
    } },
  },
}
