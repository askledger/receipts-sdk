-- Kong plug-in: pl-receipts
-- Emits a Project Ledger receipt for every upstream LLM call routed
-- through Kong. Body capture happens in the response phase so we
-- carry tokens, latency, and status.

local cjson  = require "cjson.safe"
local sha256 = require "resty.sha256"
local http   = require "resty.http"

local PLReceipts = {
  PRIORITY = 800,
  VERSION  = "0.1.0",
}

local function hex(b)
  return (b:gsub('.', function(c) return string.format('%02x', string.byte(c)) end))
end

local function sha(s)
  local d = sha256:new(); d:update(s or ""); return hex(d:final())
end

local function vendor_for(model)
  model = (model or ""):lower()
  if model:sub(1,6) == "claude" then return "anthropic" end
  if model:sub(1,3) == "gpt"    then return "openai" end
  if model:find("gemini", 1, true) then return "google" end
  if model:find("bedrock", 1, true) then return "aws-bedrock" end
  return "openai-compatible"
end

function PLReceipts:access(conf)
  local body = kong.request.get_raw_body() or ""
  kong.ctx.plugin.req_body = body
  kong.ctx.plugin.t0 = ngx.now()
end

function PLReceipts:body_filter(conf)
  local chunk = ngx.arg[1]
  if chunk then
    kong.ctx.plugin.resp_body = (kong.ctx.plugin.resp_body or "") .. chunk
  end
end

function PLReceipts:log(conf)
  local req_body  = kong.ctx.plugin.req_body or ""
  local resp_body = kong.ctx.plugin.resp_body or ""
  local parsed    = cjson.decode(req_body) or {}
  local model     = parsed.model or "unknown"
  local prompt    = cjson.encode(parsed.messages or parsed.prompt or "") or ""

  local event = {
    schema_version = "1.0",
    tenant_id      = conf.tenant_id,
    event_type     = "gateway.request",
    source_system  = "kong-pl-receipts",
    event_id       = "kong-" .. tostring(ngx.now() * 1000) .. "-" .. sha(prompt):sub(1, 12),
    captured_at    = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    subject        = { ai_vendor = vendor_for(model), ai_model = model },
    payload        = {
      input_hash         = sha(prompt),
      output_hash        = sha(resp_body),
      http_status        = kong.response.get_status(),
      latency_ms         = math.floor((ngx.now() - (kong.ctx.plugin.t0 or ngx.now())) * 1000),
      input_classification = "internal",
    },
  }

  local hc = http.new()
  hc:set_timeout(2000)
  local _, err = hc:request_uri(conf.ingest_url, {
    method  = "POST",
    headers = {
      ["content-type"] = "application/json",
      ["authorization"] = "Bearer " .. (conf.ingest_token or ""),
      ["x-pl-source"]   = "kong",
    },
    body = cjson.encode(event),
  })
  if err then kong.log.warn("pl-receipts ingest failed: ", err) end
end

return PLReceipts
