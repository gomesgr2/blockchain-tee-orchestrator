resource "azurerm_linux_virtual_machine" "vm_sgx" {
  name                = "${var.prefix}-vm-sgx-${var.account_index}"
  location            = var.location
  resource_group_name = var.resource_group_name
  size                = "Standard_DC1ds_v3"
  priority            = "Spot"
  eviction_policy     = "Deallocate"

  admin_username = "ubuntu"

  os_disk {
    name          = "${var.prefix}-osdisk-sgx-${var.account_index}"
    caching       = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-focal"
    sku       = "20_04-lts-gen2"
    version   = "latest"
  }

  custom_data = base64encode(<<-CUSTOM_DATA
    #!/bin/bash
    sudo apt-get update
    sudo apt-get install -y docker.io

    sudo pip3 install docker

  sudo docker pull ${var.tee_code_image}

    # If an enclave key file is provided via Terraform variable, write it to disk
    # so the container (or build steps) can use it. If not present, this is a no-op.
    if [ -n "${var.enclave_key_path}" ] && [ -f "${var.enclave_key_path}" ]; then
      echo "${file(var.enclave_key_path)}" > enclave-key.pem
    fi

    # If a manifest is provided, write it as well (some flows require it)
    if [ -n "${var.manifest_path}" ] && [ -f "${var.manifest_path}" ]; then
      echo '${file(var.manifest_path)}' > config.manifest
    fi

      sudo docker run -d \
        --name tee-node \
        --restart always \
        -p 9090:9090 \
        ${var.tee_code_image}

    CUSTOM_DATA
  )

  admin_ssh_key {
    username   = "ubuntu"
    public_key = var.public_key_ssh
  }

  network_interface_ids = [azurerm_network_interface.ni_sgx.id]
}
