module "tees" {
  source = "./module/"
  count  = var.number_machines

  prefix                        = var.prefix
  resource_group_name           = var.resource_group_map[var.location_list[count.index]]
  account_index                 = count.index
  subnet_id                     = var.subnet_map[var.location_list[count.index]]
  public_key_ssh                = var.public_key_ssh
  location                      = var.location_list[count.index]
  manifest_path                 = var.manifest_path
  enclave_key_path              = var.enclave_key_path
  generate_public_ip            = var.generate_public_ip
  number_untrusted_containers   = var.number_untrusted_containers
}

output "public_ips" {
  value = module.tees[*].public_ip_sgx
}

output "private_ips" {
  value = module.tees[*].private_ip_sgx
}
