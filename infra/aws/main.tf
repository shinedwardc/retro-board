locals {
  name         = "retro-board"
  param_prefix = "/${local.name}"

  # Ubuntu publishes its AMI ids per architecture ("arm64" / "amd64"); use the one the instance type runs
  arch = contains(data.aws_ec2_instance_type.server.supported_architectures, "arm64") ? "arm64" : "amd64"

  # Whether a token was given isn't secret, only the token itself is
  use_duckdns = nonsensitive(var.duckdns_token != "")
}

# --- Lookups ------------------------------------------------------------------

data "aws_ec2_instance_type" "server" {
  instance_type = var.instance_type
}

# Latest Ubuntu 24.04 image, from the public parameter Canonical maintains in every region
data "aws_ssm_parameter" "ubuntu_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/${local.arch}/hvm/ebs-gp3/ami-id"
}

# The account's default VPC: public subnets with internet access, so no networking to build
data "aws_vpc" "default" {
  default = true
}

# Not every availability zone sells every instance type, so only use default subnets in zones that do
data "aws_ec2_instance_type_offerings" "server" {
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
  filter {
    name   = "availability-zone"
    values = data.aws_ec2_instance_type_offerings.server.locations
  }
}

# --- Firewall -----------------------------------------------------------------

# Only web traffic comes in. There is no SSH port: shell access goes through SSM Session Manager.
resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "HTTP and HTTPS from anywhere; all outbound"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each = {
    http  = { port = 80, protocol = "tcp" }
    https = { port = 443, protocol = "tcp" }
    http3 = { port = 443, protocol = "udp" } # Caddy serves HTTP/3 over QUIC
  }

  security_group_id = aws_security_group.web.id
  description       = each.key
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = each.value.port
  to_port           = each.value.port
  ip_protocol       = each.value.protocol
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.web.id
  description       = "Pull images, packages and the repo; reach DuckDNS and Let's Encrypt"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- Secrets ------------------------------------------------------------------

# Stored as SecureStrings in SSM Parameter Store (encrypted with the free AWS-managed key).
# The server reads them at boot, so they never appear in user data or the EC2 console.
# They are also in the Terraform state file, which is why that file must stay out of git.

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "postgres_password" {
  name  = "${local.param_prefix}/POSTGRES_PASSWORD"
  type  = "SecureString"
  value = random_password.postgres.result
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "${local.param_prefix}/JWT_SECRET"
  type  = "SecureString"
  value = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt.result
}

resource "aws_ssm_parameter" "duckdns_token" {
  count = local.use_duckdns ? 1 : 0

  name  = "${local.param_prefix}/DUCKDNS_TOKEN"
  type  = "SecureString"
  value = var.duckdns_token
}

# --- IAM role for the server -------------------------------------------------

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "server" {
  name               = "${local.name}-server"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# Lets you open a shell with Session Manager (no SSH keys, no open port 22).
# It also grants ssm:GetParameter, which is how the boot script reads the secrets above.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "server" {
  name = "${local.name}-server"
  role = aws_iam_role.server.name
}

# --- The server ---------------------------------------------------------------

resource "aws_instance" "server" {
  ami                         = data.aws_ssm_parameter.ubuntu_ami.insecure_value
  instance_type               = var.instance_type
  subnet_id                   = sort(data.aws_subnets.default.ids)[0]
  iam_instance_profile        = aws_iam_instance_profile.server.name
  vpc_security_group_ids      = [aws_security_group.web.id]
  associate_public_ip_address = true

  # First-boot script: DNS, Docker, secrets, then `docker compose up`
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    region            = var.region
    param_prefix      = local.param_prefix
    domain            = var.domain
    repo_url          = var.repo_url
    repo_ref          = var.repo_ref
    use_duckdns       = local.use_duckdns
    duckdns_subdomain = trimsuffix(var.domain, ".duckdns.org")
  })
  # The script only runs on first boot, so a changed script needs a new server
  user_data_replace_on_change = true

  # Require IMDSv2 tokens for the instance metadata service (blocks SSRF-style credential theft)
  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = local.name
  }

  lifecycle {
    # Canonical publishes new images often; don't replace a running server just because of that
    ignore_changes = [ami]

    precondition {
      condition     = !local.use_duckdns || endswith(var.domain, ".duckdns.org")
      error_message = "duckdns_token is set, so domain must be a <name>.duckdns.org hostname."
    }
    precondition {
      condition     = length(data.aws_subnets.default.ids) > 0
      error_message = "No default subnet in ${var.region} offers ${var.instance_type}. Pick another instance_type, or recreate the default VPC (VPC console > Actions > Create default VPC)."
    }
  }

  # The parameters must exist before the boot script tries to read them
  depends_on = [
    aws_ssm_parameter.postgres_password,
    aws_ssm_parameter.jwt_secret,
    aws_ssm_parameter.duckdns_token,
  ]
}
