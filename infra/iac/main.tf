locals {
  machine_locations      = length(var.location_list) > 0 ? var.location_list : [for i in range(var.number_machines) : var.location]
  task_manager_locations = length(var.task_manager_location_list) > 0 ? var.task_manager_location_list : [for i in range(var.task_manager_count) : var.location]

  tees_by_location = {
    for loc in distinct(local.machine_locations) : loc => [
      for i, m_loc in local.machine_locations : module.tees.private_ips[i] if m_loc == loc
    ]
  }
}

module "ganache" {
  source                     = "./ganache"
  prefix                     = var.prefix
  location                   = var.location_list[0]
  resource_group_name        = azurerm_resource_group.rg_each[var.location_list[0]].name
  subnet_id                  = azurerm_subnet.subnet_each[var.location_list[0]].id
  public_key_ssh             = var.public_key_ssh
  dockerhub_image_blockchain = var.dockerhub_image_blockchain
  vm_size                    = var.blockchain_vm_size
}

module "tees" {
  source                      = "./tees"
  number_machines             = var.number_machines
  prefix                      = var.prefix
  location_list               = local.machine_locations
  resource_group_map          = { for k, v in azurerm_resource_group.rg_each : k => v.name }
  subnet_map                  = { for k, v in azurerm_subnet.subnet_each : k => v.id }
  public_key_ssh              = var.public_key_ssh
  manifest_path               = var.manifest_path
  enclave_key_path            = var.enclave_key_path
  generate_public_ip          = length(var.generate_public_ip) > 0 ? var.generate_public_ip : var.generate_public_ip_defaults
  number_untrusted_containers = var.number_untrusted_containers
}

module "task_manager" {
  source                     = "./task_manager"
  task_manager_count         = var.task_manager_count
  task_manager_locations     = local.task_manager_locations
  prefix                     = var.prefix
  task_manager_size          = var.task_manager_size
  resource_group_map         = { for k, v in azurerm_resource_group.rg_each : k => v.name }
  subnet_map                 = { for k, v in azurerm_subnet.subnet_each : k => v.id }
  task_manager_image         = var.task_manager_image
  tms_private_keys           = var.tms_private_keys
  ganache_rpc                = "http://${module.ganache.ganache_public_ip}:8545"
  contract_address           = var.contract_address
  tees_by_location           = local.tees_by_location
  public_key_ssh             = var.public_key_ssh
}
