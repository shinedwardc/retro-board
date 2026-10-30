output "url" {
  description = "The site, once the boot script finishes (about 5-10 minutes after apply)."
  value       = "https://${var.domain}"
}

output "public_ip" {
  description = "The server's public IPv4. It changes every time the server is recreated."
  value       = aws_instance.server.public_ip
}

locals {
  dns_automatic = "Automatic: the server points ${var.domain} at ${aws_instance.server.public_ip} on boot."
  dns_manual    = "Set an A record for ${var.domain} to ${aws_instance.server.public_ip} now, before the app starts."
}

output "dns" {
  description = "What to do about DNS."
  value       = local.use_duckdns ? local.dns_automatic : local.dns_manual
}

output "shell" {
  description = "Open a shell on the server (needs the Session Manager plugin for the AWS CLI), or use EC2 console > Connect > Session Manager."
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.server.id}"
}

output "setup_log" {
  description = "Run on the server to follow the first-boot setup."
  value       = "sudo tail -f /var/log/cloud-init-output.log"
}
