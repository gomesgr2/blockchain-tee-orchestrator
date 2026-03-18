output "ganache_public_ip" {
  value = module.ganache.ganache_public_ip
}

output "task_manager_private_ips" {
  value = module.task_manager.task_manager_private_ips
}

output "tee_public_ips" {
  value = module.tees.public_ips
}

output "task_manager_public_ips" {
  value = module.task_manager.task_manager_public_ips
}
