output "project_name" {
  description = "The Pages project deploy.ps1 uploads to."
  value       = cloudflare_pages_project.site.name
}

output "production_branch" {
  description = "Uploads to this branch go live."
  value       = cloudflare_pages_project.site.production_branch
}

output "pages_url" {
  description = "The free Cloudflare address, live as soon as the first upload finishes."
  value       = "https://${cloudflare_pages_project.site.subdomain}"
}

output "site_url" {
  description = "The customer's own address when one is connected, otherwise the pages.dev one."
  value       = local.has_domain ? "https://${var.custom_domain}" : "https://${cloudflare_pages_project.site.subdomain}"
}
