resource "azurerm_storage_account" "pgc_storage" {
  name                     = var.storage_account_name
  resource_group_name      = azurerm_resource_group.rg_each[local.regions[0]].name
  location                 = local.regions[0]
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_container" "pdf_container" {
  name                  = "inputs"
  storage_account_name  = azurerm_storage_account.pgc_storage.name
  container_access_type = "blob"
}
