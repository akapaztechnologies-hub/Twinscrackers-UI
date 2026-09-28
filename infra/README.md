# Storefront infrastructure (Cloudflare Pages)

`deploy.ps1` + `stack/` create a customer's storefront in **their own**
Cloudflare account, build this folder with that customer's settings, and
publish it. It is the frontend half of the backend's `infra/deploy.ps1`.

## A new customer

1. Do the backend first. Its deploy prints the backend address, and it creates
   the state bucket this one also uses.
2. In the customer's Cloudflare account, create an API token
   (My Profile -> API Tokens -> Create Token -> Custom token):
   - Account | Cloudflare Pages | Edit
   - Zone | DNS | Edit, and Zone | Zone | Read (only for a custom domain)
3. Copy `customers/_template.env` to `customers/<customer>.env` and fill it in.
   It is gitignored because it holds that token.
4. From the frontend folder:

   ```powershell
   .\infra\deploy.ps1 <customer>
   ```

   Terraform shows its plan and asks you to type `apply`, then the site is
   built and uploaded. It is live at `<project>.pages.dev` straight away. A
   custom domain can take a few minutes to get its certificate.

## Everyday use

| To | Run |
|---|---|
| Publish a code change | `.\infra\deploy.ps1 <customer> -CodeOnly` |
| Change a setting or the domain | edit `customers/<customer>.env`, then `.\infra\deploy.ps1 <customer>` |
| See what would change, change nothing | `.\infra\deploy.ps1 <customer> -PlanOnly` |

Pushing to GitHub does **not** publish these sites. Only `deploy.ps1` does.

## Good to know

- Every `VITE_` setting comes from the customer file, never from this
  folder's `.env`. A setting left blank there is built blank.
- The upload writes its own `wrangler.toml` with the customer's project name
  and backend address. The repo's `wrangler.toml` is only for running locally.
- A site already connected to GitHub cannot be taken over. Cloudflare cannot
  turn a Git-connected project into an upload project. Create a new project
  here, then move the domain over once it is live.
- To roll back, open the project in the Cloudflare dashboard, go to
  Deployments, and use "Rollback" on an earlier upload.
