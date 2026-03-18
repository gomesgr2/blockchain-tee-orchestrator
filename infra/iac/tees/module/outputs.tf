output "public_ip_sgx" {
  value = join("", azurerm_public_ip.public_ip_sgx[*].ip_address)
}

output "private_ip_sgx" {
  value = azurerm_network_interface.ni_sgx.private_ip_address
}
