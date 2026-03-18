output "ganache_public_ip" {
  value = azurerm_public_ip.blockchain_pip.ip_address
}
