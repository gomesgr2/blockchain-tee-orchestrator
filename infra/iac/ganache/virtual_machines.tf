resource "azurerm_public_ip" "blockchain_pip" {
  name                = "${var.prefix}-pip-blockchain"
  location            = var.location
  resource_group_name = var.resource_group_name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_security_group" "blockchain_nsg" {
  name                = "${var.prefix}-nsg-blockchain"
  location            = var.location
  resource_group_name = var.resource_group_name

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
    name                       = "Ganache"
    priority                   = 1002
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8545"
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


resource "azurerm_network_interface" "blockchain_nic" {
  name                = "${var.prefix}-nic-blockchain"
  location            = var.location
  resource_group_name = var.resource_group_name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = var.subnet_id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.blockchain_pip.id
  }
}

resource "azurerm_network_interface_security_group_association" "blockchain_nsg_assoc" {
  network_interface_id      = azurerm_network_interface.blockchain_nic.id
  network_security_group_id = azurerm_network_security_group.blockchain_nsg.id
}

resource "azurerm_linux_virtual_machine" "blockchain_vm" {
  name                = "${var.prefix}-vm-blockchain"
  location            = var.location
  resource_group_name = var.resource_group_name
  size                = var.vm_size
  admin_username      = "ubuntu"

  network_interface_ids = [
    azurerm_network_interface.blockchain_nic.id,
  ]

  admin_ssh_key {
    username   = "ubuntu"
    public_key = var.public_key_ssh
  }

  os_disk {
    name                 = "${var.prefix}-osdisk-blockchain"
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
    set -e

    # ── 1. Install Docker ──────────────────────────────────────────
    apt-get update -y
    apt-get install -y docker.io
    systemctl enable docker     # ensure Docker starts on every reboot
    systemctl start docker

    # ── 2. Pull & start Ganache ────────────────────────────────────
    docker pull ${var.dockerhub_image_blockchain}

    if docker ps -a --format '{{.Names}}' | grep -q '^ganache$'; then
      docker restart ganache || docker start ganache
    else
      docker run --name ganache -d \
        --network=host \
        --restart always \
        ${var.dockerhub_image_blockchain}
    fi

    # ── 3. Systemd service — survives Spot evictions / reboots ─────
    cat > /etc/systemd/system/ganache.service <<'EOF'
    [Unit]
    Description=Ganache Ethereum node (Docker)
    After=docker.service
    Requires=docker.service

    [Service]
    Restart=always
    RestartSec=5
    ExecStart=/usr/bin/docker start -a ganache
    ExecStop=/usr/bin/docker stop ganache

    [Install]
    WantedBy=multi-user.target
    EOF

    systemctl daemon-reload
    systemctl enable ganache.service
  CUSTOM
  )

}
