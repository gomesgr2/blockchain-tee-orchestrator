output "task_manager_private_ips" {
  value = azurerm_network_interface.task_manager_ni[*].private_ip_address
}

output "task_manager_public_ips" {
  value = azurerm_public_ip.task_manager_pip[*].ip_address
}
