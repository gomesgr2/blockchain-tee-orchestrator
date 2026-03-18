locals {
  regions = length(var.location_list) > 0 ? distinct(var.location_list) : [var.location]
}

resource "azurerm_resource_group" "rg_each" {
  for_each = toset(local.regions)
  name     = "${var.prefix}-rg-${each.key}"
  location = each.key
}

resource "azurerm_virtual_network" "vnet_each" {
  for_each            = azurerm_resource_group.rg_each
  name                = "${var.prefix}-vnet-${each.key}"
  address_space       = ["10.0.0.0/16"]
  location            = each.value.location
  resource_group_name = each.value.name
}

resource "azurerm_subnet" "subnet_each" {
  for_each              = azurerm_virtual_network.vnet_each
  name                  = "${var.prefix}-subnet-${each.key}"
  resource_group_name   = each.value.resource_group_name
  virtual_network_name  = each.value.name
  address_prefixes      = ["10.0.1.0/24"]
}
