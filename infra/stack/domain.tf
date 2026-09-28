# ─── The customer's own address (optional) ───────────────────────────────────
#
# Only when custom_domain is set, and only for a domain whose DNS is in the same
# Cloudflare account — the DNS record is created here, and Cloudflare validates
# the domain and issues its certificate on its own. Allow a few minutes after
# the first apply before the address answers.

locals {
  has_domain = var.custom_domain != ""
  zone_name  = var.zone_name != "" ? var.zone_name : var.custom_domain
}

data "cloudflare_zone" "site" {
  count = local.has_domain ? 1 : 0

  filter = {
    name = local.zone_name
  }
}

# Proxied, so Cloudflare answers for the address; on the bare domain Cloudflare
# flattens the CNAME, which is what lets example.com point at a pages.dev name.
resource "cloudflare_dns_record" "site" {
  count = local.has_domain ? 1 : 0

  zone_id = data.cloudflare_zone.site[0].zone_id
  name    = var.custom_domain
  type    = "CNAME"
  content = cloudflare_pages_project.site.subdomain
  ttl     = 1
  proxied = true
}

resource "cloudflare_pages_domain" "site" {
  count = local.has_domain ? 1 : 0

  account_id   = var.account_id
  project_name = cloudflare_pages_project.site.name
  name         = var.custom_domain

  depends_on = [cloudflare_dns_record.site]
}
