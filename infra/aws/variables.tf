variable "domain" {
  description = "Hostname the site is served on, e.g. retro-yourname.duckdns.org. Caddy gets the HTTPS certificate for it."
  type        = string
}

variable "duckdns_token" {
  description = "DuckDNS token. When set, the server points the DuckDNS name in `domain` at its own IP on boot. Leave empty to set the DNS A record yourself."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT_SECRET for room-creator tokens. Leave empty to generate one; set it to reuse an existing secret so old creator tokens stay valid."
  type        = string
  default     = ""
  sensitive   = true
}

variable "region" {
  description = "AWS region. ap-northeast-2 is Seoul."
  type        = string
  default     = "ap-northeast-2"
}

variable "instance_type" {
  description = "EC2 instance type. t4g.* is ARM (Graviton) and cheapest; t3.* also works (the Ubuntu image is picked to match)."
  type        = string
  default     = "t4g.small"
}

variable "repo_url" {
  description = "Git repository the server clones and runs with Docker Compose."
  type        = string
  default     = "https://github.com/shinedwardc/retro-board.git"
}

variable "repo_ref" {
  description = "Branch or tag of repo_url to deploy."
  type        = string
  default     = "main"
}
