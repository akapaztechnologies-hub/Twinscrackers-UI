variable "account_id" {
  description = "The customer's Cloudflare account ID (Cloudflare dashboard -> the account's overview page)."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id must be the 32-character Cloudflare account ID."
  }
}

variable "project_name" {
  description = "The Pages project, which also names the free address: <project_name>.pages.dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?$", var.project_name))
    error_message = "project_name must be lower-case letters, digits and hyphens, at most 58 characters."
  }
}

variable "production_branch" {
  description = "The branch name uploads are published under. deploy.ps1 uploads to it, which makes the upload the live site."
  type        = string
  default     = "main"
}

variable "custom_domain" {
  description = "The customer's own address, e.g. sritharcrackers.com or www.sritharcrackers.com. Blank = only the pages.dev address."
  type        = string
  default     = ""
}

variable "zone_name" {
  description = <<-EOT
    The domain as it is listed in the customer's Cloudflare account, e.g.
    sritharcrackers.com. Only used with custom_domain. Blank = the custom domain
    itself, which is right when the site lives on the bare domain.
  EOT
  type        = string
  default     = ""
}
