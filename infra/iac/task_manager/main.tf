resource "azurerm_linux_virtual_machine" "task_manager" {
  count               = var.task_manager_count
  name                = "${var.prefix}-tm-${count.index}"
  location            = var.task_manager_locations[count.index]
  resource_group_name = var.resource_group_map[var.task_manager_locations[count.index]]
  size                = var.task_manager_size

  admin_username = "ubuntu"

  os_disk {
    name                 = "${var.prefix}-tm-osdisk-${count.index}"
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-focal"
    sku       = "20_04-lts-gen2"
    version   = "latest"
  }

  custom_data = base64encode(<<-CUSTOM
    #!/bin/bash
    apt-get update
    apt-get install -y docker.io
    docker pull ${var.task_manager_image}

    docker run -d \
      --name task-manager \
      --restart always \
      -p 3000:3000 \
      -e PRIVATE_KEY="${var.tms_private_keys[count.index]}" \
      -e GANACHE_RPC="${var.ganache_rpc}" \
      -e CONTRACT_ADDRESS="${var.contract_address}" \
      -e ACCOUNT_INDEX="${count.index}" \
      -e TEE_IPS="${join(",", lookup(var.tees_by_location, var.task_manager_locations[count.index], []))}" \
      ${var.task_manager_image}
    CUSTOM
  )

  admin_ssh_key {
    username   = "ubuntu"
    public_key = var.public_key_ssh
  }
  network_interface_ids = [azurerm_network_interface.task_manager_ni[count.index].id]
}

resource "azurerm_network_interface" "task_manager_ni" {
  count               = var.task_manager_count
  name                = "${var.prefix}-tm-ni-${count.index}"
  location            = var.task_manager_locations[count.index]
  resource_group_name = var.resource_group_map[var.task_manager_locations[count.index]]

  ip_configuration {
    name                          = "internal"
    subnet_id                     = var.subnet_map[var.task_manager_locations[count.index]]
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.task_manager_pip[count.index].id
  }
}

resource "azurerm_network_interface_security_group_association" "task_manager_nsg_assoc" {
  count                     = var.task_manager_count
  network_interface_id      = azurerm_network_interface.task_manager_ni[count.index].id
  network_security_group_id = azurerm_network_security_group.task_manager_nsg[count.index].id
}

resource "azurerm_public_ip" "task_manager_pip" {
  count               = var.task_manager_count
  name                = "${var.prefix}-tm-pip-${count.index}"
  location            = var.task_manager_locations[count.index]
  resource_group_name = var.resource_group_map[var.task_manager_locations[count.index]]
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_security_group" "task_manager_nsg" {
  count = var.task_manager_count
  name  = "${var.prefix}-tm-nsg-${count.index}"
  location            = var.task_manager_locations[count.index]
  resource_group_name = var.resource_group_map[var.task_manager_locations[count.index]]

  security_rule {
    name                       = "SSH"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "TaskManagerUI"
    priority                   = 1002
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "3000"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowAllOutbound"
    priority                   = 2000
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}
