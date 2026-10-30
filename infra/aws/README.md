# retro-board on AWS (Terraform)

One command creates an EC2 server in Seoul that runs the same `docker-compose.yml` as any other host (see `docs/self-hosting.md`). A second command deletes all of it. The idea is to run it only while you're using it and pay by the hour.

## What it creates

| Resource | Why |
|---|---|
| EC2 `t4g.small` (ARM, 2 vCPU / 2 GB), Ubuntu 24.04, 20 GB encrypted gp3 disk | The server. Placed in a default-VPC subnet whose zone offers the instance type |
| Security group | Lets in only 80/tcp, 443/tcp and 443/udp. **No SSH port** |
| IAM role + instance profile (`AmazonSSMManagedInstanceCore`) | Shell access through SSM Session Manager, and permission to read the secrets below |
| 2–3 SSM Parameter Store SecureStrings under `/retro-board/` | `POSTGRES_PASSWORD`, `JWT_SECRET` (generated unless you pass one), and the DuckDNS token |

The instance requires IMDSv2. The first-boot script (`user-data.sh.tftpl`) does this:
1. Points your DuckDNS name at the server's new IP.
2. Installs Docker and adds 2 GB of swap.
3. Clones this repo and writes `.env` from Parameter Store.
4. Runs `docker compose up -d --build`.

**No Elastic IP:** the server is destroyed between sessions, so a fixed IP wouldn't help, and keeping one allocated while idle costs money. DuckDNS follows the IP instead.

## Cost

Roughly **$0.70 per day while it exists** in Seoul, for the instance, its public IPv4 and the disk. It's **$0 after `terraform destroy`**. Check the [AWS pricing calculator](https://calculator.aws/) for current numbers.

Set up the budget alert in `budget/` once, before anything else (below).

## Before the first run

1. **Install tools:** Terraform ≥ 1.6, plus the AWS CLI with the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) if you want a shell from your terminal.
2. **AWS credentials:** create an IAM user (or IAM Identity Center user) for yourself. Don't use the root account. Give it admin permissions for now, then run `aws configure` (or `aws configure sso`). Check with `aws sts get-caller-identity`.
3. **DuckDNS:** log in at [duckdns.org](https://www.duckdns.org) and create a subdomain (e.g. `retro-yourname`). Copy your token.
4. **Budget alert (once):**
   ```bash
   cd infra/aws/budget
   terraform init
   terraform apply -var 'email=you@example.com'     # confirm the email AWS sends you
   ```

## Run it

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars    # set domain and duckdns_token
terraform init                                  # first time only
terraform apply                                 # review the plan, type "yes"
```

Wait **5–10 minutes**: the server builds the Docker images on first boot. Then open the `url` output. To watch progress, open a shell (`shell` output, or EC2 console → the instance → **Connect** → **Session Manager**) and run `sudo tail -f /var/log/cloud-init-output.log`. It ends with `==> Done`.

## Tear it down

```bash
terraform destroy
```

This deletes everything in this folder, **including the database**. Rooms and notes created on the server are gone, which is fine for a demo. The next `apply` starts with a fresh server, fresh secrets (unless `jwt_secret` is set) and an empty database.

## Things to know

- **State file:** `terraform.tfstate` contains the generated passwords. It's gitignored here, so keep it that way and don't share it.
- **Certificate limits:** each new server asks for a new HTTPS certificate, and Let's Encrypt allows 5 certificates per hostname per week. If you `apply` more often than that, Caddy falls back to ZeroSSL on its own. If both fail, wait a few days or use a second DuckDNS name.
- **Deploying new code while the server runs:** in a Session Manager shell, run `cd /opt/retro-board && sudo git pull && sudo docker compose up -d --build`. To deploy a different branch from scratch, set `repo_ref` and `apply`.
- **Changing `user-data.sh.tftpl`** replaces the server on the next `apply`, because the script only runs on first boot.
- **Instance types:** to switch to x86 (e.g. `t3.small`), change `instance_type`; the Ubuntu image is picked to match.
- **Default VPC:** the stack needs your account's default VPC. If it was deleted, recreate it in the VPC console (Actions → Create default VPC).
