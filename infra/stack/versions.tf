# ─────────────────────────────────────────────────────────────────────────────
# One customer's storefront on Cloudflare Pages, in the customer's own
# Cloudflare account.
#
# Run it through ../deploy.ps1, not by hand. The script reads the customer's
# file, hands this module the account and the Cloudflare login, builds the site
# with that customer's settings and uploads it (Direct Upload — there is no Git
# connection, so pushing to GitHub publishes nothing).
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5"

  # The same private, versioned bucket the backend's Terraform uses, in the
  # customer's GCP project, under its own prefix — one place per customer for
  # everything Terraform knows. deploy.ps1 passes bucket and prefix at init.
  backend "gcs" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# The API token comes from CLOUDFLARE_API_TOKEN, which deploy.ps1 sets from the
# customer file for the length of the run. It is never a variable, so it never
# lands in state or in a plan.
provider "cloudflare" {}
