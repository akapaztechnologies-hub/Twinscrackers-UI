# ─── The site ────────────────────────────────────────────────────────────────

resource "cloudflare_pages_project" "site" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = var.production_branch

  # No `source` block: this is a Direct Upload project. Cloudflare cannot turn
  # a Git-connected project into one (or back), which is why deploy.ps1 refuses
  # to reuse a project it did not create here.

  lifecycle {
    # Runtime settings — the backend address the Functions read, the
    # compatibility date — travel with every upload in the wrangler.toml that
    # deploy.ps1 writes. A Pages project with a wrangler config takes its
    # settings from there, so Terraform leaves them alone rather than fight it.
    ignore_changes = [deployment_configs, build_config]
  }
}
